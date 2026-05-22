import { badRequest, notFound, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import {
  assertProjectOwned,
  getAnalysisForAccount,
  parseSettings,
} from '@/lib/server/clash-gap/access'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { updateClashGapAnalysisSchema } from '@/lib/server/validators'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const auth = await getAuthContext(_req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id } = await params
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const analysis = await getAnalysisForAccount(supabase, id, auth.accountId)
  if (!analysis) return notFound('Analysis not found')

  const [{ data: files }, { data: issues }] = await Promise.all([
    supabase
      .from('clash_gap_analysis_files')
      .select('id, file_name, file_role, mime_type, page_count, created_at')
      .eq('analysis_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('clash_gap_issues')
      .select('*')
      .eq('analysis_id', id)
      .order('created_at', { ascending: true }),
  ])

  return ok({
    analysis: {
      id: analysis.id,
      project_id: analysis.project_id,
      status: analysis.status,
      processing_step: analysis.processing_step,
      settings: parseSettings(analysis.settings),
      error_message: analysis.error_message,
      summary: analysis.summary,
      created_at: analysis.created_at,
      completed_at: analysis.completed_at,
    },
    files: files ?? [],
    issues: issues ?? [],
  })
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id } = await params
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const analysis = await getAnalysisForAccount(supabase, id, auth.accountId)
  if (!analysis) return notFound('Analysis not found')

  const parsed = updateClashGapAnalysisSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten())

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.settings) updates.settings = parsed.data.settings
  if (parsed.data.status) updates.status = parsed.data.status
  if (parsed.data.project_id) {
    const check = await assertProjectOwned(supabase, auth.accountId, parsed.data.project_id)
    if (!check.ok) return badRequest(check.reason)
    updates.project_id = parsed.data.project_id
  }

  const { data, error } = await supabase
    .from('clash_gap_analyses')
    .update(updates)
    .eq('id', id)
    .eq('account_id', auth.accountId)
    .select('*')
    .single()

  if (error) return serverError(error.message)

  return ok({
    analysis: {
      ...data,
      settings: parseSettings(data.settings),
    },
  })
}
