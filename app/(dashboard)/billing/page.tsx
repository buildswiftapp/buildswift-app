'use client'

import { useState } from 'react'
import { Check, CreditCard, Download, Zap } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
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
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)

  const currentPlan = subscriptionPlans.find((p) => p.tier === company?.subscriptionTier)

  const handleUpgrade = (planId: string) => {
    toast.success('Redirecting to checkout...')
  }

  const handleDownloadInvoice = (invoiceId: string) => {
    toast.success(`Downloading invoice ${invoiceId}...`)
  }

  return (
    <div className="flex flex-col">
      <div className="flex-1 space-y-6 p-6">
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
                        onClick={() => handleUpgrade(plan.id)}
                      >
                        {plan.price === 0 ? 'Downgrade' : 'Upgrade'}
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
              <Button variant="outline" size="sm">
                Update
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
