// Node's global fetch (undici) reuses keep-alive sockets. When an upstream such as
// Supabase quietly closes an idle connection, the next request on that stale socket
// hangs until undici's headers timeout and throws `TypeError: fetch failed` with
// cause `UND_ERR_HEADERS_TIMEOUT`. Retrying transparently grabs a fresh connection,
// which clears the error — so we wrap fetch for server-side Supabase calls.

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
  // Walk the cause chain — undici nests the real reason under `.cause`.
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

// Only retry when the request body can be sent again (a stream would already be
// consumed). Supabase calls use JSON strings and binary buffers, which are safe.
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
