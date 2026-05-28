import Link from 'next/link'
import { Check, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PlanKey = 'starter' | 'professional' | 'business'

const PLANS: Array<{
  key: PlanKey
  name: string
  price: string
  badge?: string
}> = [
  { key: 'starter', name: 'Starter', price: '$29' },
  { key: 'professional', name: 'Professional', price: '$79', badge: 'Most Popular' },
  { key: 'business', name: 'Business', price: '$149' },
]

const ROWS: Array<{ feature: string; starter: string; professional: string; business: string }> = [
  { feature: 'Monthly Price', starter: '$29', professional: '$79', business: '$149' },
  { feature: 'AI Chatbot Assistant', starter: '✓', professional: '✓', business: '✓' },
  { feature: 'AI-Assisted RFIs', starter: '✓', professional: '✓', business: '✓' },
  { feature: 'AI-Assisted Submittals', starter: '✓', professional: '✓', business: '✓' },
  { feature: 'AI-Assisted Change Orders', starter: '✓', professional: '✓', business: '✓' },
  { feature: 'Clash/Gap Detection', starter: '✓', professional: '✓', business: '✓' },
  { feature: 'Saved Reports', starter: '✓', professional: '✓', business: '✓' },
  { feature: 'PDF Export', starter: '✓', professional: '✓', business: '✓' },
  { feature: 'Plan/Spec Uploads', starter: '✓', professional: '✓', business: '✓' },
  { feature: 'Save Company Templates', starter: '✓', professional: '✓', business: '✓' },
  { feature: 'Analytics Dashboard', starter: '✓', professional: '✓', business: '✓' },
  { feature: 'Custom PDF Branding', starter: '✓', professional: '✓', business: '✓' },
  { feature: 'Active Projects', starter: '5', professional: '25', business: 'Unlimited' },
  { feature: 'AI Generations/Month', starter: '50', professional: '300', business: 'High-volume' },
  { feature: 'Clash/Gap Reports/Month', starter: '5', professional: '30', business: '100' },
  { feature: 'Storage', starter: '2 GB', professional: '20 GB', business: '100 GB' },
]

function Cell({ value }: { value: string }) {
  const isCheck = value === '✓'
  return (
    <div className="flex items-center justify-center px-4 py-3 text-sm text-slate-700">
      {isCheck ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : value}
    </div>
  )
}

export default function PricingPage() {
  return (
    <div className="min-h-full bg-white">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-6 py-14">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900">
                Pricing that scales with your workload
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
                All plans include the same AI intelligence and core platform features. Upgrade only
                when your workload grows.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm font-semibold text-slate-900">Start with a Free Trial</p>
              <p className="mt-1 text-sm text-slate-600">No credit card required.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild className="rounded-xl bg-violet-600 text-white hover:bg-violet-700">
                  <Link href="/register">Start Free 14-Day Trial</Link>
                </Button>
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/billing">View billing in dashboard</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-4 bg-white">
            <div className="border-b border-slate-200 px-4 py-5 text-sm font-semibold text-slate-900">
              Features
            </div>
            {PLANS.map((p) => (
              <div
                key={p.key}
                className={cn(
                  'relative border-b border-slate-200 px-4 py-5 text-center',
                  p.key === 'professional' && 'bg-violet-50/60',
                )}
              >
                {p.badge ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                      <Star className="h-3 w-3 fill-current" aria-hidden />
                      {p.badge}
                    </span>
                  </div>
                ) : null}
                <div className="text-sm font-bold text-slate-900">{p.name}</div>
                <div className="mt-1 text-sm text-slate-600">
                  <span className="text-base font-semibold text-slate-900">{p.price}</span> / month
                </div>
              </div>
            ))}
          </div>

          {ROWS.map((row) => (
            <div key={row.feature} className="grid grid-cols-4 border-t border-slate-200 bg-white">
              <div className="px-4 py-3 text-sm font-medium text-slate-900">{row.feature}</div>
              <Cell value={row.starter} />
              <div className="bg-violet-50/60">
                <Cell value={row.professional} />
              </div>
              <Cell value={row.business} />
            </div>
          ))}
        </div>

        <p className="mt-6 text-sm italic text-slate-600">
          “All plans include the same AI intelligence and core platform features. Upgrade only
          when your workload grows.”
        </p>
      </div>
    </div>
  )
}

