import { randomUUID } from 'crypto'
import { badRequest, created, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { getAnalysisForAccount } from '@/lib/server/clash-gap/access'
import { uploadClashGapFile } from '@/lib/server/clash-gap/storage'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

const ALLOWED_MIME = new Set(['application/pdf', 'text/plain'])
const MAX_BYTES = 25 * 1024 * 1024

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id: analysisId } = await params
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const analysis = await getAnalysisForAccount(supabase, analysisId, auth.accountId)
  if (!analysis) return badRequest('Analysis not found')

  const form = await req.formData().catch(() => null)
  if (!form) return badRequest('Expected multipart form data')

  const file = form.get('file')
  const fileRole = String(form.get('file_role') || 'plans')
  if (!['plans', 'specs', 'addenda'].includes(fileRole)) {
    return badRequest('Invalid file_role')
  }
  if (!file || typeof file === 'string') return badRequest('Missing file')

  const blob = file as File
  const mime = (blob.type || 'application/pdf').split(';')[0].trim().toLowerCase()
  const name = blob.name || 'upload.pdf'
  const extOk = /\.(pdf|txt)$/i.test(name)
  if (!ALLOWED_MIME.has(mime) && !extOk) {
    return badRequest('Only PDF and plain text files are accepted')
  }

  const buf = Buffer.from(await blob.arrayBuffer())
  if (buf.length > MAX_BYTES) return badRequest('File exceeds 25 MB limit')

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
    return serverError(e instanceof Error ? e.message : 'Upload failed')
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
    })
    .select('id, file_name, file_role, mime_type, page_count')
    .single()

  if (error) return serverError(error.message)

  await supabase
    .from('clash_gap_analyses')
    .update({ status: 'uploading', updated_at: new Date().toISOString() })
    .eq('id', analysisId)

  return created({ file: data })
}
