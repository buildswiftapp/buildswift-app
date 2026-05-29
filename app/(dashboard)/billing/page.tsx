'use client'

import { useEffect, useMemo, useState, type ElementType } from 'react'
import { useSearchParams } from 'next/navigation'
import { BrickWall, Check, FileDown, FolderKanban, HardDrive, Shield, Sparkles, Sprout, Star } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { BILLING_PLANS, type AppBillingTier, type AppBillingPlan } from '@/lib/billing-plans'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type BillingSummary = {
  tier: AppBillingTier
  plan_name: string
  billing_status: string
  current_period_end: string | null
  cancel_at: string | null
  ai_generations_used: number
  ai_generations_limit: number | null
  clash_gap_reports_used: number
  clash_gap_reports_limit: number | null
  active_projects_used: number
  active_projects_limit: number | null
  storage_used_gb: number
  storage_limit_gb: number
  trial_start_date: string | null
  trial_end_date: string | null
  trial_expired: boolean
}

const toTierForCheckout = (tier: AppBillingTier): 'starter' | 'professional' | 'business' =>
  tier === 'business' ? 'business' : tier === 'professional' ? 'professional' : 'starter'

const TIER_ICONS: Record<'trial' | 'starter' | 'professional' | 'business', ElementType> = {
  trial: Sprout,
  starter: Sprout,
  professional: BrickWall,
  business: Shield,
}

export default function BillingPage() {
  const searchParams = useSearchParams()
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [fetchingSummaryCount, setFetchingSummaryCount] = useState(0)
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null)
  const [schedulingDowngrade, setSchedulingDowngrade] = useState(false)
  const [cancelingDowngrade, setCancelingDowngrade] = useState(false)
  const [checkoutNotice, setCheckoutNotice] = useState<{
    tone: 'success' | 'error' | 'info'
    message: string
  } | null>(null)

  const currentPlan = BILLING_PLANS.find((p) => p.planName === summary?.plan_name)
  const cancelAtLabel = useMemo(() => {
    if (!summary?.cancel_at) return null
    const d = new Date(summary.cancel_at)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }, [summary?.cancel_at])

  const currentPeriodEndLabel = useMemo(() => {
    if (!summary?.current_period_end) return null
    const d = new Date(summary.current_period_end)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }, [summary?.current_period_end])

  const trialEndsLabel = useMemo(() => {
    if (!summary?.trial_end_date) return null
    const d = new Date(summary.trial_end_date)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }, [summary?.trial_end_date])

  const trialDaysLeft = useMemo(() => {
    if (!summary?.trial_end_date) return null
    const endMs = Date.parse(summary.trial_end_date)
    if (Number.isNaN(endMs)) return null
    const diff = Math.ceil((endMs - Date.now()) / (1000 * 60 * 60 * 24))
    return diff
  }, [summary?.trial_end_date])

  const warn = (used: number, limit: number | null) => {
    if (limit === null) return false
    if (!Number.isFinite(limit) || limit <= 0) return false
    return used / limit >= 0.8
  }

  const withSummarySpinner = async <T,>(fn: () => Promise<T>): Promise<T> => {
    setFetchingSummaryCount((c) => c + 1)
    try {
      return await fn()
    } finally {
      setFetchingSummaryCount((c) => Math.max(0, c - 1))
    }
  }

  const loadBillingSummary = async () => {
    return await withSummarySpinner(async () => {
      const data = await apiFetch<BillingSummary>('/api/billing/summary')
      setSummary(data)
      return data
    })
  }

  const refreshBillingSummaryWithRetry = async (attempts = 4, delayMs = 700) => {
    return await withSummarySpinner(async () => {
      for (let i = 0; i < attempts; i += 1) {
        try {
          const data = await apiFetch<BillingSummary>('/api/billing/summary')
          setSummary(data)
          if (data.tier !== 'free' || data.billing_status === 'active') return data
        } catch {
        }
        if (i < attempts - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, delayMs))
        }
      }
      return null
    })
  }

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const data = await withSummarySpinner(() => apiFetch<BillingSummary>('/api/billing/summary'))
        if (active) setSummary(data)
      } catch (e) {
        if (active) toast.error(e instanceof Error ? e.message : 'Failed to load billing summary')
      } finally {
        if (active) setLoadingSummary(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const clearQuery = () => {
      const q = new URLSearchParams(window.location.search)
      q.delete('checkout')
      q.delete('session_id')
      const next = q.toString()
      window.history.replaceState({}, '', next ? `/billing?${next}` : '/billing')
    }
    const checkoutState = searchParams.get('checkout')
    const sessionId = searchParams.get('session_id')
    if (checkoutState === 'success' && sessionId) {
      void (async () => {
        try {
          const result = await apiFetch<{
            paid: boolean
            status: string
            payment_status: string
          }>(`/api/billing/checkout-status?session_id=${encodeURIComponent(sessionId)}`)
          if (cancelled) return
          if (result.paid) {
            await refreshBillingSummaryWithRetry()
            setCheckoutNotice({
              tone: 'success',
              message: 'Payment successful. Your subscription is active.',
            })
            toast.success('Payment successful. Your subscription is active.')
          } else {
            setCheckoutNotice({
              tone: 'error',
              message: 'Payment was not completed. Please try again.',
            })
            toast.error('Payment was not completed. Please try again.')
          }
        } catch (e) {
          if (cancelled) return
          const msg = e instanceof Error ? e.message : 'Unable to verify checkout status'
          setCheckoutNotice({ tone: 'error', message: msg })
          toast.error(msg)
        } finally {
          if (!cancelled) window.setTimeout(clearQuery, 600)
        }
      })()
      return () => {
        cancelled = true
      }
    }

    if (checkoutState === 'success') {
      setCheckoutNotice({
        tone: 'success',
        message: 'Checkout completed successfully.',
      })
      toast.success('Checkout completed successfully.')
      clearQuery()
    } else if (checkoutState === 'cancelled') {
      setCheckoutNotice({
        tone: 'info',
        message: 'Checkout cancelled.',
      })
      toast.info('Checkout cancelled.')
      clearQuery()
    }
    return () => {
      cancelled = true
    }
  }, [searchParams])

  const handleUpgrade = async (tier: AppBillingTier, planId: string) => {
    try {
      setLoadingPlanId(planId)
      const { url } = await apiFetch<{ url: string }>('/api/billing/checkout', {
        method: 'POST',
        json: { tier: toTierForCheckout(tier) },
      })
      window.location.href = url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to start Stripe checkout')
    } finally {
      setLoadingPlanId(null)
    }
  }

  const tierForPlan = (plan: AppBillingPlan): AppBillingTier => {
    if (plan.planId === 'plan-business') return 'business'
    if (plan.planId === 'plan-professional') return 'professional'
    if (plan.planId === 'plan-starter') return 'starter'
    return 'trial'
  }

  const renderPlanFooter = (plan: AppBillingPlan, isCurrentPlan: boolean) => {
    if (isCurrentPlan) {
      return (
        <Button disabled className="w-full rounded-lg bg-[#111827] text-white opacity-100 hover:bg-[#111827]">
          Current Plan
        </Button>
      )
    }

    const tier = tierForPlan(plan)
    if (tier === 'trial') {
      return (
        <Button variant="outline" className="w-full rounded-lg" disabled>
          Included at signup
        </Button>
      )
    }

    return (
      <Button
        className={cn(
          'w-full rounded-lg',
          plan.highlight === 'most_popular' ? 'bg-[#4F46E5] text-white hover:bg-[#4338CA]' : 'bg-black text-white hover:bg-black/90',
        )}
        onClick={() => void handleUpgrade(tier, plan.planId)}
        disabled={loadingPlanId === plan.planId}
      >
        {loadingPlanId === plan.planId ? 'Redirecting...' : `Choose ${plan.planName}`}
      </Button>
    )
  }

  const showSpinner = loadingSummary || fetchingSummaryCount > 0
  const bannerPlanName = currentPlan?.planName ?? summary?.plan_name ?? 'Free Trial'

  return (
    <div className="min-h-full bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-[#e2e8f0] bg-white px-6 py-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight text-[#111827]">Billing</h1>
          <p className="mt-1 text-sm leading-tight text-[#64748b]">
            Manage subscription, payment details, and invoices.
          </p>
        </div>
      </div>
      <div className="app-page relative space-y-6 bg-[#f4f6f9]">
        {showSpinner ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f4f6f9]/75 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-lg">
              <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700" />
              <p className="text-sm font-medium text-slate-600">Loading billing data…</p>
            </div>
          </div>
        ) : null}
        {checkoutNotice ? (
          <div
            className={cn(
              'rounded-lg border px-4 py-3 text-sm',
              checkoutNotice.tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
              checkoutNotice.tone === 'error' && 'border-rose-200 bg-rose-50 text-rose-900',
              checkoutNotice.tone === 'info' && 'border-sky-200 bg-sky-50 text-sky-900'
            )}
          >
            {checkoutNotice.message}
          </div>
        ) : null}
        {summary?.tier !== 'free' && cancelAtLabel ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>
              {`Plan: ${bannerPlanName} (changes on ${cancelAtLabel}). You keep full ${bannerPlanName} access until this date, then your account switches to ${scheduledDowngradeTargetLabel} automatically.`}
            </p>
            <div className="mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCancelScheduledDowngrade()}
                disabled={cancelingDowngrade}
              >
                {cancelingDowngrade ? 'Canceling...' : `Keep ${bannerPlanName}`}
              </Button>
            </div>
          </div>
        ) : null}
        {summary?.tier !== 'free' && !cancelAtLabel && currentPeriodEndLabel ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <p>
              {`Plan: ${bannerPlanName} renews on ${currentPeriodEndLabel}. This is your current billing period expiration date.`}
            </p>
          </div>
        ) : null}
        {summary?.tier === 'trial' && trialEndsLabel ? (
          <div
            className={cn(
              'rounded-lg border px-4 py-3 text-sm',
              summary.trial_expired
                ? 'border-red-200 bg-red-50 text-red-900'
                : trialDaysLeft !== null && trialDaysLeft <= 3
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900',
            )}
          >
            <p>
              {summary.trial_expired
                ? `Your Free Trial ended on ${trialEndsLabel}. Choose a paid plan to continue using AI features.`
                : `Free Trial ends on ${trialEndsLabel}${trialDaysLeft !== null ? ` (${Math.max(0, trialDaysLeft)} day${trialDaysLeft === 1 ? '' : 's'} left)` : ''}.`}
            </p>
          </div>
        ) : null}
        <Card className="app-surface border border-[#e8eaef] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Current Plan</CardTitle>
                <CardDescription>
                  {loadingSummary ? 'Loading plan details...' : `You are currently on the ${currentPlan?.planName ?? 'Free Trial'} plan`}
                </CardDescription>
              </div>
              <Badge className="gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-[#4F46E5] hover:bg-violet-50">
                <Star className="h-3.5 w-3.5 fill-current" />
                <span className="text-sm font-semibold">{currentPlan?.planName ?? 'Free Trial'}</span>
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-violet-50 text-[#4F46E5]">
                  <FolderKanban className="h-5 w-5" />
                </span>
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Active Projects</span>
                    <span className="text-muted-foreground">
                      {summary
                        ? `${summary.active_projects_used} / ${summary.active_projects_limit === null ? 'Unlimited' : summary.active_projects_limit}`
                        : '—'}
                    </span>
                  </div>
                  <Progress
                    value={
                      summary && typeof summary.active_projects_limit === 'number' && summary.active_projects_limit > 0
                        ? (summary.active_projects_used / summary.active_projects_limit) * 100
                        : 0
                    }
                    className="h-2"
                  />
                  {summary && warn(summary.active_projects_used, summary.active_projects_limit) ? (
                    <p className="text-xs font-medium text-amber-700">
                      You’re at 80%+ of your active project limit.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-violet-50 text-[#4F46E5]">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">AI Generations</span>
                    <span className="text-muted-foreground">
                      {summary
                        ? `${summary.ai_generations_used} / ${summary.ai_generations_limit === null ? 'High-volume' : summary.ai_generations_limit}`
                        : '—'}
                    </span>
                  </div>
                  <Progress
                    value={
                      summary && typeof summary.ai_generations_limit === 'number' && summary.ai_generations_limit > 0
                        ? (summary.ai_generations_used / summary.ai_generations_limit) * 100
                        : 0
                    }
                    className="h-2"
                  />
                  {summary && warn(summary.ai_generations_used, summary.ai_generations_limit) ? (
                    <p className="text-xs font-medium text-amber-700">
                      You’re at 80%+ of your monthly AI generation limit.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-violet-50 text-[#4F46E5]">
                  <FileDown className="h-5 w-5" />
                </span>
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Clash/Gap Reports</span>
                    <span className="text-muted-foreground">
                      {summary
                        ? `${summary.clash_gap_reports_used} / ${summary.clash_gap_reports_limit === null ? '—' : summary.clash_gap_reports_limit}`
                        : '—'}
                    </span>
                  </div>
                  <Progress
                    value={
                      summary && typeof summary.clash_gap_reports_limit === 'number' && summary.clash_gap_reports_limit > 0
                        ? (summary.clash_gap_reports_used / summary.clash_gap_reports_limit) * 100
                        : 0
                    }
                    className="h-2"
                  />
                  {summary && warn(summary.clash_gap_reports_used, summary.clash_gap_reports_limit) ? (
                    <p className="text-xs font-medium text-amber-700">
                      You’re at 80%+ of your monthly Clash/Gap report limit.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-violet-50 text-[#4F46E5]">
                  <HardDrive className="h-5 w-5" />
                </span>
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Storage</span>
                    <span className="text-muted-foreground">
                      {summary ? `${summary.storage_used_gb.toFixed(2)} / ${summary.storage_limit_gb} GB` : '—'}
                    </span>
                  </div>
                  <Progress
                    value={summary ? (summary.storage_used_gb / summary.storage_limit_gb) * 100 : 0}
                    className="h-2"
                  />
                  {summary && summary.storage_used_gb / summary.storage_limit_gb >= 0.8 ? (
                    <p className="text-xs font-medium text-amber-700">
                      You’re at 80%+ of your storage limit.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-4 text-lg font-bold tracking-tight text-black">Available Plans</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {BILLING_PLANS.filter((p) => p.planId !== 'plan-free-trial').map((plan) => {
              const tier = tierForPlan(plan)
              const isCurrentPlan = tier === summary?.tier
              const TierIcon = TIER_ICONS[tier]
              const isMostPopular = plan.highlight === 'most_popular'
              const showPopularBadge = isMostPopular
              const popularBadgeLabel = isCurrentPlan ? 'CURRENT PLAN' : 'MOST POPULAR'

              return (
                <Card
                  key={plan.planId}
                  className={cn(
                    'relative flex flex-col overflow-visible rounded-2xl border bg-white pb-6 pt-10 shadow-[0_1px_2px_rgba(15,23,42,0.06)]',
                    isMostPopular ? 'border-2 border-[#4F46E5]' : 'border border-[#e5e7eb]'
                  )}
                >
                  {showPopularBadge ? (
                    <div className="pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2">
                      <span className="whitespace-nowrap rounded-full bg-[#4F46E5] px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
                        {popularBadgeLabel}
                      </span>
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      'border-b border-[#ebeef2] px-6 pb-6 text-left',
                      showPopularBadge ? 'pt-1' : 'pt-2'
                    )}
                  >
                    <div
                      className={cn(
                        'grid h-14 w-14 shrink-0 place-items-center rounded-full',
                        isMostPopular ? 'bg-violet-50 text-[#4F46E5]' : 'bg-slate-50 text-slate-700',
                      )}
                    >
                      {TierIcon ? <TierIcon className="h-8 w-8" aria-hidden /> : null}
                    </div>

                    <h3 className="mt-4 text-lg font-bold text-black">{plan.planName}</h3>
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                      <span className="text-3xl font-bold text-black">${plan.price}</span>
                      <span className="text-sm font-medium text-blue-600">/month</span>
                    </div>
                    <p className="mt-2 max-w-none text-sm leading-snug text-[#6B7280]">
                      All plans include the same AI intelligence and core platform features. Upgrade only when your workload grows.
                    </p>
                  </div>

                  <CardContent className="flex flex-1 flex-col px-6 pt-6 pb-2">
                    <ul className="flex w-full flex-col gap-3">
                      <li className="flex items-start gap-2.5 text-left">
                        <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#22C55E]" strokeWidth={2.5} />
                        <span className="text-sm leading-snug text-[#374151]">
                          Active projects: {plan.maxActiveProjects === null ? 'Unlimited' : plan.maxActiveProjects}
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5 text-left">
                        <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#22C55E]" strokeWidth={2.5} />
                        <span className="text-sm leading-snug text-[#374151]">
                          AI generations/month: {plan.maxAIGenerationsPerMonth === null ? 'High-volume (fair use)' : plan.maxAIGenerationsPerMonth}
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5 text-left">
                        <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#22C55E]" strokeWidth={2.5} />
                        <span className="text-sm leading-snug text-[#374151]">
                          Clash/Gap reports/month: {plan.maxClashGapReportsPerMonth ?? '—'}
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5 text-left">
                        <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#22C55E]" strokeWidth={2.5} />
                        <span className="text-sm leading-snug text-[#374151]">Storage: {plan.maxStorageGB} GB</span>
                      </li>
                    </ul>
                  </CardContent>

                  <CardFooter className="mt-auto flex w-full flex-col items-stretch gap-2 border-0 px-6 pb-0 pt-4">
                    {renderPlanFooter(plan, isCurrentPlan)}
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
