import { badRequest, created, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { writeAuditLog } from '@/lib/server/audit'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { createProjectSchema } from '@/lib/server/validators'

export async function GET(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const url = new URL(req.url)
  const status = url.searchParams.get('status')

  if (!auth.accountId) {
    return ok({ projects: [] })
  }

  const selectColumns = 'id,name,description,address,client_owner_name,status,created_at,updated_at'
  let query = supabase
    .from('projects')
    .select(selectColumns)
    .eq('account_id', auth.accountId)
    .order('updated_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  } else {
    query = query.neq('status', 'deleted')
  }

  const { data, error } = await query
  if (error) return serverError(error.message)
  return ok({ projects: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')
  if (!auth.accountId) {
    return badRequest(
      'Account context is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY and ensure account bootstrap tables are migrated.'
    )
  }

  const parsed = createProjectSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten())

  const payload = parsed.data
  const { data, error } = await supabase
    .from('projects')
    .insert({
      account_id: auth.accountId,
      created_by: auth.user.id,
      name: payload.name,
      description: payload.description || null,
      address: payload.address || null,
      client_owner_name: payload.client_owner || null,
      status: 'active',
    })
    .select('*')
    .single()

  if (error) return serverError(error.message)

  await writeAuditLog({
    accountId: auth.accountId,
    actorType: 'user',
    actorUserId: auth.user.id,
    eventType: 'project.created',
    projectId: data.id,
    eventData: { name: data.name },
  })

  return created({ project: data })
}
