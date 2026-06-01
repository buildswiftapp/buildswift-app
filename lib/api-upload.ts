import { apiFetch } from '@/lib/api'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

const CLASH_GAP_DIRECT_UPLOAD_THRESHOLD = 4 * 1024 * 1024

export type ClashGapUploadedFile = { id: string; page_count: number | null }

async function countPdfPagesClientSide(file: File): Promise<number | null> {
  try {
    const { PDFDocument } = await import('pdf-lib')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    })
    const count = doc.getPageCount()
    return Number.isFinite(count) && count > 0 ? count : null
  } catch {
    return null
  }
}

export async function uploadClashGapFile(params: {
  analysisId: string
  file: File
  fileRole: string
}): Promise<ClashGapUploadedFile> {
  const { analysisId, file, fileRole } = params
  const mime = (file.type || 'application/octet-stream').split(';')[0].trim().toLowerCase()
  const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(file.name)

  const pageCountPromise: Promise<number | null> = isPdf
    ? countPdfPagesClientSide(file)
    : Promise.resolve(null)

  if (file.size <= CLASH_GAP_DIRECT_UPLOAD_THRESHOLD) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('file_role', fileRole)
    const pageCount = await pageCountPromise
    if (pageCount != null) fd.append('page_count', String(pageCount))
    const res = await apiUpload<{ file: ClashGapUploadedFile }>(
      `/api/clash-gap/analyses/${analysisId}/files`,
      fd,
    )
    return res.file
  }

  const supabase = createSupabaseBrowserClient()
  if (!supabase) {
    throw new Error('Storage client is unavailable. Reload the page and try again.')
  }

  const presign = await apiFetch<{ bucket: string; storagePath: string; token: string }>(
    `/api/clash-gap/analyses/${analysisId}/files/presign`,
    {
      method: 'POST',
      json: { file_name: file.name, mime_type: mime, size_bytes: file.size, file_role: fileRole },
    },
  )

  const { error } = await supabase.storage
    .from(presign.bucket)
    .uploadToSignedUrl(presign.storagePath, presign.token, file, {
      contentType: mime || 'application/pdf',
    })
  if (error) throw new Error(error.message)

  const pageCount = await pageCountPromise
  const res = await apiFetch<{ file: ClashGapUploadedFile }>(
    `/api/clash-gap/analyses/${analysisId}/files`,
    {
      method: 'POST',
      json: {
        storage_path: presign.storagePath,
        file_name: file.name,
        mime_type: mime,
        size_bytes: file.size,
        file_role: fileRole,
        ...(pageCount != null ? { page_count: pageCount } : {}),
      },
    },
  )
  return res.file
}

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
    const err = new Error(
      (typeof data?.error === 'string' && data.error.trim()) || `Upload failed: ${res.status}`
    )
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }
  return data as T
}

export async function downloadAndSaveBlob(
  input: string,
  filename: string,
  init?: RequestInit,
): Promise<void> {
  const blob = await apiDownloadBlob(input, init)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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
