import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { getAccountBranding } from '@/lib/server/account-branding'
import { updateCompanySchema } from '@/lib/server/validators'
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

  const { data, error } = await supabase.from('accounts').select('*').eq('id', auth.accountId).maybeSingle()
  if (error) return serverError(error.message)

  const row = (data ?? {}) as Record<string, unknown>
  const { data: brandingRow } = await getAccountBranding(supabase, auth.accountId)

  const fallbackName =
    (brandingRow?.company_name && brandingRow.company_name.trim()) ||
    (typeof row.name === 'string' && row.name.trim()) ||
    ''
  const fallbackAddress =
    (typeof row.address === 'string' && row.address.trim()) ||
    (process.env.REVIEW_PDF_CONTACT_ADDRESS?.trim() ?? '') ||
    ''
  const fallbackPhone =
    (typeof row.phone === 'string' && row.phone.trim()) ||
    (process.env.REVIEW_PDF_CONTACT_PHONE?.trim() ?? '') ||
    ''

  return ok({
    company: {
      name: fallbackName,
      industry: (typeof row.industry === 'string' ? row.industry : null) ?? null,
      website: (typeof row.website === 'string' ? row.website : null) ?? null,
      phone: fallbackPhone || null,
      address: fallbackAddress || null,
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

  const parsed = updateCompanySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten())

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const { error } = await supabase
    .from('accounts')
    .update({
      name: parsed.data.name,
      industry: parsed.data.industry ?? null,
      website: parsed.data.website ?? null,
      phone: parsed.data.phone ?? null,
      address: parsed.data.address ?? null,
    } as any)
    .eq('id', auth.accountId)
  if (error) return serverError(error.message)

  return ok({
    company: {
      name: parsed.data.name,
      industry: parsed.data.industry ?? null,
      website: parsed.data.website ?? null,
      phone: parsed.data.phone ?? null,
      address: parsed.data.address ?? null,
    },
  })
}

