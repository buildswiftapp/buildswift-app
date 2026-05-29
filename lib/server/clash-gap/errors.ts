export function formatClashGapError(error: unknown): string {
  if (!(error instanceof Error)) return 'Analysis failed'

  const cause =
    error.cause instanceof Error
      ? error.cause.message
      : typeof error.cause === 'string'
        ? error.cause
        : ''

  const message = error.message.trim() || 'Analysis failed'
  if (cause && !message.includes(cause)) {
    return `${message}: ${cause}`
  }
  return message
}

export function isRetryableNetworkError(error: unknown): boolean {
  const parts: string[] = []
  if (error instanceof Error) {
    parts.push(error.message, error.name)
    if (error.cause instanceof Error) {
      parts.push(error.cause.message, error.cause.name)
    }
  } else {
    parts.push(String(error))
  }
  const text = parts.join(' ').toLowerCase()
  return (
    text.includes('fetch failed') ||
    text.includes('econnreset') ||
    text.includes('etimedout') ||
    text.includes('eai_again') ||
    text.includes('socket hang up') ||
    text.includes('network') ||
    text.includes('timed out') ||
    text.includes('timeout')
  )
}

export function isStaleClashGapProcessing(
  status: string,
  updatedAt: string,
  staleMs = Number(process.env.CLASH_GAP_STALE_PROCESSING_MS || 15 * 60 * 1000),
): boolean {
  if (status !== 'processing' && status !== 'queued') return false
  const t = Date.parse(updatedAt)
  if (!Number.isFinite(t)) return true
  return Date.now() - t > staleMs
}
