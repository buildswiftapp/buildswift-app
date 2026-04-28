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

  const body = await req.json().catch(() => ({}))
  const requestedToTierRaw = typeof (body as any)?.toTier === 'string' ? String((body as any).toTier) : ''
  const requestedToTier = requestedToTierRaw.trim().toLowerCase() === 'professional' ? 'professional' : 'free'

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
    // Professional -> Free (cancel at period end)
    if (requestedToTier === 'free') {
      const updated: any = await stripe.subscriptions.update(subscriptionId, {
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
          eventData: { cancel_at: cancelAt, current_period_end: currentPeriodEnd, to_tier: 'free' },
        },
        supabase as any
      )

      return ok({
        scheduled: true,
        cancel_at: cancelAt,
        current_period_end: currentPeriodEnd,
        message: cancelAt
          ? `Downgrade scheduled. Pro access remains active until ${new Date(cancelAt).toLocaleDateString(
              'en-US'
            )}.`
          : 'Downgrade scheduled at period end.',
      })
    }

    // Enterprise -> Professional (switch price at period end using a Stripe Subscription Schedule)
    if (currentTier !== 'enterprise') {
      return badRequest('Only Enterprise subscriptions can be downgraded to Professional.')
    }
    const proPriceId = process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY || null
    const enterprisePriceId = process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || null
    if (!proPriceId || !enterprisePriceId) return serverError('Stripe price IDs are not configured')

    const sub: any = await stripe.subscriptions.retrieve(subscriptionId)

    const resolveBillingPeriod = async (): Promise<{ start: number; end: number } | null> => {
      const start = typeof sub?.current_period_start === 'number' ? sub.current_period_start : null
      const end = typeof sub?.current_period_end === 'number' ? sub.current_period_end : null
      if (start && end) return { start, end }

      // Fallback: some Stripe objects (or older states) may not include current_period_*.
      // Use the most recent invoice line period for this subscription.
      try {
        const invoices: any = await stripe.invoices.list({ subscription: subscriptionId, limit: 1 })
        const line = invoices?.data?.[0]?.lines?.data?.[0]
        const lineStart = typeof line?.period?.start === 'number' ? line.period.start : null
        const lineEnd = typeof line?.period?.end === 'number' ? line.period.end : null
        if (lineStart && lineEnd) return { start: lineStart, end: lineEnd }
      } catch {
        // ignore
      }

      return null
    }

    const period = await resolveBillingPeriod()
    if (!period) return serverError('Unable to determine the current billing period from Stripe.')

    const currentPeriodStart = period.start
    const currentPeriodEndUnix = period.end
    const cancelAt = new Date(currentPeriodEndUnix * 1000).toISOString()
    const currentPeriodEnd = cancelAt

    const schedule = await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId })
    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: 'release',
      phases: [
        {
          start_date: currentPeriodStart,
          end_date: currentPeriodEndUnix,
          items: [{ price: enterprisePriceId, quantity: 1 }],
        },
        {
          start_date: currentPeriodEndUnix,
          items: [{ price: proPriceId, quantity: 1 }],
        },
      ],
    })

    const { error: updateErr } = await (supabase.from('accounts' as any) as any)
      .update({
        cancel_at: cancelAt,
        current_period_end: currentPeriodEnd,
        billing_status: sub.status,
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
        eventData: { cancel_at: cancelAt, current_period_end: currentPeriodEnd, to_tier: 'professional' },
      },
      supabase as any
    )

    return ok({
      scheduled: true,
      cancel_at: cancelAt,
      current_period_end: currentPeriodEnd,
      message: `Downgrade scheduled. Enterprise access remains active until ${new Date(cancelAt).toLocaleDateString(
        'en-US'
      )}, then your plan switches to Professional.`,
    })
  } catch (e) {
    return serverError(e instanceof Error ? e.message : 'Failed to schedule downgrade')
  }
}

