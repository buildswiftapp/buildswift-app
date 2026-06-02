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

export function clashGapAnalysisPrefix(accountId: string, analysisId: string) {
  return `${accountId}/clash-gap/${analysisId}`
}

export function clashGapImagePath(params: {
  accountId: string
  analysisId: string
  fileId: string
  pageIndex: number
  ext?: string
}) {
  const page = String(params.pageIndex + 1).padStart(4, '0')
  const ext = (params.ext || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg'
  return `${params.accountId}/clash-gap/${params.analysisId}/images/${params.fileId}-page-${page}.${ext}`
}

export async function uploadClashGapImage(params: {
  storagePath: string
  bytes: Buffer
  contentType?: string
}): Promise<void> {
  const admin = createSupabaseAdminClient()
  if (!admin) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for image upload')
  const { error } = await admin.storage.from(clashGapBucket()).upload(params.storagePath, params.bytes, {
    contentType: params.contentType || 'image/jpeg',
    upsert: true,
  })
  if (error) throw new Error(error.message)
}

export async function createClashGapSignedUrl(
  storagePath: string,
  expiresInSeconds = 600,
): Promise<string | null> {
  const admin = createSupabaseAdminClient()
  if (!admin) return null
  const { data, error } = await admin.storage
    .from(clashGapBucket())
    .createSignedUrl(storagePath, expiresInSeconds)
  if (error || !data) return null
  return data.signedUrl
}

async function listAllPaths(prefix: string): Promise<string[]> {
  const admin = createSupabaseAdminClient()
  if (!admin) return []
  const out: string[] = []
  const folders = [prefix]
  while (folders.length) {
    const folder = folders.shift()!
    const { data, error } = await admin.storage
      .from(clashGapBucket())
      .list(folder, { limit: 1000 })
    if (error || !data) continue
    for (const entry of data) {
      const path = `${folder}/${entry.name}`
      const isFile = (entry as { id?: string | null }).id != null
      if (isFile) out.push(path)
      else folders.push(path)
    }
  }
  return out
}

export async function deleteClashGapAnalysisStorage(
  accountId: string,
  analysisId: string,
): Promise<void> {
  const admin = createSupabaseAdminClient()
  if (!admin) return
  const prefix = clashGapAnalysisPrefix(accountId, analysisId)
  const paths = await listAllPaths(prefix)
  if (!paths.length) return
  for (let i = 0; i < paths.length; i += 100) {
    await admin.storage.from(clashGapBucket()).remove(paths.slice(i, i + 100))
  }
}

export async function deleteClashGapFile(storagePath: string): Promise<void> {
  const admin = createSupabaseAdminClient()
  if (!admin) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to delete files')

  const { error } = await admin.storage.from(clashGapBucket()).remove([storagePath])
  if (error) throw new Error(error.message)
}

export async function downloadClashGapFile(storagePath: string): Promise<Buffer> {
  const admin = createSupabaseAdminClient()
  if (!admin) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to download files')

  const { data, error } = await admin.storage.from(clashGapBucket()).download(storagePath)
  if (error || !data) throw new Error(error?.message || 'Download failed')
  const ab = await data.arrayBuffer()
  return Buffer.from(ab)
}
