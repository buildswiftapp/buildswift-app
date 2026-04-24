import Stripe from 'stripe'

type BillingTier = 'professional' | 'enterprise'

let cachedStripe: Stripe | null = null

export function getStripeClient() {
  if (cachedStripe) return cachedStripe
  if (!process.env.STRIPE_SECRET_KEY) return null
  cachedStripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  return cachedStripe
}

export function getPriceIdForTier(tier: BillingTier): string | null {
  if (tier === 'professional') return process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY || null
  return process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || null
}

