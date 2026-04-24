import Stripe from 'stripe'
import { writeAuditLog } from '@/lib/server/audit'
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

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const customerId = typeof session.customer === 'string' ? session.customer : null
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null
      if (customerId) {
        await updateByCustomer(customerId, {
          stripe_subscription_id: subscriptionId,
          billing_status: 'active',
        })
        await logBilling(customerId, 'billing.checkout_completed', {
          stripe_session_id: session.id,
          stripe_subscription_id: subscriptionId,
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
      if (customerId) {
        await updateByCustomer(customerId, {
          stripe_subscription_id: sub.id,
          stripe_price_id: priceId,
          billing_status: sub.status,
          subscription_tier:
            priceId === process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY
              ? 'enterprise'
              : priceId === process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY
                ? 'professional'
                : 'free',
        })
        await logBilling(customerId, 'billing.subscription_updated', {
          stripe_subscription_id: sub.id,
          stripe_price_id: priceId,
          status: sub.status,
          cancel_at_period_end: sub.cancel_at_period_end,
        })
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : null
      if (customerId) {
        await updateByCustomer(customerId, {
          stripe_subscription_id: null,
          stripe_price_id: null,
          billing_status: 'inactive',
          subscription_tier: 'free',
        })
        await logBilling(customerId, 'billing.subscription_deleted', {
          stripe_subscription_id: sub.id,
          status: sub.status,
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

