import { CLASH_GAP_MAX_BYTES, formatUploadSizeLimit } from '@/lib/upload-limits'
import {
  badRequest,
  forbidden,
  notFound,
  ok,
  serverError,
  unauthorized,
} from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { assertWithinStorageLimit } from '@/lib/server/billing'
import { getAnalysisForAccount } from '@/lib/server/clash-gap/access'
import { clashGapBucket, clashGapStoragePath } from '@/lib/server/clash-gap/storage'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

const ALLOWED_MIME = new Set([
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
  'image/tiff',
])

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
  const fileName = typeof body.file_name === 'string' ? body.file_name : ''
  const mime = (typeof body.mime_type === 'string' ? body.mime_type : 'application/octet-stream')
    .split(';')[0]
    .trim()
    .toLowerCase()
  const sizeBytes = typeof body.size_bytes === 'number' ? body.size_bytes : 0
  const fileRole = typeof body.file_role === 'string' ? body.file_role : 'plans'

  if (!fileName.trim()) return badRequest('Missing file_name')
  if (!['plans', 'specs', 'addenda'].includes(fileRole)) return badRequest('Invalid file_role')

  const extOk = /\.(pdf|doc|docx|jpg|jpeg|png|gif|webp|bmp|svg|tiff?)$/i.test(fileName)
  if (!ALLOWED_MIME.has(mime) && !extOk) {
    return badRequest('Only PDF, Word documents, and image files are accepted')
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return badRequest('Invalid size_bytes')
  if (sizeBytes > CLASH_GAP_MAX_BYTES) {
    return badRequest(`File exceeds the ${formatUploadSizeLimit(CLASH_GAP_MAX_BYTES)} limit`)
  }

  const storageGate = await assertWithinStorageLimit(supabase as any, auth.accountId, sizeBytes)
  if (!storageGate.ok) return forbidden(storageGate.reason)

  const admin = createSupabaseAdminClient()
  if (!admin) {
    return serverError(
      'File storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and ensure the storage bucket exists.',
    )
  }

  const storagePath = clashGapStoragePath({
    accountId: auth.accountId,
    analysisId,
    fileName: fileName.trim(),
  })

  const bucket = clashGapBucket()
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(storagePath)
  if (error || !data) return serverError(error?.message || 'Could not create upload URL')

  return ok({
    bucket,
    storagePath,
    token: data.token,
    signedUrl: data.signedUrl,
  })
}
