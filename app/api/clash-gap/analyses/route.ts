import { badRequest, created, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { writeAuditLog } from '@/lib/server/audit'
import { getAuthContext } from '@/lib/server/auth'
import { assertProjectOwned, parseSettings } from '@/lib/server/clash-gap/access'
import { withSavedSessionFields } from '@/lib/server/clash-gap/session-save'
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
  const savedOnly = url.searchParams.get('saved') === '1'

  let query = supabase
    .from('clash_gap_analyses')
    .select(
      'id, project_id, status, processing_step, summary, created_at, completed_at, updated_at, settings, projects(name)',
    )
    .eq('account_id', auth.accountId)
    .order(savedOnly ? 'updated_at' : 'created_at', { ascending: false })
    .limit(50)

  if (projectId) query = query.eq('project_id', projectId)
  if (savedOnly) query = query.not('summary->saved_at', 'is', null)

  const { data, error } = await query
  if (error) return serverError(error.message)

  const ids = (data ?? []).map((row: { id: string }) => row.id)
  let issueCounts: Record<string, number> = {}
  const docsByAnalysis: Record<string, { plans: string[]; specs: string[] }> = {}

  if (ids.length) {
    const [{ data: issueRows }, { data: fileRows }] = await Promise.all([
      supabase
        .from('clash_gap_issues')
        .select('analysis_id')
        .in('analysis_id', ids)
        .neq('status', 'dismissed'),
      supabase
        .from('clash_gap_analysis_files')
        .select('analysis_id, file_name, file_role')
        .in('analysis_id', ids)
        .in('file_role', ['plans', 'specs'])
        .order('created_at', { ascending: true }),
    ])

    if (issueRows) {
      issueCounts = issueRows.reduce(
        (acc: Record<string, number>, row: { analysis_id: string }) => {
          acc[row.analysis_id] = (acc[row.analysis_id] ?? 0) + 1
          return acc
        },
        {},
      )
    }

    for (const id of ids) {
      docsByAnalysis[id] = { plans: [], specs: [] }
    }
    for (const file of fileRows ?? []) {
      const bucket = docsByAnalysis[file.analysis_id]
      if (!bucket) continue
      const name = String(file.file_name ?? '').trim()
      if (!name) continue
      if (file.file_role === 'plans') bucket.plans.push(name)
      else if (file.file_role === 'specs') bucket.specs.push(name)
    }
  }

  return ok({
    analyses: (data ?? []).map((row: any) => {
      const saved = withSavedSessionFields(row)
      const docs = docsByAnalysis[saved.id] ?? { plans: [], specs: [] }
      return {
        id: saved.id,
        project_id: saved.project_id,
        project_name: row.projects?.name ?? null,
        status: saved.status,
        processing_step: saved.processing_step,
        summary: saved.summary,
        created_at: saved.created_at,
        completed_at: saved.completed_at,
        saved_at: saved.saved_at,
        session_meta: saved.session_meta,
        settings: parseSettings(saved.settings),
        issue_count: issueCounts[saved.id] ?? 0,
        plan_documents: docs.plans,
        spec_documents: docs.specs,
      }
    }),
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
