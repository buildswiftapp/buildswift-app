export type AppBillingTier = 'free' | 'professional' | 'enterprise'

export type AppBillingPlan = {
  id: string
  name: string
  tier: AppBillingTier
  price: number
  documentsLimit: number
  aiGenerationsLimit: number
  /** null = unlimited active projects */
  maxActiveProjects: number | null
  attachmentsAllowed: boolean
  features: string[]
  tagline: string
  promoFootnote?: string
}

export const BILLING_PLANS: AppBillingPlan[] = [
  {
    id: 'plan-free',
    name: 'Starter',
    tier: 'free',
    price: 0,
    documentsLimit: 5,
    aiGenerationsLimit: 5,
    maxActiveProjects: 1,
    attachmentsAllowed: false,
    tagline: 'Try BuildSwift and experience the speed.',
    features: [
      '1 active project',
      '5 documents per month',
      '5 AI assists per month',
    ],
  },
  {
    id: 'plan-professional',
    name: 'Builder',
    tier: 'professional',
    price: 39,
    documentsLimit: -1,
    aiGenerationsLimit: -1,
    maxActiveProjects: 5,
    attachmentsAllowed: true,
    tagline: 'For everyday project workflows.',
    promoFootnote: 'Most users start here',
    features: [
      'Up to 5 active projects',
      'Unlimited documents',
      'Unlimited AI assists',
      'Attachments included',
    ],
  },
  {
    id: 'plan-enterprise',
    name: 'Pro',
    tier: 'enterprise',
    price: 79,
    documentsLimit: -1,
    aiGenerationsLimit: -1,
    maxActiveProjects: null,
    attachmentsAllowed: true,
    tagline: 'Built for managing multiple projects at scale.',
    features: [
      'Unlimited projects',
      'Unlimited documents',
      'Unlimited AI assists',
      'Early access to new features',
      'Attachments included',
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
