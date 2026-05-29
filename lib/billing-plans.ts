export type AppBillingTier = 'trial' | 'starter' | 'professional' | 'business'

export type BillingCycle = 'trial' | 'month'

export type AppBillingPlan = {
  planId: string
  planName: string
  price: number
  billingCycle: BillingCycle
  maxActiveProjects: number | null
  maxAIGenerationsPerMonth: number | null
  maxClashGapReportsPerMonth: number | null
  maxStorageGB: number
  isTrial: boolean
  trialDurationDays: number | null
  highlight?: 'most_popular'
}

export const BILLING_PLANS: AppBillingPlan[] = [
  {
    planId: 'plan-free-trial',
    planName: 'Free Trial',
    price: 0,
    billingCycle: 'trial',
    maxActiveProjects: 2,
    maxAIGenerationsPerMonth: 10,
    maxClashGapReportsPerMonth: 3,
    maxStorageGB: 1,
    isTrial: true,
    trialDurationDays: 14,
  },
  {
    planId: 'plan-starter',
    planName: 'Starter',
    price: 29,
    billingCycle: 'month',
    maxActiveProjects: 5,
    maxAIGenerationsPerMonth: 50,
    maxClashGapReportsPerMonth: 5,
    maxStorageGB: 2,
    isTrial: false,
    trialDurationDays: null,
  },
  {
    planId: 'plan-professional',
    planName: 'Professional',
    price: 79,
    billingCycle: 'month',
    maxActiveProjects: 25,
    maxAIGenerationsPerMonth: 300,
    maxClashGapReportsPerMonth: 30,
    maxStorageGB: 20,
    isTrial: false,
    trialDurationDays: null,
    highlight: 'most_popular',
  },
  {
    planId: 'plan-business',
    planName: 'Business',
    price: 149,
    billingCycle: 'month',
    maxActiveProjects: null,
    maxAIGenerationsPerMonth: null,
    maxClashGapReportsPerMonth: 100,
    maxStorageGB: 100,
    isTrial: false,
    trialDurationDays: null,
  },
]

export function normalizeTier(raw: string | null | undefined): AppBillingTier {
  const v = (raw ?? '').trim().toLowerCase()
  if (v === 'business') return 'business'
  if (v === 'professional' || v === 'pro') return 'professional'
  if (v === 'starter') return 'starter'
  return 'trial'
}

export function planForTier(raw: string | null | undefined): AppBillingPlan {
  const tier = normalizeTier(raw)
  const planId =
    tier === 'starter'
      ? 'plan-starter'
      : tier === 'professional'
        ? 'plan-professional'
        : tier === 'business'
          ? 'plan-business'
          : 'plan-free-trial'
  return BILLING_PLANS.find((p) => p.planId === planId) ?? BILLING_PLANS[0]
}
