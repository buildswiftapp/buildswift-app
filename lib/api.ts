import { createSupabaseBrowserClient } from '@/lib/supabase/client'

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504])

let cachedAccessToken: string | null = null
let cachedAccessTokenExpiresAt = 0

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function resolveAccessToken(): Promise<string | null> {
  const now = Date.now()
  if (cachedAccessToken && cachedAccessTokenExpiresAt > now + 5_000) {
    return cachedAccessToken
  }

  const supabase = createSupabaseBrowserClient()
  if (!supabase) return null

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token ?? null
  cachedAccessToken = token
  cachedAccessTokenExpiresAt = session?.expires_at
    ? session.expires_at * 1000
    : now + 60_000
  return token
}

export function clearApiAuthCache() {
  cachedAccessToken = null
  cachedAccessTokenExpiresAt = 0
}

export async function apiFetch<T>(
  input: string,
  init?: RequestInit & { json?: Record<string, unknown> }
): Promise<T> {
  const headers = new Headers(init?.headers || {})
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const token = await resolveAccessToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const body = init?.json ? JSON.stringify(init.json) : init?.body
  const maxAttempts = 3
  let lastRes: Response | null = null
  let data: Record<string, unknown> = {}

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(input, {
      ...init,
      credentials: 'include',
      headers,
      body,
    })
    lastRes = res
    data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.ok || !RETRYABLE_STATUSES.has(res.status) || attempt >= maxAttempts - 1) break
    await sleep(400 * (attempt + 1))
  }

  if (!lastRes?.ok) {
    const err = new Error((data?.error as string) || `Request failed: ${lastRes?.status}`)
    ;(err as any).status = lastRes?.status
    ;(err as any).code = data?.code
    throw err
  }
  return data as T
}
