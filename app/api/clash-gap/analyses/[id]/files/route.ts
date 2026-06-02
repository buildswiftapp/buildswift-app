import { randomUUID } from 'crypto'
import { CLASH_GAP_MAX_BYTES, formatUploadSizeLimit } from '@/lib/upload-limits'
import {
  badRequest,
  created,
  forbidden,
  notFound,
  serverError,
  unauthorized,
} from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { assertWithinStorageLimit } from '@/lib/server/billing'
import { getAnalysisForAccount } from '@/lib/server/clash-gap/access'
import { clashGapBucket } from '@/lib/server/clash-gap/storage'
import { incrementAccountStorageBytes } from '@/lib/server/storage-usage'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id: analysisId } = await params
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const analysis = await getAnalysisForAccount(supabase, analysisId, auth.accountId)
  if (!analysis) return notFound('Analysis not found')

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const storagePath = typeof body.storage_path === 'string' ? body.storage_path : ''
  const name = (typeof body.file_name === 'string' ? body.file_name : '').trim() || 'upload_file'
  const mime = (typeof body.mime_type === 'string' ? body.mime_type : 'application/octet-stream')
    .split(';')[0]
    .trim()
    .toLowerCase()
  const fileRole = typeof body.file_role === 'string' ? body.file_role : 'plans'
  const providedPageCount =
    typeof body.page_count === 'number' && Number.isFinite(body.page_count) && body.page_count > 0
      ? Math.floor(body.page_count)
      : null

  if (!['plans', 'specs', 'addenda'].includes(fileRole)) return badRequest('Invalid file_role')

  const folder = `${auth.accountId}/clash-gap/${analysisId}`
  if (!storagePath.startsWith(`${folder}/`)) return badRequest('Invalid storage_path')

  const admin = createSupabaseAdminClient()
  if (!admin) {
    return serverError(
      'File storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and ensure the storage bucket exists.',
    )
  }

  const objectName = storagePath.slice(folder.length + 1)
  const bucket = clashGapBucket()
  const { data: listed, error: listError } = await admin.storage
    .from(bucket)
    .list(folder, { search: objectName, limit: 100 })
  if (listError) return serverError(listError.message)
  const match = (listed || []).find((o: { name: string }) => o.name === objectName)
  if (!match) return badRequest('Uploaded file was not found in storage')

  const metaSize = (match as { metadata?: { size?: number } }).metadata?.size
  const sizeBytes =
    typeof metaSize === 'number'
      ? metaSize
      : typeof body.size_bytes === 'number'
        ? body.size_bytes
        : 0

  if (sizeBytes > CLASH_GAP_MAX_BYTES) {
    await admin.storage.from(bucket).remove([storagePath]).catch(() => {})
    return badRequest(`File exceeds the ${formatUploadSizeLimit(CLASH_GAP_MAX_BYTES)} limit`)
  }

  const storageGate = await assertWithinStorageLimit(supabase as any, auth.accountId, sizeBytes)
  if (!storageGate.ok) {
    await admin.storage.from(bucket).remove([storagePath]).catch(() => {})
    return forbidden(storageGate.reason)
  }

  const isImage = mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(name)
  const pageCount = providedPageCount ?? (isImage ? 1 : null)

  const { data, error } = await supabase
    .from('clash_gap_analysis_files')
    .insert({
      id: randomUUID(),
      analysis_id: analysisId,
      account_id: auth.accountId,
      storage_path: storagePath,
      file_name: name,
      mime_type: mime || null,
      size_bytes: sizeBytes,
      file_role: fileRole,
      page_count: pageCount,
    })
    .select('id, file_name, file_role, mime_type, page_count')
    .single()

  if (error) return serverError(error.message)

  try {
    await incrementAccountStorageBytes(supabase as any, auth.accountId, sizeBytes)
  } catch {
  }

  await supabase
    .from('clash_gap_analyses')
    .update({ status: 'uploading', updated_at: new Date().toISOString() })
    .eq('id', analysisId)

  return created({ file: data })
}
