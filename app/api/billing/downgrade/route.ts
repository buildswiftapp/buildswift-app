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
    .select('stripe_subscription_id,subscription_tier,billing_status,cancel_at')
    .eq('id', auth.accountId)
    .maybeSingle()
  if (error) return serverError(error.message)
  if (!account) return badRequest('Account not found')

  const currentTier =
    typeof account.subscription_tier === 'string' ? account.subscription_tier.trim().toLowerCase() : 'free'
  if (currentTier === 'free') {
    return ok({
      scheduled: false,
      message: 'Your account is already on the Free plan.',
    })
  }

  if (account.cancel_at) {
    return ok({
      scheduled: true,
      cancel_at: account.cancel_at,
      message: 'Your downgrade is already scheduled at period end.',
    })
  }

  const subscriptionId =
    typeof account.stripe_subscription_id === 'string' && account.stripe_subscription_id.trim()
      ? account.stripe_subscription_id
      : null

  const stripe = getStripeClient()
  if (!stripe) return serverError('Stripe is not configured')
  if (!subscriptionId) {
    return badRequest('No active Stripe subscription found. Please manage billing in Stripe.')
  }

  try {
    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    })
    const cancelAt = updated.cancel_at ? new Date(updated.cancel_at * 1000).toISOString() : null
    const currentPeriodEnd = updated.current_period_end
      ? new Date(updated.current_period_end * 1000).toISOString()
      : null
    const { error: updateErr } = await (supabase.from('accounts' as any) as any)
      .update({
        cancel_at: cancelAt,
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
        eventType: 'billing.downgrade_scheduled',
        eventData: { cancel_at: cancelAt, current_period_end: currentPeriodEnd },
      },
      supabase as any
    )

    return ok({
      scheduled: true,
      cancel_at: cancelAt,
      current_period_end: currentPeriodEnd,
      message: cancelAt
        ? `Downgrade scheduled. Pro access remains active until ${new Date(cancelAt).toLocaleDateString('en-US')}.`
        : 'Downgrade scheduled at period end.',
    })
  } catch (e) {
    return serverError(e instanceof Error ? e.message : 'Failed to schedule downgrade')
  }
}

