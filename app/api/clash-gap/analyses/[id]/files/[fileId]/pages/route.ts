import { badRequest, notFound, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { getAnalysisForAccount } from '@/lib/server/clash-gap/access'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

type Params = { params: Promise<{ id: string; fileId: string }> }

async function resolveFile(supabase: any, analysisId: string, fileId: string, accountId: string) {
  const { data } = await supabase
    .from('clash_gap_analysis_files')
    .select('id')
    .eq('id', fileId)
    .eq('analysis_id', analysisId)
    .eq('account_id', accountId)
    .maybeSingle()
  return data
}

export async function GET(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id: analysisId, fileId } = await params
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const analysis = await getAnalysisForAccount(supabase, analysisId, auth.accountId)
  if (!analysis) return notFound('Analysis not found')
  const file = await resolveFile(supabase, analysisId, fileId, auth.accountId)
  if (!file) return notFound('File not found')

  const { data, error } = await supabase
    .from('clash_gap_extracted_sheets')
    .select('page_index')
    .eq('analysis_file_id', fileId)
    .not('image_path', 'is', null)
  if (error) return serverError(error.message)

  const done = (data || [])
    .map((r: any) => r.page_index)
    .filter((n: unknown): n is number => Number.isInteger(n))
  return ok({ done })
}

export async function POST(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id: analysisId, fileId } = await params
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const analysis = await getAnalysisForAccount(supabase, analysisId, auth.accountId)
  if (!analysis) return notFound('Analysis not found')
  const file = await resolveFile(supabase, analysisId, fileId, auth.accountId)
  if (!file) return notFound('File not found')

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const rawPages = Array.isArray(body.pages) ? body.pages : []
  const pages = rawPages
    .map((p) => p as Record<string, unknown>)
    .map((p) => ({ page_index: Number(p.page_index), image_path: String(p.image_path ?? '') }))
    .filter((p) => Number.isInteger(p.page_index) && p.page_index >= 0 && p.image_path.length > 0)
  if (!pages.length) return badRequest('Provide pages with page_index and image_path')

  const pageCount = Number(body.page_count)
  if (Number.isInteger(pageCount) && pageCount > 0) {
    await supabase
      .from('clash_gap_analysis_files')
      .update({ page_count: pageCount })
      .eq('id', fileId)
      .eq('analysis_id', analysisId)
      .eq('account_id', auth.accountId)
  }

  const indexes = pages.map((p) => p.page_index)
  const { data: existingRows, error: existingErr } = await supabase
    .from('clash_gap_extracted_sheets')
    .select('id, page_index')
    .eq('analysis_file_id', fileId)
    .in('page_index', indexes)
  if (existingErr) return serverError(existingErr.message)

  const idByIndex = new Map<number, string>()
  for (const row of (existingRows || []) as any[]) idByIndex.set(row.page_index, row.id)

  const toInsert: Array<Record<string, unknown>> = []
  for (const p of pages) {
    const rowId = idByIndex.get(p.page_index)
    if (rowId) {
      const { error } = await supabase
        .from('clash_gap_extracted_sheets')
        .update({ image_path: p.image_path })
        .eq('id', rowId)
      if (error) return serverError(error.message)
    } else {
      toInsert.push({
        analysis_file_id: fileId,
        sheet_id: `Page-${p.page_index + 1}`,
        page_index: p.page_index,
        image_path: p.image_path,
      })
    }
  }
  if (toInsert.length) {
    const { error } = await supabase.from('clash_gap_extracted_sheets').insert(toInsert)
    if (error) return serverError(error.message)
  }

  return ok({ saved: pages.length })
}
