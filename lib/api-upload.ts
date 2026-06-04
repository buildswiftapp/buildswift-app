import { apiFetch } from '@/lib/api'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatUploadSizeLimit } from '@/lib/upload-limits'

export type ClashGapUploadedFile = { id: string; page_count: number | null }

type PresignResponse = { bucket: string; storagePath: string; token: string; signedUrl: string }

function isPdfFile(name: string, mime: string): boolean {
  return mime === 'application/pdf' || /\.pdf$/i.test(name)
}

function isImageFile(name: string, mime: string): boolean {
  return mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(name)
}

export async function countPdfPagesClientSide(file: File): Promise<number | null> {
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

function refineUploadError(err: unknown, file: File): Error {
  const raw =
    err instanceof Error
      ? err.message
      : String((err as { message?: unknown } | null)?.message ?? err ?? '')
  const lc = raw.toLowerCase()
  const tooLarge =
    lc.includes('413') ||
    lc.includes('payload too large') ||
    lc.includes('maximum allowed size') ||
    lc.includes('exceeded')
  if (tooLarge) {
    return new Error(
      `Storage rejected "${file.name}" (${formatUploadSizeLimit(file.size)}) as too large. ` +
        `Raise the Supabase file size limit for this bucket and the project global limit, then disable the spend cap, and retry.`,
    )
  }
  return err instanceof Error ? err : new Error(raw || 'Upload failed')
}

function putToSignedUrl(
  presign: PresignResponse,
  file: File,
  mime: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', presign.signedUrl, true)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`))
    xhr.onerror = () => reject(new Error('Network error during upload'))
    const form = new FormData()
    form.append('cacheControl', '3600')
    form.append('', file)
    xhr.send(form)
  }).catch(async (err) => {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) throw refineUploadError(err, file)
    const { error } = await supabase.storage
      .from(presign.bucket)
      .uploadToSignedUrl(presign.storagePath, presign.token, file, {
        contentType: mime || 'application/pdf',
      })
    if (error) throw refineUploadError(error, file)
    onProgress?.(1)
  })
}

export async function uploadClashGapFile(params: {
  analysisId: string
  file: File
  fileRole: string
  onProgress?: (fraction: number) => void
  onPageCount?: (count: number) => void
}): Promise<ClashGapUploadedFile> {
  const { analysisId, file, fileRole, onProgress, onPageCount } = params
  const mime = (file.type || 'application/octet-stream').split(';')[0].trim().toLowerCase()
  const isPdf = isPdfFile(file.name, mime)
  const isImage = isImageFile(file.name, mime)

  const presign = await apiFetch<PresignResponse>(
    `/api/clash-gap/analyses/${analysisId}/files/presign`,
    {
      method: 'POST',
      json: { file_name: file.name, mime_type: mime, size_bytes: file.size, file_role: fileRole },
    },
  )

  await putToSignedUrl(presign, file, mime, onProgress)
  onProgress?.(1)

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
        ...(isImage ? { page_count: 1 } : {}),
      },
    },
  )
  const uploaded = res.file

  if (isPdf) {
    void countPdfPagesClientSide(file).then((count) => {
      if (count == null) return
      onPageCount?.(count)
      void apiFetch(`/api/clash-gap/analyses/${analysisId}/files/${uploaded.id}`, {
        method: 'PATCH',
        json: { page_count: count },
      }).catch(() => {})
    })
  } else if (isImage) {
    onPageCount?.(1)
  }

  return uploaded
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
