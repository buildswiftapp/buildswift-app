import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { normalizeTier, planForTier } from '@/lib/billing-plans'
import { getAuthContext } from '@/lib/server/auth'
import { getAccountBillingState, getMonthlyDocumentUsage } from '@/lib/server/billing'
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

  let documentsUsed = 0
  try {
    documentsUsed = await getMonthlyDocumentUsage(supabase as any, auth.accountId, undefined, {
      fallbackToDocumentCount: true,
    })
  } catch {
    documentsUsed = 0
  }

  return ok({
    tier,
    plan_name: plan.name,
    billing_status: account.billingStatus,
    current_period_end: account.currentPeriodEnd,
    cancel_at: account.cancelAt,
    documents_used: documentsUsed,
    documents_limit: plan.documentsLimit,
    ai_generations_used: 0,
    ai_generations_limit: plan.aiGenerationsLimit,
  })
}

