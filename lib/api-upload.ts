import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export async function apiUpload<T>(input: string, formData: FormData): Promise<T> {
  const headers = new Headers()
  const supabase = createSupabaseBrowserClient()
  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(input, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: formData,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || `Upload failed: ${res.status}`)
  }
  return data as T
}

export async function apiDownloadBlob(input: string, init?: RequestInit): Promise<Blob> {
  const headers = new Headers(init?.headers || {})
  const supabase = createSupabaseBrowserClient()
  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(input, {
    ...init,
    method: init?.method || 'POST',
    credentials: 'include',
    headers,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error || `Download failed: ${res.status}`)
  }
  return res.blob()
}
