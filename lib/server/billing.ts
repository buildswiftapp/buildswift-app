type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => any
    insert: (values: Record<string, unknown>) => any
    update: (values: Record<string, unknown>) => any
    upsert: (values: Record<string, unknown>, options?: Record<string, unknown>) => any
  }
}

type BillingState = {
  subscriptionTier: string
  billingStatus: string
  currentPeriodEnd: string | null
  cancelAt: string | null
}

export const FREE_DOCUMENTS_PER_MONTH = 5

const ACTIVE_PRO_STATUSES = new Set(['active', 'trialing'])

function isMissingUsageTableError(errorMessage: string) {
  const msg = errorMessage.toLowerCase()
  return (
    msg.includes('account_document_usage_monthly') &&
    (msg.includes('schema cache') || msg.includes("could not find the table") || msg.includes('does not exist'))
  )
}

function monthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

function monthWindow(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

function isProTier(tier: string) {
  return tier === 'pro' || tier === 'professional' || tier === 'enterprise'
}

function isActiveProBilling(state: BillingState) {
  if (!isProTier(state.subscriptionTier)) return false
  if (!ACTIVE_PRO_STATUSES.has(state.billingStatus)) return false
  if (!state.currentPeriodEnd) return true
  const periodEndMs = Date.parse(state.currentPeriodEnd)
  if (Number.isNaN(periodEndMs)) return true
  return periodEndMs > Date.now()
}

function shouldDowngradeExpiredAccount(state: BillingState) {
  if (!isProTier(state.subscriptionTier)) return false
  if (!state.currentPeriodEnd) return false
  const periodEndMs = Date.parse(state.currentPeriodEnd)
  if (Number.isNaN(periodEndMs) || periodEndMs > Date.now()) return false

  if (state.cancelAt) {
    const cancelAtMs = Date.parse(state.cancelAt)
    if (!Number.isNaN(cancelAtMs) && cancelAtMs <= Date.now()) return true
  }

  return !ACTIVE_PRO_STATUSES.has(state.billingStatus)
}

async function countCurrentMonthDocumentsFallback(
  supabase: SupabaseLike,
  accountId: string
): Promise<number> {
  const { startIso, endIso } = monthWindow()
  const tables = ['rfi_documents', 'submittal_documents', 'change_order_documents']
  let total = 0
  for (const table of tables) {
    // Some Supabase client typings in this repo expose `select(columns)` only.
    // Cast to `any` so we can use the runtime-supported `(columns, options)` overload.
    const { count, error } = await (supabase.from(table) as any)
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
    if (error) throw new Error(error.message)
    total += typeof count === 'number' ? count : 0
  }
  return total
}

export async function getAccountBillingState(supabase: SupabaseLike, accountId: string): Promise<BillingState> {
  const { data, error } = await supabase
    .from('accounts')
    .select('subscription_tier,billing_status,current_period_end,cancel_at')
    .eq('id', accountId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const state = {
    subscriptionTier:
      typeof data?.subscription_tier === 'string' && data.subscription_tier.trim()
        ? data.subscription_tier
        : 'free',
    billingStatus:
      typeof data?.billing_status === 'string' && data.billing_status.trim()
        ? data.billing_status
        : 'active',
    currentPeriodEnd:
      typeof data?.current_period_end === 'string' && data.current_period_end.trim()
        ? data.current_period_end
        : null,
    cancelAt: typeof data?.cancel_at === 'string' && data.cancel_at.trim() ? data.cancel_at : null,
  }

  if (shouldDowngradeExpiredAccount(state)) {
    await downgradeAccountToFree(supabase, accountId)
    return {
      subscriptionTier: 'free',
      billingStatus: 'canceled',
      currentPeriodEnd: null,
      cancelAt: null,
    }
  }

  return state
}

export async function getMonthlyDocumentUsage(
  supabase: SupabaseLike,
  accountId: string,
  usageMonth = monthStart(),
  options?: { fallbackToDocumentCount?: boolean }
): Promise<number> {
  const { data, error } = await supabase
    .from('account_document_usage_monthly')
    .select('documents_created')
    .eq('account_id', accountId)
    .eq('usage_month', usageMonth)
    .maybeSingle()
  if (error) {
    if (isMissingUsageTableError(error.message)) {
      if (options?.fallbackToDocumentCount) {
        return countCurrentMonthDocumentsFallback(supabase, accountId)
      }
      return 0
    }
    throw new Error(error.message)
  }
  return typeof data?.documents_created === 'number' ? data.documents_created : 0
}

export async function incrementMonthlyDocumentUsage(
  supabase: SupabaseLike,
  accountId: string,
  usageMonth = monthStart()
) {
  const current = await getMonthlyDocumentUsage(supabase, accountId, usageMonth)
  const { error } = await supabase
    .from('account_document_usage_monthly')
    .upsert(
      {
        account_id: accountId,
        usage_month: usageMonth,
        documents_created: current + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,usage_month' }
    )
  if (error) {
    if (isMissingUsageTableError(error.message)) return
    throw new Error(error.message)
  }
}

export async function assertCanCreateDocument(
  supabase: SupabaseLike,
  accountId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const billing = await getAccountBillingState(supabase, accountId)
  if (isActiveProBilling(billing)) return { ok: true }

  const used = await getMonthlyDocumentUsage(supabase, accountId)
  if (used >= FREE_DOCUMENTS_PER_MONTH) {
    if (billing.billingStatus === 'past_due') {
      return {
        ok: false,
        reason:
          'Your subscription is past due and free document limits now apply. Update billing in Billing Settings.',
      }
    }
    return {
      ok: false,
      reason: 'Free plan limit reached (5 documents/month). Upgrade to Pro in Billing Settings.',
    }
  }
  return { ok: true }
}

export async function assertCanUseProFeature(
  supabase: SupabaseLike,
  accountId: string,
  featureName: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const billing = await getAccountBillingState(supabase, accountId)
  if (isActiveProBilling(billing)) return { ok: true }
  if (billing.billingStatus === 'past_due') {
    return {
      ok: false,
      reason: `Your subscription is past due. Update payment method in Billing Settings to use ${featureName}.`,
    }
  }
  return {
    ok: false,
    reason: `${featureName} is a Pro feature. Upgrade in Billing Settings to continue.`,
  }
}

export async function downgradeAccountToFree(supabase: SupabaseLike, accountId: string) {
  const { error } = await supabase
    .from('accounts')
    .update({
      stripe_customer_id: null,
      subscription_tier: 'free',
      billing_status: 'canceled',
      stripe_subscription_id: null,
      stripe_price_id: null,
      current_period_end: null,
      cancel_at: null,
    })
    .eq('id', accountId)
  if (error) throw new Error(error.message)
}

