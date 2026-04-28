import { fetchUrlAsDataUri } from '@/lib/server/branding-fetch'

function inferMimeFromPath(path: string) {
  const p = path.toLowerCase()
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg'
  if (p.endsWith('.webp')) return 'image/webp'
  if (p.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

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
  // When a storage path is stored (recommended), this helper can't resolve it without a client.
  // Call resolveBrandingLogoDataUriWithSupabase() instead.
  const { dataUri } = await fetchUrlAsDataUri(u)
  return dataUri || ''
}

export async function resolveBrandingLogoDataUriWithSupabase(
  supabase: any,
  logoRef: string | null | undefined
) {
  const u = (logoRef ?? '').trim()
  if (!u) return ''
  if (u.startsWith('data:')) return u

  // If it's an absolute URL, fetch as normal.
  if (/^https?:\/\//i.test(u)) {
    const { dataUri } = await fetchUrlAsDataUri(u)
    return dataUri || ''
  }

  // Otherwise treat as storage path; download and embed.
  const bucket = process.env.BRANDING_LOGO_BUCKET || process.env.REVIEW_SIGNATURES_BUCKET || 'document-attachments'
  try {
    const dl = await supabase.storage.from(bucket).download(u)
    if (dl?.error || !dl?.data) return ''
    const ab = await (dl.data as any).arrayBuffer()
    const mime = (dl.data as any).type || inferMimeFromPath(u)
    const b64 = Buffer.from(ab).toString('base64')
    return `data:${mime};base64,${b64}`
  } catch {
    return ''
  }
}
