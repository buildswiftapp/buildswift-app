'use client'

import { useEffect, useMemo, useState, type ElementType } from 'react'
import { useSearchParams } from 'next/navigation'
import { BrickWall, Check, FileText, Shield, Sparkles, Sprout, Star } from 'lucide-react'
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
  documents_used: number
  documents_limit: number
  ai_generations_used: number
  ai_generations_limit: number
}

const toTierForCheckout = (tier: AppBillingTier): 'pro' | 'enterprise' => (tier === 'enterprise' ? 'enterprise' : 'pro')

const TIER_ICONS: Record<'free' | 'professional', ElementType> = {
  free: Sprout,
  professional: BrickWall,
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

  const currentPlan = BILLING_PLANS.find((p) => p.tier === summary?.tier)
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
          // Keep retrying to absorb short webhook/db propagation delays.
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

  const handleScheduleDowngrade = async (toTier: 'free' | 'professional' = 'free') => {
    try {
      setSchedulingDowngrade(true)
      const result = await apiFetch<{ scheduled: boolean; message?: string }>('/api/billing/downgrade', {
        method: 'POST',
        json: { toTier },
      })
      await loadBillingSummary()
      toast.success(result.message || 'Downgrade scheduled successfully.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to schedule downgrade')
    } finally {
      setSchedulingDowngrade(false)
    }
  }

  const handleCancelScheduledDowngrade = async () => {
    try {
      setCancelingDowngrade(true)
      const result = await apiFetch<{ canceled: boolean; message?: string }>(
        '/api/billing/cancel-downgrade',
        {
          method: 'POST',
          json: {},
        }
      )
      await loadBillingSummary()
      toast.success(result.message || 'Scheduled downgrade canceled.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to cancel scheduled downgrade')
    } finally {
      setCancelingDowngrade(false)
    }
  }

  const renderPlanFooter = (plan: AppBillingPlan, isCurrentPlan: boolean) => {
    if (plan.tier === 'free') {
      if (isCurrentPlan) {
        return (
          <Button
            variant="outline"
            disabled
            className="w-full rounded-lg border-[#22C55E] bg-transparent text-[#22C55E] opacity-100 hover:bg-transparent"
          >
            Current Plan
          </Button>
        )
      }
      return (
        <Button
          variant="outline"
          className={cn(
            'w-full rounded-lg border-[#22C55E] bg-white text-[#22C55E]',
            'hover:bg-emerald-50 hover:text-emerald-700'
          )}
          onClick={() => void handleScheduleDowngrade('free')}
          disabled={schedulingDowngrade}
        >
          {schedulingDowngrade ? 'Scheduling...' : 'Start Free'}
        </Button>
      )
    }

    if (plan.tier === 'professional') {
      if (isCurrentPlan) {
        return (
          <Button
            disabled
            className="w-full rounded-lg bg-[#4F46E5] text-white opacity-100 hover:bg-[#4F46E5]"
          >
            Current Plan
          </Button>
        )
      }
      if (summary?.tier === 'enterprise') {
        return (
          <Button
            variant="outline"
            className="w-full rounded-lg border-[#4F46E5] bg-white text-[#4F46E5] hover:bg-violet-50"
            onClick={() => void handleScheduleDowngrade('professional')}
            disabled={schedulingDowngrade}
          >
            {schedulingDowngrade ? 'Scheduling...' : 'Downgrade'}
          </Button>
        )
      }
      return (
        <Button
          className="w-full rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA]"
          onClick={() => void handleUpgrade(plan.tier, plan.id)}
          disabled={loadingPlanId === plan.id}
        >
          {loadingPlanId === plan.id ? 'Redirecting...' : 'Upgrade to Builder'}
        </Button>
      )
    }

    if (plan.tier === 'enterprise') {
      if (isCurrentPlan) {
        return (
          <Button
            variant="outline"
            disabled
            className="w-full rounded-lg border-[#F97316] bg-transparent text-[#F97316] opacity-100 hover:bg-transparent"
          >
            Current Plan
          </Button>
        )
      }
      return (
        <Button
          variant="outline"
          className="w-full rounded-lg border-[#F97316] bg-white text-[#F97316] hover:bg-orange-50"
          onClick={() => void handleUpgrade(plan.tier, plan.id)}
          disabled={loadingPlanId === plan.id}
        >
          {loadingPlanId === plan.id ? 'Redirecting...' : 'Go Pro'}
        </Button>
      )
    }

    return null
  }

  const showSpinner = loadingSummary || fetchingSummaryCount > 0
  const scheduledDowngradeTargetLabel = summary?.tier === 'enterprise' ? 'Builder' : 'Starter'
  const bannerPlanName =
    currentPlan?.name ?? (summary?.tier === 'enterprise' ? 'Pro' : summary?.tier === 'professional' ? 'Builder' : 'Starter')

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
        <Card className="app-surface border border-[#e8eaef] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Current Plan</CardTitle>
                <CardDescription>
                  {loadingSummary
                    ? 'Loading plan details...'
                    : `You are currently on the ${currentPlan?.name ?? 'Starter'} plan`}
                </CardDescription>
              </div>
              <Badge className="gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-[#4F46E5] hover:bg-violet-50">
                <Star className="h-3.5 w-3.5 fill-current" />
                <span className="text-sm font-semibold">{currentPlan?.name ?? 'Starter'}</span>
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2 md:divide-x md:divide-slate-200">
              <div className="md:pr-6">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-violet-50 text-[#4F46E5]">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Documents</span>
                      <span className="text-muted-foreground">
                        {summary
                          ? `${summary.documents_used} / ${summary.documents_limit < 0 ? 'Unlimited' : summary.documents_limit}`
                          : '—'}
                      </span>
                    </div>
                    <Progress
                      value={
                        summary && summary.documents_limit > 0
                          ? (summary.documents_used / summary.documents_limit) * 100
                          : 0
                      }
                      className="h-2"
                    />
                    <p className="text-xs text-muted-foreground">
                      {summary
                        ? summary.documents_limit < 0
                          ? 'Unlimited documents available on this plan'
                          : `${Math.max(0, summary.documents_limit - summary.documents_used)} documents remaining this month`
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="md:pl-6">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-violet-50 text-[#4F46E5]">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">AI Generations</span>
                      <span className="text-muted-foreground">
                        {summary
                          ? `${summary.ai_generations_used} / ${summary.ai_generations_limit < 0 ? 'Unlimited' : summary.ai_generations_limit}`
                          : '—'}
                      </span>
                    </div>
                    <Progress
                      value={
                        summary && summary.ai_generations_limit > 0
                          ? (summary.ai_generations_used / summary.ai_generations_limit) * 100
                          : 0
                      }
                      className="h-2"
                    />
                    <p className="text-xs text-muted-foreground">
                      {summary
                        ? summary.ai_generations_limit < 0
                          ? 'Unlimited AI generations available on this plan'
                          : `${Math.max(0, summary.ai_generations_limit - summary.ai_generations_used)} AI generations remaining`
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-4 text-lg font-bold tracking-tight text-black">Available Plans</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {BILLING_PLANS.map((plan) => {
              const isCurrentPlan = plan.tier === summary?.tier
              const TierIcon = plan.tier === 'enterprise' ? null : TIER_ICONS[plan.tier]
              const isBuilder = plan.tier === 'professional'
              const showBuilderBadge = isBuilder
              const builderBadgeLabel =
                summary?.tier === 'professional' ? 'CURRENT PLAN' : 'MOST POPULAR'

              return (
                <Card
                  key={plan.id}
                  className={cn(
                    'relative flex flex-col overflow-visible rounded-2xl border bg-white pb-6 pt-10 shadow-[0_1px_2px_rgba(15,23,42,0.06)]',
                    isBuilder ? 'border-2 border-[#4F46E5]' : 'border border-[#e5e7eb]'
                  )}
                >
                  {showBuilderBadge ? (
                    <div className="pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2">
                      <span className="whitespace-nowrap rounded-full bg-[#4F46E5] px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
                        {builderBadgeLabel}
                      </span>
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      'border-b border-[#ebeef2] px-6 pb-6 text-left',
                      showBuilderBadge ? 'pt-1' : 'pt-2'
                    )}
                  >
                    {plan.tier === 'enterprise' ? (
                      <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-orange-50 text-[#F97316]">
                        <Shield className="h-8 w-8" aria-hidden />
                        <Star
                          className="absolute bottom-1 right-1 h-4 w-4 fill-orange-400 text-orange-500"
                          aria-hidden
                        />
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'grid h-14 w-14 shrink-0 place-items-center rounded-full',
                          plan.tier === 'free' && 'bg-emerald-50 text-[#22C55E]',
                          plan.tier === 'professional' && 'bg-violet-50 text-[#4F46E5]'
                        )}
                      >
                        {TierIcon ? <TierIcon className="h-8 w-8" aria-hidden /> : null}
                      </div>
                    )}

                    <h3 className="mt-4 text-lg font-bold text-black">{plan.name}</h3>
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                      <span className="text-3xl font-bold text-black">${plan.price}</span>
                      {plan.price === 0 ? (
                        <span className="text-sm font-medium text-blue-600">forever</span>
                      ) : (
                        <span className="text-sm font-medium text-blue-600">/month</span>
                      )}
                    </div>
                    <p className="mt-2 max-w-none text-sm leading-snug text-[#6B7280]">{plan.tagline}</p>
                  </div>

                  <CardContent className="flex flex-1 flex-col px-6 pt-6 pb-2">
                    <ul className="flex w-full flex-col gap-3">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-2.5 text-left">
                          <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#22C55E]" strokeWidth={2.5} />
                          <span className="text-sm leading-snug text-[#374151]">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>

                  <CardFooter className="mt-auto flex w-full flex-col items-stretch gap-2 border-0 px-6 pb-0 pt-4">
                    {renderPlanFooter(plan, isCurrentPlan)}
                    {isBuilder &&
                    summary?.tier !== 'professional' &&
                    plan.promoFootnote ? (
                      <p className="text-center text-xs font-medium leading-tight text-blue-600">
                        {plan.promoFootnote}
                      </p>
                    ) : null}
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        </div>

        {/* Payment Method + Billing History removed per request */}
      </div>
    </div>
  )
}
