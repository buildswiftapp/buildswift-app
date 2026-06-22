import { badRequest, notFound, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { writeAuditLog } from '@/lib/server/audit'
import { getAuthContext } from '@/lib/server/auth'
import { getIssueForAccount } from '@/lib/server/clash-gap/access'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { patchClashGapIssueSchema } from '@/lib/server/validators'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id } = await params
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const issue = await getIssueForAccount(supabase, id, auth.accountId)
  if (!issue) return notFound('Issue not found')

  const parsed = patchClashGapIssueSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten())

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.status) updates.status = parsed.data.status
  if (parsed.data.workflow_status) updates.workflow_status = parsed.data.workflow_status
  if (parsed.data.user_disposition !== undefined) {
    updates.user_disposition = parsed.data.user_disposition
  }
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority
  if (parsed.data.assigned_to !== undefined) updates.assigned_to = parsed.data.assigned_to
  if (parsed.data.due_date !== undefined) updates.due_date = parsed.data.due_date
  if (typeof parsed.data.resolved_document_id !== 'undefined') {
    updates.resolved_document_id = parsed.data.resolved_document_id
  }

  const { data, error } = await supabase
    .from('clash_gap_issues')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return serverError(error.message)

  if (data.project_issue_id && (parsed.data.user_disposition !== undefined || parsed.data.workflow_status)) {
    const projectPatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (parsed.data.user_disposition !== undefined) {
      projectPatch.user_disposition = parsed.data.user_disposition
    }
    if (parsed.data.workflow_status) {
      projectPatch.workflow_status = parsed.data.workflow_status
    }
    if (parsed.data.priority !== undefined) projectPatch.priority = parsed.data.priority
    if (parsed.data.assigned_to !== undefined) projectPatch.assigned_to = parsed.data.assigned_to
    if (parsed.data.due_date !== undefined) projectPatch.due_date = parsed.data.due_date
    try {
      await supabase
        .from('project_issues')
        .update(projectPatch)
        .eq('id', data.project_issue_id)
    } catch {
    }
  }

  const action =
    parsed.data.status === 'dismissed'
      ? 'dismiss'
      : parsed.data.status === 'reviewed'
        ? 'review'
        : parsed.data.status === 'resolved'
          ? 'resolve'
          : 'update'

  await supabase.from('clash_gap_issue_actions').insert({
    issue_id: id,
    user_id: auth.user.id,
    action,
    metadata: parsed.data,
  })

  await writeAuditLog(
    {
      accountId: auth.accountId,
      actorType: 'user',
      actorUserId: auth.user.id,
      eventType: 'clash_gap.issue.updated',
      eventData: { issueId: id, status: parsed.data.status },
    },
    supabase
  )

  return ok({ issue: data })
}
