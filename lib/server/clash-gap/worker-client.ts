/** HTTP client for the clash-gap worker (local dev or Cloud Run). Chunk + Document AI OCR. */

const LOCAL_WORKER_URL = 'http://localhost:8080'
const WORKER_POST_TIMEOUT_MS = 30_000

function workerUrl(): string {
  const url = process.env.CLASH_GAP_WORKER_URL?.trim()
  if (!url) throw new Error('CLASH_GAP_WORKER_URL is not configured')
  return url.replace(/\/$/, '')
}

function workerSecret(): string {
  const secret = process.env.CLASH_GAP_WORKER_SECRET?.trim()
  if (!secret) throw new Error('CLASH_GAP_WORKER_SECRET is not configured')
  return secret
}

export function isWorkerConfigured(): boolean {
  return Boolean(
    process.env.CLASH_GAP_WORKER_URL?.trim() && process.env.CLASH_GAP_WORKER_SECRET?.trim(),
  )
}

export function workerSetupHint(): string {
  return (
    'Copy .env.example → .env.local (or run `npm run setup:env`), set ' +
    'CLASH_GAP_WORKER_URL and CLASH_GAP_WORKER_SECRET, restart `npm run dev`, ' +
    `then run the worker: npm run dev:worker (${LOCAL_WORKER_URL}).`
  )
}

export function assertWorkerConfigured(): void {
  if (isWorkerConfigured()) return

  const missing: string[] = []
  if (!process.env.CLASH_GAP_WORKER_URL?.trim()) missing.push('CLASH_GAP_WORKER_URL')
  if (!process.env.CLASH_GAP_WORKER_SECRET?.trim()) missing.push('CLASH_GAP_WORKER_SECRET')

  throw new Error(
    `Clash/Gap worker is not configured. Missing: ${missing.join(', ')}. ${workerSetupHint()}`,
  )
}

function formatWorkerFetchError(error: unknown, path: string): Error {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('terminated') || msg.includes('aborted')) {
      return new Error(
        `Worker ${path} did not respond in time. Is \`npm run dev:worker\` running at ${process.env.CLASH_GAP_WORKER_URL?.trim() || LOCAL_WORKER_URL}?`,
      )
    }
    if (msg.includes('econnrefused') || msg.includes('fetch failed')) {
      return new Error(
        `Worker is not reachable at ${process.env.CLASH_GAP_WORKER_URL?.trim() || LOCAL_WORKER_URL}. Start it with: npm run dev:worker`,
      )
    }
  }
  return error instanceof Error ? error : new Error(String(error))
}

async function postWorker(path: string, body: Record<string, unknown>): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WORKER_POST_TIMEOUT_MS)
  try {
    const res = await fetch(`${workerUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': workerSecret(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Worker ${path} failed (${res.status}): ${text || res.statusText}`)
    }
  } catch (error) {
    throw formatWorkerFetchError(error, path)
  } finally {
    clearTimeout(timer)
  }
}

export async function triggerChunkJob(params: {
  analysisId: string
  fileId: string
  pdfStoragePath: string
  accountId: string
}): Promise<void> {
  await postWorker('/chunk', {
    analysis_id: params.analysisId,
    file_id: params.fileId,
    pdf_storage_path: params.pdfStoragePath,
    account_id: params.accountId,
  })
}

export async function triggerOcrJob(analysisId: string): Promise<void> {
  await postWorker('/ocr', { analysis_id: analysisId })
}

export async function triggerChunkStageForAnalysis(params: {
  analysisId: string
  accountId: string
  supabase: any
}): Promise<{ delegated: boolean; pdfJobs: number }> {
  const { data: files, error } = await params.supabase
    .from('clash_gap_analysis_files')
    .select('id, storage_path, file_name, mime_type, page_count')
    .eq('analysis_id', params.analysisId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  if (!files?.length) throw new Error('No files uploaded')

  const pdfJobs: Array<{ fileId: string; path: string }> = []
  for (const file of files as Array<{
    id: string
    storage_path: string
    file_name: string
    mime_type: string | null
  }>) {
    const mime = (file.mime_type || '').toLowerCase()
    const isPdf = mime.includes('pdf') || file.file_name.toLowerCase().endsWith('.pdf')
    if (!isPdf) continue

    const { count } = await params.supabase
      .from('clash_gap_extracted_sheets')
      .select('id', { count: 'exact', head: true })
      .eq('analysis_file_id', file.id)
      .not('image_path', 'is', null)
    const expected = (file as { page_count?: number | null }).page_count ?? 0
    if (expected > 0 && (count ?? 0) >= expected) continue

    pdfJobs.push({ fileId: file.id, path: file.storage_path })
  }

  if (!pdfJobs.length) return { delegated: false, pdfJobs: 0 }

  await Promise.all(
    pdfJobs.map((job) =>
      triggerChunkJob({
        analysisId: params.analysisId,
        fileId: job.fileId,
        pdfStoragePath: job.path,
        accountId: params.accountId,
      }),
    ),
  )
  return { delegated: true, pdfJobs: pdfJobs.length }
}
