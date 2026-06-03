import { badRequest, notFound, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { getAnalysisForAccount } from '@/lib/server/clash-gap/access'
import { clashGapBucket, clashGapImagePath } from '@/lib/server/clash-gap/storage'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

const MAX_BATCH = 50

type Params = { params: Promise<{ id: string; fileId: string }> }

export async function POST(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id: analysisId, fileId } = await params
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const analysis = await getAnalysisForAccount(supabase, analysisId, auth.accountId)
  if (!analysis) return notFound('Analysis not found')

  const { data: file } = await supabase
    .from('clash_gap_analysis_files')
    .select('id')
    .eq('id', fileId)
    .eq('analysis_id', analysisId)
    .eq('account_id', auth.accountId)
    .maybeSingle()
  if (!file) return notFound('File not found')

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const raw = Array.isArray(body.page_indexes) ? body.page_indexes : []
  const pageIndexes = Array.from(
    new Set(
      raw
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0),
    ),
  )
  if (!pageIndexes.length) return badRequest('Provide page_indexes')
  if (pageIndexes.length > MAX_BATCH) {
    return badRequest(`Request at most ${MAX_BATCH} page_indexes per call`)
  }

  const admin = createSupabaseAdminClient()
  if (!admin) {
    return serverError(
      'File storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and ensure the storage bucket exists.',
    )
  }

  const bucket = clashGapBucket()
  const pages: Array<{ page_index: number; storagePath: string; token: string; signedUrl: string }> =
    []
  for (const pageIndex of pageIndexes) {
    const storagePath = clashGapImagePath({
      accountId: auth.accountId,
      analysisId,
      fileId,
      pageIndex,
      ext: 'jpg',
    })
    const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(storagePath, {
      upsert: true,
    })
    if (error || !data) {
      return serverError(error?.message || `Could not create upload URL for page ${pageIndex + 1}`)
    }
    pages.push({ page_index: pageIndex, storagePath, token: data.token, signedUrl: data.signedUrl })
  }

  return ok({ bucket, pages })
}
