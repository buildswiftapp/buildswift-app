import { randomUUID } from 'crypto'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'

export function clashGapBucket() {
  return process.env.CLASH_GAP_BUCKET || process.env.REVIEW_SIGNATURES_BUCKET || 'document-attachments'
}

export function clashGapStoragePath(params: {
  accountId: string
  analysisId: string
  fileName: string
}) {
  const safe = params.fileName.replace(/[^\w.\-() ]+/g, '_')
  return `${params.accountId}/clash-gap/${params.analysisId}/${randomUUID()}-${safe}`
}

export async function uploadClashGapFile(params: {
  accountId: string
  analysisId: string
  fileName: string
  mimeType: string
  bytes: Buffer
}) {
  const admin = createSupabaseAdminClient()
  if (!admin) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for file upload')

  const storagePath = clashGapStoragePath({
    accountId: params.accountId,
    analysisId: params.analysisId,
    fileName: params.fileName,
  })

  const { error } = await admin.storage.from(clashGapBucket()).upload(storagePath, params.bytes, {
    contentType: params.mimeType,
    upsert: false,
  })
  if (error) throw new Error(error.message)
  return storagePath
}

export async function downloadClashGapFile(storagePath: string): Promise<Buffer> {
  const admin = createSupabaseAdminClient()
  if (!admin) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to download files')

  const { data, error } = await admin.storage.from(clashGapBucket()).download(storagePath)
  if (error || !data) throw new Error(error?.message || 'Download failed')
  const ab = await data.arrayBuffer()
  return Buffer.from(ab)
}
