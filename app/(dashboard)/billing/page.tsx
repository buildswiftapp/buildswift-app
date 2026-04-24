'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, CreditCard, Download } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { subscriptionPlans } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const invoices = [
  { id: 'INV-001', date: '2024-03-01', amount: 49, status: 'paid' },
  { id: 'INV-002', date: '2024-02-01', amount: 49, status: 'paid' },
  { id: 'INV-003', date: '2024-01-01', amount: 49, status: 'paid' },
]

export default function BillingPage() {
  const { company } = useApp()
  const searchParams = useSearchParams()
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null)
  const [openingPortal, setOpeningPortal] = useState(false)
  const [checkoutNotice, setCheckoutNotice] = useState<{
    tone: 'success' | 'error' | 'info'
    message: string
  } | null>(null)

  const currentPlan = subscriptionPlans.find((p) => p.tier === company?.subscriptionTier)

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

  const handleUpgrade = async (tier: string, planId: string) => {
    if (tier === 'free') {
      await openPortal()
      return
    }
    try {
      setLoadingPlanId(planId)
      const { url } = await apiFetch<{ url: string }>('/api/billing/checkout', {
        method: 'POST',
        json: { tier },
      })
      window.location.href = url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to start Stripe checkout')
    } finally {
      setLoadingPlanId(null)
    }
  }

  const handleDownloadInvoice = (invoiceId: string) => {
    toast.success(`Downloading invoice ${invoiceId}...`)
  }

  return (
    <div className="flex flex-col">
      <div className="flex-1 space-y-6 p-6">
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
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Current Plan</CardTitle>
                <CardDescription>
                  You are currently on the {currentPlan?.name} plan
                </CardDescription>
              </div>
              <Badge className="bg-primary/10 text-primary text-lg px-4 py-1">
                {currentPlan?.name}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Documents</span>
                  <span className="text-muted-foreground">
                    {company?.documentsUsed} / {company?.documentsLimit}
                  </span>
                </div>
                <Progress
                  value={
                    company
                      ? (company.documentsUsed / company.documentsLimit) * 100
                      : 0
                  }
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground">
                  {company
                    ? company.documentsLimit - company.documentsUsed
                    : 0}{' '}
                  documents remaining this billing cycle
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">AI Generations</span>
                  <span className="text-muted-foreground">
                    {company?.aiGenerationsUsed} / {company?.aiGenerationsLimit}
                  </span>
                </div>
                <Progress
                  value={
                    company
                      ? (company.aiGenerationsUsed / company.aiGenerationsLimit) * 100
                      : 0
                  }
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground">
                  {company
                    ? company.aiGenerationsLimit - company.aiGenerationsUsed
                    : 0}{' '}
                  AI generations remaining
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-4 text-lg font-semibold">Available Plans</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {subscriptionPlans.map((plan) => {
              const isCurrentPlan = plan.tier === company?.subscriptionTier
              const isPopular = plan.tier === 'professional'

              return (
                <Card
                  key={plan.id}
                  className={cn(
                    'relative',
                    isPopular && 'border-primary shadow-md',
                    isCurrentPlan && 'bg-muted/50'
                  )}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground">
                        Most Popular
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
                    ) : (
                      <Button
                        className="w-full"
                        variant={isPopular ? 'default' : 'outline'}
                        onClick={() => void handleUpgrade(plan.tier, plan.id)}
                        disabled={loadingPlanId === plan.id}
                      >
                        {loadingPlanId === plan.id
                          ? 'Redirecting...'
                          : plan.price === 0
                            ? 'Downgrade in Stripe'
                            : 'Upgrade'}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Payment Method</CardTitle>
            <CardDescription>Manage your payment information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 rounded-lg border p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <CreditCard className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="font-medium">Visa ending in 4242</p>
                <p className="text-sm text-muted-foreground">Expires 12/2025</p>
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

        <Card>
          <CardHeader>
            <CardTitle>Billing History</CardTitle>
            <CardDescription>View and download past invoices</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.id}</TableCell>
                    <TableCell>
                      {new Date(invoice.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell>${invoice.amount}</TableCell>
                    <TableCell>
                      <Badge className="bg-emerald-100 text-emerald-800 capitalize">
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadInvoice(invoice.id)}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
