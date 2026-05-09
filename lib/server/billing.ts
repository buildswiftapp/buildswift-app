import { normalizeTier, planForTier } from '@/lib/billing-plans'
import { attachmentsPayloadNonEmpty } from '@/lib/server/attachments'

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

const starterPlan = planForTier('free')
export const FREE_DOCUMENTS_PER_MONTH = starterPlan.documentsLimit

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

/** Paid Builder/Pro caps; when not paid-active, Starter rules apply (1 active project). */
export function activeProjectCapForBillingState(billing: BillingState): number | null {
  if (!isActiveProBilling(billing)) return starterPlan.maxActiveProjects ?? 1
  const tier = normalizeTier(billing.subscriptionTier)
  const plan = planForTier(tier)
  return plan.maxActiveProjects
}

export function attachmentsAllowedForBillingState(billing: BillingState): boolean {
  if (!isActiveProBilling(billing)) return starterPlan.attachmentsAllowed
  return planForTier(billing.subscriptionTier).attachmentsAllowed
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

export async function countActiveProjects(supabase: SupabaseLike, accountId: string): Promise<number> {
  try {
    const { count, error } = await (supabase.from('projects') as any)
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', 'active')
    if (error) throw new Error(error.message)
    return typeof count === 'number' ? count : 0
  } catch {
    return 0
  }
}

/**
 * Monthly `ai.generation` audit events (UTC calendar month).
 * Returns 0 if audit_logs errors so callers stay resilient.
 */
export async function getMonthlyAiGenerationCount(
  supabase: SupabaseLike,
  accountId: string,
  date = new Date()
): Promise<number> {
  try {
    const { startIso, endIso } = monthWindow(date)
    const { count, error } = await (supabase.from('audit_logs') as any)
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('event_type', 'ai.generation')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
    if (error) return 0
    return typeof count === 'number' ? count : 0
  } catch {
    return 0
  }
}

/**
 * All-time `ai.generation` audit count (legacy / diagnostics).
 */
export async function getAccountAiGenerationCount(
  supabase: SupabaseLike,
  accountId: string
): Promise<number> {
  try {
    const { count, error } = await (supabase.from('audit_logs') as any)
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('event_type', 'ai.generation')
    if (error) return 0
    return typeof count === 'number' ? count : 0
  } catch {
    return 0
  }
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
  const docLimit = starterPlan.documentsLimit
  if (used >= docLimit) {
    if (billing.billingStatus === 'past_due') {
      return {
        ok: false,
        reason:
          'Your subscription is past due and Starter document limits apply. Update billing on the Billing page.',
      }
    }
    return {
      ok: false,
      reason: `Starter plan limit reached (${docLimit} documents per month). Upgrade to Builder or Pro on the Billing page.`,
    }
  }
  return { ok: true }
}

export async function assertCanCreateProject(
  supabase: SupabaseLike,
  accountId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const billing = await getAccountBillingState(supabase, accountId)
  const cap = activeProjectCapForBillingState(billing)
  if (cap === null) return { ok: true }

  const count = await countActiveProjects(supabase, accountId)
  if (count >= cap) {
    if (!isActiveProBilling(billing)) {
      return {
        ok: false,
        reason: `Starter plan allows ${cap} active project${cap === 1 ? '' : 's'}. Upgrade to Builder or Pro on the Billing page to add more.`,
      }
    }
    const tier = normalizeTier(billing.subscriptionTier)
    if (tier === 'professional') {
      return {
        ok: false,
        reason: `Builder plan allows up to ${cap} active projects. Upgrade to Pro on the Billing page for unlimited projects, or archive a project.`,
      }
    }
    return {
      ok: false,
      reason: `You have reached your plan limit of ${cap} active project${cap === 1 ? '' : 's'}.`,
    }
  }
  return { ok: true }
}

export async function assertCanSyncDocumentAttachments(
  supabase: SupabaseLike,
  accountId: string,
  attachmentsRaw: unknown
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!attachmentsPayloadNonEmpty(attachmentsRaw)) return { ok: true }
  const billing = await getAccountBillingState(supabase, accountId)
  if (!attachmentsAllowedForBillingState(billing)) {
    return {
      ok: false,
      reason:
        'Attachments are included on Builder and Pro. Upgrade on the Billing page to attach files.',
    }
  }
  return { ok: true }
}

export async function assertCanUseAiAssist(
  supabase: SupabaseLike,
  accountId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const billing = await getAccountBillingState(supabase, accountId)
  if (isActiveProBilling(billing)) return { ok: true }

  const used = await getMonthlyAiGenerationCount(supabase, accountId)
  const aiCap = starterPlan.aiGenerationsLimit
  if (used >= aiCap) {
    if (billing.billingStatus === 'past_due') {
      return {
        ok: false,
        reason:
          'Your subscription is past due and Starter AI limits apply. Update billing on the Billing page.',
      }
    }
    return {
      ok: false,
      reason: `Starter plan allows ${aiCap} AI assists per month. Upgrade to Builder or Pro on the Billing page.`,
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
      reason: `Your subscription is past due. Update payment method on the Billing page to use ${featureName}.`,
    }
  }
  return {
    ok: false,
    reason: `${featureName} requires Builder or Pro. Upgrade on the Billing page.`,
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
