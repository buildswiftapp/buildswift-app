import Stripe from 'stripe'
import { planForTier } from '@/lib/billing-plans'

export type PaidBillingTier = 'starter' | 'professional' | 'business'

let cachedStripe: Stripe | null = null

export function getStripeClient() {
  if (cachedStripe) return cachedStripe
  if (!process.env.STRIPE_SECRET_KEY) return null
  cachedStripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  return cachedStripe
}

export function getPriceIdForTier(tier: PaidBillingTier): string | null {
  if (tier === 'business') return process.env.STRIPE_PRICE_BUSINESS_MONTHLY || null
  if (tier === 'professional') return process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY || null
  return process.env.STRIPE_PRICE_STARTER_MONTHLY || null
}

export function checkoutLineItemForTier(
  tier: PaidBillingTier
): Stripe.Checkout.SessionCreateParams.LineItem {
  const priceId = getPriceIdForTier(tier)
  if (priceId) return { price: priceId, quantity: 1 }

  const plan = planForTier(tier)
  if (plan.price <= 0) {
    throw new Error(`Invalid checkout tier: ${tier}`)
  }

  return {
    quantity: 1,
    price_data: {
      currency: 'usd',
      unit_amount: Math.round(plan.price * 100),
      recurring: { interval: 'month' },
      product_data: {
        name: `BuildSwift ${plan.planName}`,
        metadata: { tier, plan_id: plan.planId },
      },
    },
  }
}
