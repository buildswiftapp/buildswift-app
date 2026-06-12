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
  const paths = path.startsWith('/api/') ? [path] : [path, `/api${path}`]
  let lastError: Error | null = null

  for (const route of paths) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), WORKER_POST_TIMEOUT_MS)
    try {
      const res = await fetch(`${workerUrl()}${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Worker-Secret': workerSecret(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (res.ok) return
      const text = await res.text().catch(() => '')
      if (res.status === 404 && paths.length > 1 && route === paths[0]) {
        lastError = new Error(`Worker ${route} failed (${res.status}): ${text || res.statusText}`)
        continue
      }
      throw new Error(`Worker ${route} failed (${res.status}): ${text || res.statusText}`)
    } catch (error) {
      lastError = formatWorkerFetchError(error, route)
      if (paths.length > 1 && route === paths[0]) continue
      throw lastError
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError ?? new Error(`Worker ${path} failed`)
}

export async function triggerChunkStage(params: {
  analysisId: string
  accountId: string
}): Promise<void> {
  await postWorker('/chunk-stage', {
    analysis_id: params.analysisId,
    account_id: params.accountId,
  })
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
