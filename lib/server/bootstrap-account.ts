import type { User } from '@supabase/supabase-js'

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => any
    insert: (values: Record<string, unknown>) => any
    upsert: (values: Record<string, unknown>, options?: Record<string, unknown>) => any
    eq: (col: string, value: unknown) => any
    limit: (n: number) => any
    maybeSingle: () => Promise<{ data: any; error: any }>
    single: () => Promise<{ data: any; error: any }>
  }
}

function readMetadataString(meta: Record<string, unknown> | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = meta?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function trialWindowFromNow() {
  const start = new Date()
  const end = new Date(start)
  end.setDate(end.getDate() + 14)
  return { trialStartDate: start.toISOString(), trialEndDate: end.toISOString() }
}

export async function bootstrapAccountForUser(
  supabase: SupabaseLike,
  user: Pick<User, 'id' | 'email' | 'user_metadata'>
): Promise<{ accountId: string } | null> {
  const fullName = readMetadataString(user.user_metadata, 'full_name', 'name')
  const companyName = readMetadataString(user.user_metadata, 'company_name', 'company')
  const accountName = companyName || fullName || 'My Account'
  const { trialStartDate, trialEndDate } = trialWindowFromNow()

  await supabase.from('users').upsert(
    {
      id: user.id,
      email: user.email ?? `${user.id}@unknown.local`,
      full_name: fullName,
    },
    { onConflict: 'id' }
  )

  const { data: existing } = await supabase
    .from('accounts')
    .select('id')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle()

  let accountId = typeof existing?.id === 'string' ? existing.id : null

  if (!accountId) {
    const basePayload = {
      owner_user_id: user.id,
      name: accountName,
      subscription_tier: 'trial',
      billing_status: 'active',
      trial_start_date: trialStartDate,
      trial_end_date: trialEndDate,
      trial_expired: false,
      storage_used_bytes: 0,
    }

    let created = await supabase.from('accounts').insert(basePayload).select('id').single()
    if (created.error) {
      created = await supabase
        .from('accounts')
        .insert({ owner_user_id: user.id, name: accountName })
        .select('id')
        .single()
    }
    if (created.error || !created.data?.id) return null
    accountId = String(created.data.id)
  }

  const memberPayload = { account_id: accountId, user_id: user.id, role: 'owner' }
  const memberUpsert = await supabase
    .from('account_members')
    .upsert(memberPayload, { onConflict: 'account_id,user_id' })
  if (memberUpsert.error) {
    await supabase.from('account_members').insert(memberPayload)
  }

  return { accountId }
}
