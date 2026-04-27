import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { normalizeTier, planForTier } from '@/lib/billing-plans'
import { getAuthContext } from '@/lib/server/auth'
import { getMonthlyDocumentUsage } from '@/lib/server/billing'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

export async function GET(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const { data: account, error } = await supabase
    .from('accounts')
    .select('subscription_tier,billing_status,current_period_end,cancel_at')
    .eq('id', auth.accountId)
    .maybeSingle()
  if (error) return serverError(error.message)

  const tier = normalizeTier(typeof account?.subscription_tier === 'string' ? account.subscription_tier : 'free')
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
    billing_status:
      typeof account?.billing_status === 'string' && account.billing_status.trim()
        ? account.billing_status
        : 'active',
    current_period_end:
      typeof account?.current_period_end === 'string' ? account.current_period_end : null,
    cancel_at: typeof account?.cancel_at === 'string' ? account.cancel_at : null,
    documents_used: documentsUsed,
    documents_limit: plan.documentsLimit,
    ai_generations_used: 0,
    ai_generations_limit: plan.aiGenerationsLimit,
  })
}

