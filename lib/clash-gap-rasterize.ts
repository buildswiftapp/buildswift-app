import { apiFetch } from '@/lib/api'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'


type PresignPage = { page_index: number; storagePath: string; token: string; signedUrl: string }
type PresignResponse = { bucket: string; pages: PresignPage[] }

const MAX_DIM = 2200
const JPEG_QUALITY = 0.82
const BATCH = 8
const CONCURRENCY = 3
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
 * presigned URL, and register it as a sheet row. Resumable: pages already
 * uploaded (per the server's done-list) are skipped. Throws if any page can't
 * be rendered/uploaded after retries, so the chunk stage never silently falls
 * back to downloading the big file server-side.
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

  const pdfjs = await getPdfjs()
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data, disableAutoFetch: true, disableStream: true }).promise

  try {
    const total = doc.numPages

    let done = new Set<number>()
    try {
      const res = await apiFetch<{ done: number[] }>(
        `/api/clash-gap/analyses/${analysisId}/files/${fileId}/pages`,
      )
      done = new Set(res.done || [])
    } catch {
    }

    const supabase = createSupabaseBrowserClient()
    const pending: number[] = []
    for (let i = 0; i < total; i++) if (!done.has(i)) pending.push(i)

    let processed = done.size
    let rendered = 0
    onProgress?.({ processed, total, pageLabel: `${label} · page ${processed}/${total}` })

    for (let start = 0; start < pending.length; start += BATCH) {
      if (signal?.aborted) throw new Error('Cancelled')
      const batch = pending.slice(start, start + BATCH)

      const presign = await retry(
        () =>
          apiFetch<PresignResponse>(
            `/api/clash-gap/analyses/${analysisId}/files/${fileId}/pages/presign`,
            { method: 'POST', json: { page_indexes: batch } },
          ),
        PER_PAGE_ATTEMPTS,
      )
      const presignByIndex = new Map(presign.pages.map((p) => [p.page_index, p]))

      const saved: Array<{ page_index: number; image_path: string }> = []
      await withConcurrency(batch, CONCURRENCY, async (pageIndex) => {
        if (signal?.aborted) throw new Error('Cancelled')
        const target = presignByIndex.get(pageIndex)
        if (!target) throw new Error(`Missing upload URL for page ${pageIndex + 1}`)
        await retry(async () => {
          const blob = await renderPageToJpeg(doc, pageIndex)
          if (!supabase) throw new Error('Storage client unavailable')
          const { error } = await supabase.storage
            .from(presign.bucket)
            .uploadToSignedUrl(target.storagePath, target.token, blob, {
              contentType: 'image/jpeg',
              upsert: true,
            })
          if (error) throw new Error(error.message)
        }, PER_PAGE_ATTEMPTS)
        saved.push({ page_index: pageIndex, image_path: target.storagePath })
        rendered++
        processed++
        onProgress?.({ processed, total, pageLabel: `${label} · page ${processed}/${total}` })
      })

      await retry(
        () =>
          apiFetch(`/api/clash-gap/analyses/${analysisId}/files/${fileId}/pages`, {
            method: 'POST',
            json: { pages: saved, page_count: total },
          }),
        PER_PAGE_ATTEMPTS,
      )
    }

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
