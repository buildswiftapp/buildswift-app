export type AppBillingTier = 'free' | 'professional' | 'enterprise'

export type AppBillingPlan = {
  id: string
  name: string
  tier: AppBillingTier
  price: number
  documentsLimit: number
  aiGenerationsLimit: number
  features: string[]
}

export const BILLING_PLANS: AppBillingPlan[] = [
  {
    id: 'plan-free',
    name: 'Free',
    tier: 'free',
    price: 0,
    documentsLimit: 5,
    aiGenerationsLimit: 0,
    features: [
      'Up to 5 documents per month',
      'Single reviewer only',
      'No PDF export',
      'No Missing Scope AI',
      'No branding',
    ],
  },
  {
    id: 'plan-professional',
    name: 'Professional',
    tier: 'professional',
    price: 29,
    documentsLimit: -1,
    aiGenerationsLimit: -1,
    features: [
      'Unlimited documents',
      'Multi-reviewer approvals',
      'PDF export',
      'Missing Scope AI',
      'Custom branding',
    ],
  },
  {
    id: 'plan-enterprise',
    name: 'Enterprise',
    tier: 'enterprise',
    price: 49,
    documentsLimit: -1,
    aiGenerationsLimit: -1,
    features: [
      'Everything in Professional',
      'SSO integration',
      'Advanced analytics',
      'API access',
      'Dedicated support',
    ],
  },
]

export function normalizeTier(raw: string | null | undefined): AppBillingTier {
  if (raw === 'enterprise') return 'enterprise'
  if (raw === 'professional' || raw === 'pro') return 'professional'
  return 'free'
}

export function planForTier(raw: string | null | undefined): AppBillingPlan {
  const tier = normalizeTier(raw)
  return BILLING_PLANS.find((plan) => plan.tier === tier) ?? BILLING_PLANS[0]
}

