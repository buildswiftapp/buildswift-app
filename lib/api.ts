import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export async function apiFetch<T>(
  input: string,
  init?: RequestInit & { json?: Record<string, unknown> }
): Promise<T> {
  const headers = new Headers(init?.headers || {})
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const supabase = createSupabaseBrowserClient()
  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  const res = await fetch(input, {
    ...init,
    credentials: 'include',
    headers,
    body: init?.json ? JSON.stringify(init.json) : init?.body,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`)
  }
  return data as T
}
