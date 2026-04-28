import Stripe from 'stripe'
import { writeAuditLog } from '@/lib/server/audit'
import { downgradeAccountToFree } from '@/lib/server/billing'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { getStripeClient } from '@/lib/server/stripe'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const stripe = getStripeClient()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !secret) return new Response('Stripe not configured', { status: 500 })

  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch (e) {
    return new Response(`Invalid signature: ${e instanceof Error ? e.message : ''}`, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()
  if (!supabase) return new Response('Supabase admin not configured', { status: 500 })

  const accountIdByCustomer = new Map<string, string>()
  const accountIdForCustomer = async (customerId: string): Promise<string | null> => {
    if (accountIdByCustomer.has(customerId)) return accountIdByCustomer.get(customerId) || null
    const { data } = await (supabase.from('accounts' as any) as any)
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    const id = data?.id ? String(data.id) : null
    if (id) accountIdByCustomer.set(customerId, id)
    return id
  }

  const logBilling = async (
    customerId: string | null,
    eventType: string,
    eventData: Record<string, unknown>
  ) => {
    if (!customerId) return
    const accountId = await accountIdForCustomer(customerId)
    if (!accountId) return
    await writeAuditLog(
      {
        accountId,
        actorType: 'system',
        eventType,
        eventData: { stripe_customer_id: customerId, ...eventData },
      },
      supabase as any
    )
  }

  const updateByCustomer = async (customerId: string, updates: Record<string, unknown>) => {
    await (supabase.from('accounts' as any) as any)
      .update(updates)
      .eq('stripe_customer_id', customerId)
  }

  const updateByAccount = async (accountId: string, updates: Record<string, unknown>) => {
    await (supabase.from('accounts' as any) as any).update(updates).eq('id', accountId)
  }

  const toIsoFromUnix = (unixSeconds: number | null | undefined) => {
    if (typeof unixSeconds !== 'number' || !Number.isFinite(unixSeconds)) return null
    return new Date(unixSeconds * 1000).toISOString()
  }

  const resolveInvoiceSubscriptionState = async (invoice: Stripe.Invoice) => {
    const invoiceSubscription =
      typeof (invoice as any).subscription === 'string'
        ? ((invoice as any).subscription as string)
        : null
    if (invoiceSubscription) {
      try {
        const subscription = await stripe.subscriptions.retrieve(invoiceSubscription)
        const priceId = subscription.items.data[0]?.price?.id ?? null
        return {
          currentPeriodEnd: toIsoFromUnix(subscription.current_period_end),
          cancelAt: toIsoFromUnix(subscription.cancel_at),
          subscriptionId: subscription.id,
          priceId,
          tier: resolveTierFromPrice(priceId),
          status: subscription.status,
        }
      } catch {
        // Fall back to invoice line period end if subscription lookup fails.
      }
    }

    const invoiceLinePeriodEnd = invoice.lines.data[0]?.period?.end
    return {
      currentPeriodEnd: toIsoFromUnix(invoiceLinePeriodEnd),
      cancelAt: null,
      subscriptionId: invoiceSubscription,
      priceId: null,
      tier: null,
      status: null,
    }
  }

  const resolveTierFromPrice = (priceId: string | null) => {
    if (priceId === process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY) return 'enterprise'
    if (priceId === process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY) return 'professional'
    return 'free'
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const customerId = typeof session.customer === 'string' ? session.customer : null
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null
      const metadataAccountId =
        typeof session.metadata?.account_id === 'string' && session.metadata.account_id.trim()
          ? session.metadata.account_id
          : null
      let currentPeriodEnd: string | null = null
      let priceId: string | null = null
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString()
        priceId = subscription.items.data[0]?.price?.id ?? null
      }

      if (metadataAccountId) {
        await updateByAccount(metadataAccountId, {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          stripe_price_id: priceId,
          current_period_end: currentPeriodEnd,
          cancel_at: null,
          billing_status: 'active',
          subscription_tier: resolveTierFromPrice(priceId),
        })
      } else if (customerId) {
        await updateByCustomer(customerId, {
          stripe_subscription_id: subscriptionId,
          stripe_price_id: priceId,
          current_period_end: currentPeriodEnd,
          cancel_at: null,
          billing_status: 'active',
          subscription_tier: resolveTierFromPrice(priceId),
        })
      }
      if (customerId) {
        await logBilling(customerId, 'billing.checkout_completed', {
          stripe_session_id: session.id,
          stripe_subscription_id: subscriptionId,
          stripe_price_id: priceId,
          current_period_end: currentPeriodEnd,
          mode: session.mode,
          status: session.status,
          payment_status: session.payment_status,
        })
      }
    }

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : null
      const priceId = sub.items.data[0]?.price?.id ?? null
      const currentPeriodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null
      const cancelAt = sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null
      if (customerId) {
        await updateByCustomer(customerId, {
          stripe_subscription_id: sub.id,
          stripe_price_id: priceId,
          current_period_end: currentPeriodEnd,
          cancel_at: cancelAt,
          billing_status: sub.status,
          subscription_tier: resolveTierFromPrice(priceId),
        })
        await logBilling(customerId, 'billing.subscription_updated', {
          stripe_subscription_id: sub.id,
          stripe_price_id: priceId,
          current_period_end: currentPeriodEnd,
          cancel_at: cancelAt,
          status: sub.status,
          cancel_at_period_end: sub.cancel_at_period_end,
        })
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : null
      if (customerId) {
        const accountId = await accountIdForCustomer(customerId)
        if (accountId) {
          await downgradeAccountToFree(supabase as any, accountId)
        }
        await logBilling(customerId, 'billing.subscription_deleted', {
          stripe_subscription_id: sub.id,
          status: sub.status,
        })
      }
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : null
      const { currentPeriodEnd, cancelAt, subscriptionId, priceId, tier, status } =
        await resolveInvoiceSubscriptionState(invoice)
      if (customerId) {
        await updateByCustomer(customerId, {
          stripe_subscription_id: subscriptionId,
          stripe_price_id: priceId,
          subscription_tier: tier,
          billing_status: status ?? 'active',
          current_period_end: currentPeriodEnd,
          cancel_at: cancelAt,
        })
        await logBilling(customerId, 'billing.invoice_paid', {
          stripe_invoice_id: invoice.id,
          stripe_subscription_id: subscriptionId,
          stripe_price_id: priceId,
          subscription_tier: tier,
          current_period_end: currentPeriodEnd,
          cancel_at: cancelAt,
          status: status ?? 'active',
          amount_paid: invoice.amount_paid,
        })
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : null
      if (customerId) {
        await updateByCustomer(customerId, { billing_status: 'past_due' })
        await logBilling(customerId, 'billing.payment_failed', {
          stripe_invoice_id: invoice.id,
          stripe_subscription_id:
            typeof (invoice as any).subscription === 'string'
              ? ((invoice as any).subscription as string)
              : null,
          amount_due: invoice.amount_due,
          attempt_count: invoice.attempt_count,
        })
      }
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session
      const customerId = typeof session.customer === 'string' ? session.customer : null
      await logBilling(customerId, 'billing.checkout_expired', {
        stripe_session_id: session.id,
        mode: session.mode,
        status: session.status,
      })
    }
  } catch (e) {
    return new Response(`Webhook handler failed: ${e instanceof Error ? e.message : 'unknown'}`, {
      status: 500,
    })
  }

  return new Response('ok')
}

