'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, CreditCard, Download } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { BILLING_PLANS, type AppBillingTier } from '@/lib/billing-plans'
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

export default function BillingPage() {
  const searchParams = useSearchParams()
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null)
  const [schedulingDowngrade, setSchedulingDowngrade] = useState(false)
  const [cancelingDowngrade, setCancelingDowngrade] = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)
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

  const loadBillingSummary = async () => {
    const data = await apiFetch<BillingSummary>('/api/billing/summary')
    setSummary(data)
    return data
  }

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const data = await apiFetch<BillingSummary>('/api/billing/summary')
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

  const openPortal = async () => {
    try {
      setOpeningPortal(true)
      const { url } = await apiFetch<{ url: string }>('/api/billing/portal', {
        method: 'POST',
        json: {},
      })
      window.location.href = url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to open Stripe portal')
    } finally {
      setOpeningPortal(false)
    }
  }

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

  const handleScheduleDowngrade = async () => {
    try {
      setSchedulingDowngrade(true)
      const result = await apiFetch<{ scheduled: boolean; message?: string }>('/api/billing/downgrade', {
        method: 'POST',
        json: {},
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

  return (
    <div className="app-page space-y-6">
      <div>
        <h1 className="app-section-title">Billing</h1>
        <p className="app-section-subtitle">Manage subscription, payment details, and invoices.</p>
      </div>
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
              {`Plan: ${currentPlan?.name ?? 'Pro'} (cancels on ${cancelAtLabel}). You keep full Pro access until this date, then your account reverts to Free automatically.`}
            </p>
            <div className="mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCancelScheduledDowngrade()}
                disabled={cancelingDowngrade}
              >
                {cancelingDowngrade ? 'Keeping Pro...' : 'Keep Pro Plan'}
              </Button>
            </div>
          </div>
        ) : null}
        <Card className="app-surface">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Current Plan</CardTitle>
                <CardDescription>
                  {loadingSummary ? 'Loading plan details...' : `You are currently on the ${currentPlan?.name ?? 'Free'} plan`}
                </CardDescription>
              </div>
              <Badge className="bg-primary/10 text-primary text-base px-4 py-1.5">
                {currentPlan?.name ?? 'Free'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Documents</span>
                  <span className="text-muted-foreground">
                    {summary ? `${summary.documents_used} / ${summary.documents_limit < 0 ? 'Unlimited' : summary.documents_limit}` : '—'}
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
              <div className="space-y-2">
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
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-4 text-lg font-semibold text-foreground">Available Plans</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {BILLING_PLANS.map((plan) => {
              const isCurrentPlan = plan.tier === summary?.tier

              return (
                <Card
                  key={plan.id}
                  className={cn(
                    'app-surface relative',
                    isCurrentPlan && 'border-primary shadow-md bg-primary/5'
                  )}
                >
                  {isCurrentPlan && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground">
                        Current Plan
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pt-8">
                    <CardTitle>{plan.name}</CardTitle>
                    <CardDescription>
                      <span className="text-3xl font-bold text-foreground">
                        ${plan.price}
                      </span>
                      {plan.price > 0 && (
                        <span className="text-muted-foreground">/month</span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <Check className="h-5 w-5 shrink-0 text-primary" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    {isCurrentPlan ? (
                      <Button variant="outline" className="w-full" disabled>
                        Current Plan
                      </Button>
                    ) : plan.tier === 'free' ? (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => void handleScheduleDowngrade()}
                        disabled={schedulingDowngrade}
                      >
                        {schedulingDowngrade ? 'Scheduling...' : 'Downgrade'}
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => void handleUpgrade(plan.tier, plan.id)}
                        disabled={loadingPlanId === plan.id}
                      >
                        {loadingPlanId === plan.id
                          ? 'Redirecting...'
                          : 'Upgrade'}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        </div>

        <Card className="app-surface">
          <CardHeader>
            <CardTitle>Payment Method</CardTitle>
            <CardDescription>Manage your payment information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 rounded-xl border border-border p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <CreditCard className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="font-medium">Manage payment method in Stripe</p>
                <p className="text-sm text-muted-foreground">Open the billing portal to update cards and invoices</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void openPortal()}
                disabled={openingPortal}
              >
                {openingPortal ? 'Opening...' : 'Update'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="app-surface">
          <CardHeader>
            <CardTitle>Billing History</CardTitle>
            <CardDescription>View invoices directly in Stripe Billing Portal</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-xl border border-border p-4">
              <p className="text-sm text-muted-foreground">
                Invoices and receipts are available in Stripe portal.
              </p>
              <Button variant="outline" size="sm" onClick={() => void openPortal()} disabled={openingPortal}>
                <Download className="mr-2 h-4 w-4" />
                {openingPortal ? 'Opening...' : 'Open Invoices'}
              </Button>
            </div>
          </CardContent>
        </Card>
    </div>
  )
}
