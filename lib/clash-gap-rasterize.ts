import '@/lib/uint8-polyfill'
import { apiFetch } from '@/lib/api'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type PresignPage = { page_index: number; storagePath: string; token: string; signedUrl: string }
type PresignResponse = { bucket: string; pages: PresignPage[] }

const MAX_DIM = 2200
const JPEG_QUALITY = 0.82
const RENDER_CONCURRENCY = 3
const MAX_INFLIGHT = 12
const PRESIGN_CHUNK = 50
const PRESIGN_CONCURRENCY = 3
const REGISTER_FLUSH = 25
const PER_PAGE_ATTEMPTS = 3

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString()
      return pdfjs
    })
  }
  return pdfjsPromise
}

function createSemaphore(max: number) {
  let active = 0
  const queue: Array<() => void> = []
  const runNext = () => {
    if (active >= max) return
    const next = queue.shift()
    if (!next) return
    active++
    next()
  }
  return {
    acquire: () =>
      new Promise<void>((resolve) => {
        queue.push(resolve)
        runNext()
      }),
    release: () => {
      active = Math.max(0, active - 1)
      runNext()
    },
  }
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode page image'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

async function withConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const safe = Math.max(1, Math.min(limit, items.length || 1))
  let next = 0
  async function runner() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      await worker(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: safe }, () => runner()))
}

async function retry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Operation failed')
}

export type RasterizeProgress = { processed: number; total: number; pageLabel: string }

export type RasterizeResult = { pages: number; rendered: number; skipped: number }

/**
 * Render every page of `file` to a JPEG in the browser, upload each via a
 * presigned URL, and register it as a sheet row. Renders and uploads run as a
 * bounded parallel pipeline (render is CPU-bound and throttled; uploads run
 * wide). Resumable: pages already uploaded (per the server's done-list) are
 * skipped. Throws if any page can't be rendered/uploaded after retries, so the
 * chunk stage never silently falls back to downloading the big file server-side.
 */
export async function rasterizePdfPages(params: {
  analysisId: string
  fileId: string
  file: File
  fileLabel?: string
  onProgress?: (p: RasterizeProgress) => void
  signal?: AbortSignal
}): Promise<RasterizeResult> {
  const { analysisId, fileId, file, fileLabel, onProgress, signal } = params
  const label = fileLabel || file.name
  const base = `/api/clash-gap/analyses/${analysisId}/files/${fileId}/pages`

  const supabase = createSupabaseBrowserClient()
  if (!supabase) throw new Error('Storage client unavailable')

  const pdfjs = await getPdfjs()
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data, disableAutoFetch: true, disableStream: true }).promise

  try {
    const total = doc.numPages

    let done = new Set<number>()
    try {
      const res = await apiFetch<{ done: number[] }>(base)
      done = new Set(res.done || [])
    } catch {
    }

    const pending: number[] = []
    for (let i = 0; i < total; i++) if (!done.has(i)) pending.push(i)

    let processed = done.size
    let rendered = 0
    const report = () =>
      onProgress?.({ processed, total, pageLabel: `${label} · page ${processed}/${total}` })
    report()

    if (!pending.length) return { pages: total, rendered, skipped: total }

    const presignByIndex = new Map<number, PresignPage>()
    let bucket = ''
    const presignChunks: number[][] = []
    for (let i = 0; i < pending.length; i += PRESIGN_CHUNK) {
      presignChunks.push(pending.slice(i, i + PRESIGN_CHUNK))
    }
    await withConcurrency(presignChunks, PRESIGN_CONCURRENCY, async (chunk) => {
      if (signal?.aborted) throw new Error('Cancelled')
      const res = await retry(
        () =>
          apiFetch<PresignResponse>(`${base}/presign`, {
            method: 'POST',
            json: { page_indexes: chunk },
          }),
        PER_PAGE_ATTEMPTS,
      )
      bucket = res.bucket
      for (const p of res.pages) presignByIndex.set(p.page_index, p)
    })

    const renderSem = createSemaphore(RENDER_CONCURRENCY)
    const inFlight = createSemaphore(MAX_INFLIGHT)

    const pendingRegister: Array<{ page_index: number; image_path: string }> = []
    const registerTasks: Array<Promise<unknown>> = []
    const flushRegister = (force = false) => {
      while (pendingRegister.length && (force || pendingRegister.length >= REGISTER_FLUSH)) {
        const batch = pendingRegister.splice(0, REGISTER_FLUSH)
        registerTasks.push(
          retry(
            () => apiFetch(base, { method: 'POST', json: { pages: batch, page_count: total } }),
            PER_PAGE_ATTEMPTS,
          ),
        )
      }
    }

    const renderBounded = async (pageIndex: number): Promise<Blob> => {
      await renderSem.acquire()
      try {
        return await retry(() => renderPageToJpeg(doc, pageIndex), PER_PAGE_ATTEMPTS)
      } finally {
        renderSem.release()
      }
    }

    const runPage = async (pageIndex: number) => {
      await inFlight.acquire()
      try {
        if (signal?.aborted) throw new Error('Cancelled')
        const target = presignByIndex.get(pageIndex)
        if (!target) throw new Error(`Missing upload URL for page ${pageIndex + 1}`)

        const blob = await renderBounded(pageIndex)
        await retry(async () => {
          const { error } = await supabase.storage
            .from(bucket)
            .uploadToSignedUrl(target.storagePath, target.token, blob, {
              contentType: 'image/jpeg',
              upsert: true,
            })
          if (error) throw new Error(error.message)
        }, PER_PAGE_ATTEMPTS)

        pendingRegister.push({ page_index: pageIndex, image_path: target.storagePath })
        rendered++
        processed++
        report()
        flushRegister()
      } finally {
        inFlight.release()
      }
    }

    await Promise.all(pending.map((pageIndex) => runPage(pageIndex)))
    flushRegister(true)
    await Promise.all(registerTasks)

    return { pages: total, rendered, skipped: total - rendered }
  } finally {
    await doc.destroy().catch(() => {})
  }
}

async function renderPageToJpeg(
  doc: Awaited<ReturnType<Awaited<typeof import('pdfjs-dist')>['getDocument']>['promise']>,
  pageIndex: number,
): Promise<Blob> {
  const page = await doc.getPage(pageIndex + 1)
  let canvas: HTMLCanvasElement | null = null
  try {
    const base = page.getViewport({ scale: 1 })
    const longest = Math.max(base.width, base.height)
    const scale = Math.max(0.1, Math.min(2, longest > 0 ? MAX_DIM / longest : 2))
    const viewport = page.getViewport({ scale })

    canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')

    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    return await canvasToJpegBlob(canvas)
  } finally {
    page.cleanup()
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
  }
}
