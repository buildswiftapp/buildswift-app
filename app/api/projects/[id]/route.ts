import { badRequest, notFound, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { writeAuditLog } from '@/lib/server/audit'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { updateProjectSchema } from '@/lib/server/validators'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) {
    return badRequest(
      'Account context is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY and ensure your account row exists.'
    )
  }

  const { id } = await params
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const parsed = updateProjectSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten())

  const updates: Record<string, string | null> = {}
  if (typeof parsed.data.name !== 'undefined') updates.name = parsed.data.name
  if (typeof parsed.data.description !== 'undefined') {
    updates.description = parsed.data.description || null
  }
  if (typeof parsed.data.address !== 'undefined') updates.address = parsed.data.address || null
  if (typeof parsed.data.client_owner !== 'undefined') {
    updates.client_owner_name = parsed.data.client_owner || null
  }
  if (typeof parsed.data.status !== 'undefined') updates.status = parsed.data.status

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .eq('account_id', auth.accountId)
    .select('*')
    .maybeSingle()

  if (error) return serverError(error.message)
  if (!data) return notFound('Project not found')

  await writeAuditLog(
    {
      accountId: auth.accountId,
      actorType: 'user',
      actorUserId: auth.user.id,
      eventType: 'project.updated',
      projectId: id,
      eventData: updates,
    },
    supabase
  )

  return ok({ project: data })
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) {
    return badRequest(
      'Account context is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY and ensure your account row exists.'
    )
  }
  const { id } = await params

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const { data, error } = await supabase
    .from('projects')
    .update({ status: 'deleted', deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('account_id', auth.accountId)
    .select('id')
    .maybeSingle()

  if (error) return serverError(error.message)
  if (!data) return notFound('Project not found')

  await writeAuditLog(
    {
      accountId: auth.accountId,
      actorType: 'user',
      actorUserId: auth.user.id,
      eventType: 'project.deleted',
      projectId: id,
    },
    supabase
  )

  return ok({ success: true })
}
