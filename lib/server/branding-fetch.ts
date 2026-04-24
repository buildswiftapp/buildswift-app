export async function fetchUrlAsDataUri(
  url: string,
  opts?: { maxBytes?: number; timeoutMs?: number }
): Promise<{ dataUri: string | null; error?: string }> {
  const maxBytes = opts?.maxBytes ?? 2_000_000
  const timeoutMs = opts?.timeoutMs ?? 12_000
  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    const res = await fetch(url, { signal: ac.signal, redirect: 'follow' })
    clearTimeout(timer)
    if (!res.ok) return { dataUri: null, error: `HTTP ${res.status}` }
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!ct.startsWith('image/')) return { dataUri: null, error: 'Not an image' }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > maxBytes) return { dataUri: null, error: 'Image too large' }
    const b64 = buf.toString('base64')
    return { dataUri: `data:${ct};base64,${b64}` }
  } catch {
    return { dataUri: null, error: 'fetch_failed' }
  }
}
