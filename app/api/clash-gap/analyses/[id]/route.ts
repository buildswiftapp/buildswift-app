import { badRequest, notFound, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import {
  assertProjectOwned,
  getAnalysisForAccount,
  parseSettings,
} from '@/lib/server/clash-gap/access'
import { deleteClashGapAnalysisStorage } from '@/lib/server/clash-gap/storage'
import { incrementAccountStorageBytes } from '@/lib/server/storage-usage'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { parseStages } from '@/lib/clash-gap-stages'
import { mergeSavedSession, readSavedSession, withSavedSessionFields } from '@/lib/server/clash-gap/session-save'
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

  const { savedAt, sessionMeta } = readSavedSession(analysis.summary)

  return ok({
    analysis: {
      id: analysis.id,
      project_id: analysis.project_id,
      status: analysis.status,
      processing_step: analysis.processing_step,
      settings: parseSettings(analysis.settings),
      error_message: analysis.error_message,
      summary: analysis.summary,
      stages: parseStages((analysis as { stages?: unknown }).stages),
      created_at: analysis.created_at,
      completed_at: analysis.completed_at,
      saved_at: savedAt,
      session_meta: sessionMeta,
    },
    files: files ?? [],
    issues: issues ?? [],
  })
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id } = await params
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const analysis = await getAnalysisForAccount(supabase, id, auth.accountId)
  if (!analysis) return notFound('Analysis not found')

  const { data: files } = await supabase
    .from('clash_gap_analysis_files')
    .select('size_bytes')
    .eq('analysis_id', id)
  const freedBytes = (files || []).reduce(
    (sum: number, f: { size_bytes: number | null }) => sum + (f.size_bytes || 0),
    0,
  )

  try {
    await deleteClashGapAnalysisStorage(auth.accountId, id)
  } catch (e) {
    console.error('[clash-gap delete] storage cleanup failed', e)
  }

  const { error } = await supabase
    .from('clash_gap_analyses')
    .delete()
    .eq('id', id)
    .eq('account_id', auth.accountId)
  if (error) return serverError(error.message)

  if (freedBytes > 0) {
    try {
      await incrementAccountStorageBytes(supabase as any, auth.accountId, -freedBytes)
    } catch {
    }
  }

  return ok({ deleted: true })
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

  if (parsed.data.saved_at !== undefined || parsed.data.session_meta) {
    const savedAt = parsed.data.saved_at ?? new Date().toISOString()
    updates.summary = mergeSavedSession(
      analysis.summary as Record<string, unknown> | null,
      savedAt,
      parsed.data.session_meta ?? {},
    )
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
    analysis: withSavedSessionFields({
      ...data,
      settings: parseSettings(data.settings),
    }),
  })
}
