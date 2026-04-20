import { randomUUID } from 'crypto'

type AttachmentInput = {
  id?: unknown
  name?: unknown
  url?: unknown
  size?: unknown
  type?: unknown
}

function toSafeFileName(name: string) {
  return name.replace(/[^\w.\-() ]+/g, '_').trim() || 'attachment'
}

function toBytes(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ''))
    if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed)
  }
  return 0
}

function toAttachmentList(raw: unknown): AttachmentInput[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((item) => !!item && typeof item === 'object') as AttachmentInput[]
}

export async function syncDocumentAttachments(params: {
  supabase: any
  accountId: string
  documentId: string
  documentVersionId: string | null
  uploadedBy: string
  attachmentsRaw: unknown
}) {
  const { supabase, accountId, documentId, documentVersionId, uploadedBy, attachmentsRaw } = params
  const list = toAttachmentList(attachmentsRaw)

  const { error: deleteError } = await supabase.from('attachments').delete().eq('document_id', documentId)
  if (deleteError) return deleteError

  if (list.length === 0) return null

  const rows = list.map((item) => {
    const fileName = toSafeFileName(typeof item.name === 'string' ? item.name : 'attachment')
    const fallbackPath = `documents/${documentId}/${randomUUID()}-${fileName}`
    const storagePath =
      typeof item.url === 'string' && item.url.trim() && item.url !== '#'
        ? item.url.trim()
        : fallbackPath

    return {
      account_id: accountId,
      document_id: documentId,
      document_version_id: documentVersionId,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: typeof item.type === 'string' ? item.type : null,
      size_bytes: toBytes(item.size),
      uploaded_by: uploadedBy,
    }
  })

  const { error: insertError } = await supabase.from('attachments').insert(rows)
  return insertError ?? null
}
