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
import { getPdfPageCount } from '@/lib/server/clash-gap/render-pdf-page'
import { clashGapBucket, uploadClashGapFile } from '@/lib/server/clash-gap/storage'
import { incrementAccountStorageBytes } from '@/lib/server/storage-usage'
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
const PAGE_COUNT_TIMEOUT_MS = 45_000

export const maxDuration = 300

async function pdfPageCountWithTimeout(buf: Buffer): Promise<number | null> {
  try {
    return await Promise.race([
      getPdfPageCount(buf),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('PDF page count timed out')), PAGE_COUNT_TIMEOUT_MS)
      }),
    ])
  } catch (e) {
    console.error('[clash-gap upload] getPdfPageCount failed or timed out:', e)
    return null
  }
}

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

  const contentType = req.headers.get('content-type') || ''

  if (/^application\/json/i.test(contentType)) {
    return registerDirectUpload(req, supabase, analysisId, auth.accountId)
  }

  if (!/^multipart\/form-data/i.test(contentType)) {
    return badRequest('Expected multipart form data')
  }
  let form: FormData
  try {
    form = await req.formData()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not read upload body'
    return badRequest(`Upload body could not be parsed (${msg}). The file may be larger than the configured proxy limit.`)
  }

  const file = form.get('file')
  const fileRole = String(form.get('file_role') || 'plans')
  if (!['plans', 'specs', 'addenda'].includes(fileRole)) {
    return badRequest('Invalid file_role')
  }
  if (!file || typeof file === 'string') return badRequest('Missing file')


  const blob = file as File
  const mime = (blob.type || 'application/octet-stream').split(';')[0].trim().toLowerCase()
  const name = blob.name || 'upload_file'
  const extOk = /\.(pdf|doc|docx|jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name)
  if (!ALLOWED_MIME.has(mime) && !extOk) {
    return badRequest('Only PDF, Word documents, and image files (JPG, PNG, GIF, WebP, BMP, SVG) are accepted')
  }


  const buf = Buffer.from(await blob.arrayBuffer())
  if (buf.length > CLASH_GAP_MAX_BYTES) {
    return badRequest(`File exceeds the ${formatUploadSizeLimit(CLASH_GAP_MAX_BYTES)} limit`)
  }

  const storageGate = await assertWithinStorageLimit(supabase as any, auth.accountId, buf.length)
  if (!storageGate.ok) return forbidden(storageGate.reason)

  let storagePath: string
  try {
    storagePath = await uploadClashGapFile({
      accountId: auth.accountId,
      analysisId,
      fileName: name,
      mimeType: mime || 'application/pdf',
      bytes: buf,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload failed'
    if (msg.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return serverError(
        'File storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and ensure the storage bucket exists.',
      )
    }
    return serverError(msg)
  }

  let pageCount: number | null = null
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) {
    pageCount = await pdfPageCountWithTimeout(buf)
  } else if (mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(name)) {
    pageCount = 1
  }

  const { data, error } = await supabase
    .from('clash_gap_analysis_files')
    .insert({
      id: randomUUID(),
      analysis_id: analysisId,
      account_id: auth.accountId,
      storage_path: storagePath,
      file_name: name,
      mime_type: mime || null,
      size_bytes: buf.length,
      file_role: fileRole,
      page_count: pageCount,
    })
    .select('id, file_name, file_role, mime_type, page_count')
    .single()

  if (error) return serverError(error.message)

  try {
    await incrementAccountStorageBytes(supabase as any, auth.accountId, buf.length)
  } catch {
  }

  await supabase
    .from('clash_gap_analyses')
    .update({ status: 'uploading', updated_at: new Date().toISOString() })
    .eq('id', analysisId)

  return created({ file: data })
}

async function registerDirectUpload(
  req: Request,
  supabase: any,
  analysisId: string,
  accountId: string,
) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const storagePath = typeof body.storage_path === 'string' ? body.storage_path : ''
  const name = (typeof body.file_name === 'string' ? body.file_name : '').trim() || 'upload_file'
  const mime = (typeof body.mime_type === 'string' ? body.mime_type : 'application/octet-stream')
    .split(';')[0]
    .trim()
    .toLowerCase()
  const fileRole = typeof body.file_role === 'string' ? body.file_role : 'plans'

  if (!['plans', 'specs', 'addenda'].includes(fileRole)) return badRequest('Invalid file_role')

  const folder = `${accountId}/clash-gap/${analysisId}`
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

  const storageGate = await assertWithinStorageLimit(supabase as any, accountId, sizeBytes)
  if (!storageGate.ok) {
    await admin.storage.from(bucket).remove([storagePath]).catch(() => {})
    return forbidden(storageGate.reason)
  }

  const isImage = mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(name)
  const pageCount = isImage ? 1 : null

  const { data, error } = await supabase
    .from('clash_gap_analysis_files')
    .insert({
      id: randomUUID(),
      analysis_id: analysisId,
      account_id: accountId,
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
    await incrementAccountStorageBytes(supabase as any, accountId, sizeBytes)
  } catch {
  }

  await supabase
    .from('clash_gap_analyses')
    .update({ status: 'uploading', updated_at: new Date().toISOString() })
    .eq('id', analysisId)

  return created({ file: data })
}
