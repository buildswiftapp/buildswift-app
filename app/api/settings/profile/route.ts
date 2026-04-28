import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { updateProfileSchema } from '@/lib/server/validators'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

export async function GET(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) {
    return badRequest(
      'Account context is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY and ensure your account row exists in the database.'
    )
  }

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id, full_name, email')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (userError) return serverError(userError.message)

  const { data: accountRow, error: accountError } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('id', auth.accountId)
    .maybeSingle()
  if (accountError) return serverError(accountError.message)

  return ok({
    profile: {
      full_name: userRow?.full_name ?? auth.user.user_metadata?.full_name ?? '',
      email: userRow?.email ?? auth.user.email ?? '',
      company_name: accountRow?.name ?? '',
      role: auth.isOwner ? 'admin' : 'member',
    },
  })
}

export async function PUT(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) {
    return badRequest(
      'Account context is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY and ensure your account row exists in the database.'
    )
  }

  const parsed = updateProfileSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten())

  const admin = createSupabaseAdminClient()
  const supabase = admin ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  // Keep app-level `users` table in sync.
  const { error: upsertError } = await supabase.from('users').upsert(
    {
      id: auth.user.id,
      full_name: parsed.data.full_name,
      email: parsed.data.email,
    },
    { onConflict: 'id' }
  )
  if (upsertError) return serverError(upsertError.message)

  // Persist company name on the account row.
  const { error: accountUpdateError } = await supabase
    .from('accounts')
    .update({ name: parsed.data.company_name })
    .eq('id', auth.accountId)
  if (accountUpdateError) return serverError(accountUpdateError.message)

  // Best-effort: keep Supabase Auth user metadata aligned.
  // - email updates may require verification depending on project settings.
  try {
    const server = await createSupabaseServerClient()
    if (server) {
      await server.auth.updateUser({
        email: parsed.data.email,
        data: { full_name: parsed.data.full_name, company_name: parsed.data.company_name },
      })
    } else if (admin) {
      await admin.auth.admin.updateUserById(auth.user.id, {
        email: parsed.data.email,
        user_metadata: { full_name: parsed.data.full_name, company_name: parsed.data.company_name },
      })
    }
  } catch {
    // If Auth update fails, we still return success because DB writes succeeded.
  }

  return ok({
    profile: {
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      company_name: parsed.data.company_name,
      role: auth.isOwner ? 'admin' : 'member',
    },
  })
}

