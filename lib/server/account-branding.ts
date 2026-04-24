import { fetchUrlAsDataUri } from '@/lib/server/branding-fetch'

export type AccountBrandingRow = {
  id: string
  account_id: string
  company_name: string | null
  primary_color: string | null
  logo_url: string | null
  created_at: string
  updated_at: string
}

export async function getAccountBranding(supabase: any, accountId: string) {
  const { data, error } = await supabase
    .from('account_branding')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()
  if (error) return { data: null as AccountBrandingRow | null, error }
  return { data: data as AccountBrandingRow | null, error: null }
}

export async function upsertAccountBranding(
  supabase: any,
  params: {
    accountId: string
    company_name: string | null
    primary_color: string | null
    logo_url: string | null
  }
) {
  const payload = {
    account_id: params.accountId,
    company_name: params.company_name,
    primary_color: params.primary_color,
    logo_url: params.logo_url,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('account_branding')
    .upsert(payload, { onConflict: 'account_id' })
    .select('*')
    .single()
  if (error) return { data: null as AccountBrandingRow | null, error }
  return { data: data as AccountBrandingRow, error: null }
}

export async function resolveBrandingLogoDataUri(logoUrl: string | null | undefined) {
  const u = (logoUrl ?? '').trim()
  if (!u) return ''
  if (u.startsWith('data:')) return u
  const { dataUri } = await fetchUrlAsDataUri(u)
  return dataUri || ''
}
