import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { writeAuditLog } from '@/lib/server/audit'
import { getAuthContext } from '@/lib/server/auth'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { getStripeClient } from '@/lib/server/stripe'

export async function POST(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const { data: account, error } = await (supabase.from('accounts' as any) as any)
    .select('stripe_subscription_id,cancel_at')
    .eq('id', auth.accountId)
    .maybeSingle()
  if (error) return serverError(error.message)
  if (!account) return badRequest('Account not found')

  if (!account.cancel_at) {
    return ok({
      canceled: false,
      message: 'No scheduled downgrade found.',
    })
  }

  const subscriptionId =
    typeof account.stripe_subscription_id === 'string' && account.stripe_subscription_id.trim()
      ? account.stripe_subscription_id
      : null
  if (!subscriptionId) return badRequest('No active Stripe subscription found.')

  const stripe = getStripeClient()
  if (!stripe) return serverError('Stripe is not configured')

  try {
    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    })
    const currentPeriodEnd = updated.current_period_end
      ? new Date(updated.current_period_end * 1000).toISOString()
      : null
    const { error: updateErr } = await (supabase.from('accounts' as any) as any)
      .update({
        cancel_at: null,
        current_period_end: currentPeriodEnd,
        billing_status: updated.status,
      })
      .eq('id', auth.accountId)
    if (updateErr) return serverError(updateErr.message)

    await writeAuditLog(
      {
        accountId: auth.accountId,
        actorType: 'user',
        actorUserId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        eventType: 'billing.downgrade_canceled',
        eventData: { current_period_end: currentPeriodEnd },
      },
      supabase as any
    )

    return ok({
      canceled: true,
      message: 'Scheduled downgrade canceled. Your Pro plan will continue.',
    })
  } catch (e) {
    return serverError(e instanceof Error ? e.message : 'Failed to cancel scheduled downgrade')
  }
}

