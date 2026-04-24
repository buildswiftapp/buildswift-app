import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAccountBranding, upsertAccountBranding } from '@/lib/server/account-branding'
import { getAuthContext } from '@/lib/server/auth'
import { parseBrandingPrimaryColor } from '@/lib/branding-utils'
import { accountBrandingUpsertSchema } from '@/lib/server/validators'
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

  const { data, error } = await getAccountBranding(supabase, auth.accountId)
  if (error) return serverError(error.message)

  return ok({
    branding: data
      ? {
          company_name: data.company_name,
          primary_color: data.primary_color,
          logo_url: data.logo_url,
        }
      : {
          company_name: null,
          primary_color: null,
          logo_url: null,
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

  const parsed = accountBrandingUpsertSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten())

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const existing = await getAccountBranding(supabase, auth.accountId)
  if (existing.error) return serverError(existing.error.message)

  const prev = existing.data
  const nextCompany =
    typeof parsed.data.company_name === 'undefined'
      ? prev?.company_name ?? null
      : parsed.data.company_name
  const nextColorRaw =
    typeof parsed.data.primary_color === 'undefined'
      ? prev?.primary_color ?? null
      : parsed.data.primary_color
  const nextColor = nextColorRaw ? parseBrandingPrimaryColor(nextColorRaw) : null

  let nextLogo =
    typeof parsed.data.clear_logo === 'boolean' && parsed.data.clear_logo
      ? null
      : (prev?.logo_url ?? null)

  const { data, error } = await upsertAccountBranding(supabase, {
    accountId: auth.accountId,
    company_name: nextCompany,
    primary_color: nextColor,
    logo_url: nextLogo,
  })
  if (error) return serverError(error.message)

  return ok({
    branding: {
      company_name: data?.company_name ?? null,
      primary_color: data?.primary_color ?? null,
      logo_url: data?.logo_url ?? null,
    },
  })
}
