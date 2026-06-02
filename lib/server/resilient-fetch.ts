const TRANSIENT_MARKERS = [
  'und_err_headers_timeout',
  'und_err_body_timeout',
  'und_err_connect_timeout',
  'und_err_socket',
  'fetch failed',
  'econnreset',
  'etimedout',
  'eai_again',
  'socket hang up',
  'terminated',
]

function isTransientFetchError(error: unknown): boolean {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; current && depth < 5; depth++) {
    const e = current as { message?: unknown; code?: unknown; name?: unknown; cause?: unknown }
    if (typeof e.message === 'string') parts.push(e.message)
    if (typeof e.code === 'string') parts.push(e.code)
    if (typeof e.name === 'string') parts.push(e.name)
    current = e.cause
  }
  const text = parts.join(' ').toLowerCase()
  return TRANSIENT_MARKERS.some((m) => text.includes(m))
}

function isReplayableBody(init?: RequestInit): boolean {
  const body = init?.body
  if (body == null || typeof body === 'string') return true
  if (body instanceof Uint8Array || body instanceof ArrayBuffer) return true
  if (typeof Blob !== 'undefined' && body instanceof Blob) return true
  return false
}

export const resilientFetch: typeof fetch = async (input, init) => {
  const maxAttempts = isReplayableBody(init) ? 3 : 1
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fetch(input, init)
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts - 1 && isTransientFetchError(error)) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)))
        continue
      }
      throw error
    }
  }
  throw lastError
}
