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
    text.includes('network')
  )
}
