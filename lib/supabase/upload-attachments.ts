'use client'

import { createSupabaseBrowserClient } from '@/lib/supabase/client'

const ATTACHMENTS_BUCKET = 'document-attachments'

export type DraftAttachment = {
  id: string
  name: string
  size: string
  file?: File
  url?: string
}

export type UploadedAttachment = {
  id: string
  name: string
  url: string
  size: number
  type: string
}

function sanitizeName(name: string) {
  return name.replace(/[^\w.\-() ]+/g, '_')
}

export async function uploadPendingAttachments(params: {
  attachments: DraftAttachment[]
  accountIdHint?: string
}) {
  const supabase = createSupabaseBrowserClient()
  if (!supabase) throw new Error('Supabase browser client is not configured')

  const accountSegment = params.accountIdHint || 'unknown-account'
  const uploaded: UploadedAttachment[] = []

  for (const attachment of params.attachments) {
    const ext = attachment.name.split('.').pop() || 'file'

    if (!attachment.file) {
      uploaded.push({
        id: attachment.id,
        name: attachment.name,
        url: attachment.url || '#',
        size: 0,
        type: ext,
      })
      continue
    }

    const path = `${accountSegment}/${Date.now()}-${crypto.randomUUID()}-${sanitizeName(attachment.name)}`
    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, attachment.file, {
        contentType: attachment.file.type || undefined,
        upsert: false,
      })
    if (uploadError) {
      throw new Error(uploadError.message)
    }

    const { data: publicUrlData } = supabase.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path)
    uploaded.push({
      id: attachment.id,
      name: attachment.name,
      url: publicUrlData.publicUrl || path,
      size: attachment.file.size,
      type: ext,
    })
  }

  return uploaded
}