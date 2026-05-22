import { badRequest, created, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { writeAuditLog } from '@/lib/server/audit'
import { getAuthContext } from '@/lib/server/auth'
import { assertProjectOwned, parseSettings } from '@/lib/server/clash-gap/access'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { createClashGapAnalysisSchema } from '@/lib/server/validators'
import { DEFAULT_DETECTION_SETTINGS } from '@/lib/clash-gap-api'

export async function GET(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return ok({ analyses: [] })

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const url = new URL(req.url)
  const projectId = url.searchParams.get('project_id')

  let query = supabase
    .from('clash_gap_analyses')
    .select('id, project_id, status, processing_step, summary, created_at, completed_at, settings')
    .eq('account_id', auth.accountId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) return serverError(error.message)

  return ok({
    analyses: (data ?? []).map((row: any) => ({
      ...row,
      settings: parseSettings(row.settings),
    })),
  })
}

export async function POST(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) {
    return badRequest('Account context is unavailable.')
  }

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const parsed = createClashGapAnalysisSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten())

  const projectCheck = await assertProjectOwned(supabase, auth.accountId, parsed.data.project_id)
  if (!projectCheck.ok) return badRequest(projectCheck.reason)

  const settings = parsed.data.settings ?? DEFAULT_DETECTION_SETTINGS

  const { data, error } = await supabase
    .from('clash_gap_analyses')
    .insert({
      account_id: auth.accountId,
      project_id: parsed.data.project_id,
      created_by: auth.user.id,
      status: 'draft',
      settings,
    })
    .select('*')
    .single()

  if (error) return serverError(error.message)

  await writeAuditLog(
    {
      accountId: auth.accountId,
      actorType: 'user',
      actorUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      eventType: 'clash_gap.analysis.created',
      projectId: parsed.data.project_id,
      eventData: { analysisId: data.id },
    },
    supabase
  )

  return created({
    analysis: {
      ...data,
      settings: parseSettings(data.settings),
    },
  })
}
