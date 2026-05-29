import { normalizeTier, planForTier } from '@/lib/billing-plans'
import { attachmentsPayloadNonEmpty } from '@/lib/server/attachments'
import { getOrCreateMonthlyUsageRow } from '@/lib/server/account-usage'

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
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAt: string | null
  trialStartDate: string | null
  trialEndDate: string | null
  trialExpired: boolean
  storageUsedBytes: number
}

const ACTIVE_STATUSES = new Set(['active', 'trialing'])

function isMissingUsageTableError(errorMessage: string) {
  const msg = errorMessage.toLowerCase()
  return (
    msg.includes('account_document_usage_monthly') &&
    (msg.includes('schema cache') || msg.includes("could not find the table") || msg.includes('does not exist'))
  )
}

function isMissingColumnError(errorMessage: string) {
  const msg = errorMessage.toLowerCase()
  return msg.includes('does not exist') && msg.includes('column')
}

const ACCOUNT_BILLING_SELECT_EXTENDED =
  'subscription_tier,billing_status,current_period_start,current_period_end,cancel_at,trial_start_date,trial_end_date,trial_expired,storage_used_bytes,created_at'

const ACCOUNT_BILLING_SELECT_BASE =
  'subscription_tier,billing_status,current_period_end,cancel_at,created_at'

async function fetchAccountBillingRow(
  supabase: SupabaseLike,
  accountId: string
): Promise<{ data: Record<string, unknown> | null; hasExtendedColumns: boolean }> {
  let hasExtendedColumns = true
  let result = await supabase
    .from('accounts')
    .select(ACCOUNT_BILLING_SELECT_EXTENDED)
    .eq('id', accountId)
    .maybeSingle()

  if (result.error && isMissingColumnError(result.error.message)) {
    hasExtendedColumns = false
    result = await supabase
      .from('accounts')
      .select(ACCOUNT_BILLING_SELECT_BASE)
      .eq('id', accountId)
      .maybeSingle()
  }

  if (result.error) throw new Error(result.error.message)
  return { data: (result.data as Record<string, unknown> | null) ?? null, hasExtendedColumns }
}

function monthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

function monthWindow(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

function isPaidActive(state: BillingState) {
  if (!ACTIVE_STATUSES.has(state.billingStatus)) return false
  if (!state.currentPeriodEnd) return true
  const periodEndMs = Date.parse(state.currentPeriodEnd)
  if (Number.isNaN(periodEndMs)) return true
  return periodEndMs > Date.now()
}

function isTrialCurrentlyActive(state: BillingState) {
  if (!state.trialStartDate || !state.trialEndDate) return false
  if (state.trialExpired) return false
  const endMs = Date.parse(state.trialEndDate)
  if (Number.isNaN(endMs)) return false
  return endMs > Date.now()
}

function effectiveTierForState(state: BillingState) {
  if (isPaidActive(state)) return normalizeTier(state.subscriptionTier)
  if (isTrialCurrentlyActive(state)) return 'trial' as const
  return 'trial' as const
}

function usageKeyForState(state: BillingState) {
  if (state.currentPeriodStart) {
    const ms = Date.parse(state.currentPeriodStart)
    if (!Number.isNaN(ms)) return new Date(ms).toISOString().slice(0, 10)
  }
  return monthStart()
}

export function activeProjectCapForBillingState(billing: BillingState): number | null {
  const tier = effectiveTierForState(billing)
  const plan = planForTier(tier)
  return plan.maxActiveProjects
}

function shouldDowngradeExpiredAccount(state: BillingState) {
  const tier = normalizeTier(state.subscriptionTier)
  if (tier === 'trial') return false
  if (!state.currentPeriodEnd) return false
  const periodEndMs = Date.parse(state.currentPeriodEnd)
  if (Number.isNaN(periodEndMs) || periodEndMs > Date.now()) return false

  if (state.cancelAt) {
    const cancelAtMs = Date.parse(state.cancelAt)
    if (!Number.isNaN(cancelAtMs) && cancelAtMs <= Date.now()) return true
  }

  return !ACTIVE_STATUSES.has(state.billingStatus)
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
  const { data, hasExtendedColumns } = await fetchAccountBillingRow(supabase, accountId)
  const createdAt =
    typeof (data as any)?.created_at === 'string' && (data as any).created_at.trim()
      ? String((data as any).created_at)
      : null
  const rawTrialStart =
    typeof (data as any)?.trial_start_date === 'string' && (data as any).trial_start_date.trim()
      ? String((data as any).trial_start_date)
      : null
  const rawTrialEnd =
    typeof (data as any)?.trial_end_date === 'string' && (data as any).trial_end_date.trim()
      ? String((data as any).trial_end_date)
      : null
  const trialExpired = Boolean((data as any)?.trial_expired)
  const storageUsedBytes =
    typeof (data as any)?.storage_used_bytes === 'number' && Number.isFinite((data as any).storage_used_bytes)
      ? Math.max(0, Math.floor((data as any).storage_used_bytes))
      : 0

  let trialStartDate = rawTrialStart ?? createdAt
  let trialEndDate = rawTrialEnd
  if (trialStartDate && !trialEndDate) {
    const startMs = Date.parse(trialStartDate)
    if (!Number.isNaN(startMs)) {
      const end = new Date(startMs)
      end.setDate(end.getDate() + 14)
      trialEndDate = end.toISOString()
    }
  }

  let computedExpired = trialExpired
  if (trialEndDate) {
    const endMs = Date.parse(trialEndDate)
    if (!Number.isNaN(endMs) && endMs <= Date.now()) {
      computedExpired = true
    }
  }

  const state = {
    subscriptionTier:
      typeof data?.subscription_tier === 'string' && data.subscription_tier.trim()
        ? data.subscription_tier
        : 'trial',
    billingStatus:
      typeof data?.billing_status === 'string' && data.billing_status.trim()
        ? data.billing_status
        : 'active',
    currentPeriodStart:
      typeof (data as any)?.current_period_start === 'string' &&
      String((data as any).current_period_start).trim()
        ? String((data as any).current_period_start)
        : null,
    currentPeriodEnd:
      typeof data?.current_period_end === 'string' && data.current_period_end.trim()
        ? data.current_period_end
        : null,
    cancelAt: typeof data?.cancel_at === 'string' && data.cancel_at.trim() ? data.cancel_at : null,
    trialStartDate,
    trialEndDate,
    trialExpired: computedExpired,
    storageUsedBytes,
  }

  if (shouldDowngradeExpiredAccount(state)) {
    await downgradeAccountToFree(supabase, accountId)
    return {
      subscriptionTier: 'trial',
      billingStatus: 'canceled',
      currentPeriodEnd: null,
      cancelAt: null,
      trialStartDate: state.trialStartDate,
      trialEndDate: state.trialEndDate,
      trialExpired: state.trialExpired,
      storageUsedBytes: state.storageUsedBytes,
    }
  }
  
  if (
    hasExtendedColumns &&
    (!rawTrialStart || !rawTrialEnd || computedExpired !== trialExpired) &&
    state.trialStartDate &&
    state.trialEndDate
  ) {
    try {
      await supabase
        .from('accounts')
        .update({
          trial_start_date: state.trialStartDate,
          trial_end_date: state.trialEndDate,
          trial_expired: computedExpired,
          updated_at: new Date().toISOString(),
        })
        .eq('id', accountId)
    } catch {
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
      .neq('status', 'archived')
      .neq('status', 'deleted')
    if (error) throw new Error(error.message)
    return typeof count === 'number' ? count : 0
  } catch {
    return 0
  }
}

export async function getMonthlyAiGenerationCount(
  supabase: SupabaseLike,
  accountId: string,
  date = new Date(),
  usageKey?: string
): Promise<number> {
  try {
    const key = usageKey ?? monthStart(date)
    const row = await getOrCreateMonthlyUsageRow(supabase as any, accountId, key)
    if (typeof row?.ai_generations_used === 'number' && Number.isFinite(row.ai_generations_used)) {
      return Math.max(0, Math.floor(row.ai_generations_used))
    }
  } catch {
  }
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

export async function getMonthlyClashGapReportCount(
  supabase: SupabaseLike,
  accountId: string,
  date = new Date(),
  usageKey?: string
): Promise<number> {
  try {
    const key = usageKey ?? monthStart(date)
    const row = await getOrCreateMonthlyUsageRow(supabase as any, accountId, key)
    if (
      typeof row?.clash_gap_reports_used === 'number' &&
      Number.isFinite(row.clash_gap_reports_used)
    ) {
      return Math.max(0, Math.floor(row.clash_gap_reports_used))
    }
  } catch {
  }
  try {
    const { startIso, endIso } = monthWindow(date)
    const { count, error } = await (supabase.from('clash_gap_analyses') as any)
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', 'completed')
      .gte('completed_at', startIso)
      .lt('completed_at', endIso)
    if (error) return 0
    return typeof count === 'number' ? count : 0
  } catch {
    return 0
  }
}

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
  if (billing.trialExpired && !isPaidActive(billing)) {
    return {
      ok: false,
      reason: 'Your free trial has ended. Select a paid plan to continue.',
    }
  }

  const used = await getMonthlyDocumentUsage(supabase, accountId)
  void used
  return { ok: true }
}

export async function assertCanCreateProject(
  supabase: SupabaseLike,
  accountId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const billing = await getAccountBillingState(supabase, accountId)
  if (billing.trialExpired && !isPaidActive(billing)) {
    return {
      ok: false,
      reason: 'Your free trial has ended. Select a paid plan to continue.',
    }
  }
  const cap = activeProjectCapForBillingState(billing)
  if (cap === null) return { ok: true }

  const count = await countActiveProjects(supabase, accountId)
  if (count >= cap) {
    return {
      ok: false,
      reason:
        "You've reached your active project limit. Archive an existing project or upgrade your plan to add more.",
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
  if (billing.trialExpired && !isPaidActive(billing)) {
    return {
      ok: false,
      reason: 'Your free trial has ended. Select a paid plan to continue.',
    }
  }
  return { ok: true }
}

export async function assertCanUseAiAssist(
  supabase: SupabaseLike,
  accountId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const billing = await getAccountBillingState(supabase, accountId)
  if (billing.trialExpired && !isPaidActive(billing)) {
    return {
      ok: false,
      reason: 'Your free trial has ended. Select a paid plan to continue.',
    }
  }

  const tier = effectiveTierForState(billing)
  const plan = planForTier(tier)

  const used = await getMonthlyAiGenerationCount(
    supabase,
    accountId,
    new Date(),
    usageKeyForState(billing),
  )
  const cap = plan.maxAIGenerationsPerMonth
  if (typeof cap === 'number' && Number.isFinite(cap) && used >= cap) {
    return {
      ok: false,
      reason: "You've reached your monthly AI generation limit. Upgrade your plan to continue.",
    }
  }
  return { ok: true }
}

export async function assertCanRunClashGapReport(
  supabase: SupabaseLike,
  accountId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const billing = await getAccountBillingState(supabase, accountId)
  if (billing.trialExpired && !isPaidActive(billing)) {
    return {
      ok: false,
      reason: 'Your free trial has ended. Select a paid plan to continue.',
    }
  }

  const tier = effectiveTierForState(billing)
  const plan = planForTier(tier)
  const used = await getMonthlyClashGapReportCount(
    supabase,
    accountId,
    new Date(),
    usageKeyForState(billing),
  )
  const cap = plan.maxClashGapReportsPerMonth
  if (typeof cap === 'number' && Number.isFinite(cap) && used >= cap) {
    return {
      ok: false,
      reason: "You've reached your monthly Clash/Gap report limit. Upgrade your plan to continue.",
    }
  }
  return { ok: true }
}

export async function assertWithinStorageLimit(
  supabase: SupabaseLike,
  accountId: string,
  additionalBytes: number
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const billing = await getAccountBillingState(supabase, accountId)
  if (billing.trialExpired && !isPaidActive(billing)) {
    return {
      ok: false,
      reason: 'Your free trial has ended. Select a paid plan to continue.',
    }
  }
  const tier = effectiveTierForState(billing)
  const plan = planForTier(tier)
  const capBytes = plan.maxStorageGB * 1024 * 1024 * 1024
  const next = billing.storageUsedBytes + Math.max(0, Math.floor(additionalBytes))
  if (next > capBytes) {
    return {
      ok: false,
      reason:
        "You've reached your storage limit. Delete files or upgrade your plan for more storage.",
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
  void featureName
  if (billing.trialExpired && !isPaidActive(billing)) {
    return {
      ok: false,
      reason: 'Your free trial has ended. Select a paid plan to continue.',
    }
  }
  return { ok: true }
}

export async function downgradeAccountToFree(supabase: SupabaseLike, accountId: string) {
  const { error } = await supabase
    .from('accounts')
    .update({
      stripe_customer_id: null,
      subscription_tier: 'trial',
      billing_status: 'canceled',
      stripe_subscription_id: null,
      stripe_price_id: null,
      current_period_end: null,
      cancel_at: null,
    })
    .eq('id', accountId)
  if (error) throw new Error(error.message)
}
