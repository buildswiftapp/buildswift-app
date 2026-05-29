import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { normalizeTier, planForTier } from '@/lib/billing-plans'
import { getAuthContext } from '@/lib/server/auth'
import {
  countActiveProjects,
  getAccountBillingState,
  getMonthlyAiGenerationCount,
  getMonthlyClashGapReportCount,
} from '@/lib/server/billing'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

export async function GET(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  let account: Awaited<ReturnType<typeof getAccountBillingState>>
  try {
    account = await getAccountBillingState(supabase as any, auth.accountId)
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Failed to load billing state')
  }
  const tier = normalizeTier(account.subscriptionTier)
  const plan = planForTier(tier)

  const usageKey =
    account.currentPeriodStart && !Number.isNaN(Date.parse(account.currentPeriodStart))
      ? new Date(account.currentPeriodStart).toISOString().slice(0, 10)
      : undefined
  const aiGenerationsUsed = await getMonthlyAiGenerationCount(
    supabase as any,
    auth.accountId,
    new Date(),
    usageKey
  )
  const clashGapReportsUsed = await getMonthlyClashGapReportCount(supabase as any, auth.accountId, new Date(), usageKey)
  const activeProjects = await countActiveProjects(supabase as any, auth.accountId)

  const storageUsedGB = account.storageUsedBytes / (1024 * 1024 * 1024)

  return ok({
    tier,
    plan_name: plan.planName,
    billing_status: account.billingStatus,
    current_period_end: account.currentPeriodEnd,
    cancel_at: account.cancelAt,
    ai_generations_used: aiGenerationsUsed,
    ai_generations_limit: plan.maxAIGenerationsPerMonth,
    clash_gap_reports_used: clashGapReportsUsed,
    clash_gap_reports_limit: plan.maxClashGapReportsPerMonth,
    active_projects_used: activeProjects,
    active_projects_limit: plan.maxActiveProjects,
    storage_used_gb: storageUsedGB,
    storage_limit_gb: plan.maxStorageGB,
    trial_start_date: account.trialStartDate,
    trial_end_date: account.trialEndDate,
    trial_expired: account.trialExpired,
  })
}

