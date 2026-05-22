'use client'

import { cn } from '@/lib/utils'
import { CircleCheck, CircleHelp, ShieldAlert } from 'lucide-react'

export type SummaryStatVariant = 'conflict' | 'missing' | 'verified'

const VARIANT_STYLES: Record<
  SummaryStatVariant,
  {
    iconBox: string
    icon: string
    number: string
    bar: string
  }
> = {
  conflict: {
    iconBox: 'bg-red-50',
    icon: 'text-red-600',
    number: 'text-red-600',
    bar: 'bg-red-500',
  },
  missing: {
    iconBox: 'bg-orange-50',
    icon: 'text-orange-500',
    number: 'text-orange-500',
    bar: 'bg-orange-500',
  },
  verified: {
    iconBox: 'bg-emerald-50',
    icon: 'text-emerald-600',
    number: 'text-emerald-600',
    bar: 'bg-emerald-500',
  },
}

function VariantIcon({ variant }: { variant: SummaryStatVariant }) {
  const className = cn('h-5 w-5', VARIANT_STYLES[variant].icon)
  const strokeWidth = 2.25

  if (variant === 'conflict') {
    return (
      <ShieldAlert
        className={className}
        strokeWidth={strokeWidth}
        aria-hidden
      />
    )
  }
  if (variant === 'missing') {
    return (
      <CircleHelp
        className={className}
        strokeWidth={strokeWidth}
        aria-hidden
      />
    )
  }
  return (
    <CircleCheck
      className={className}
      strokeWidth={strokeWidth}
      aria-hidden
    />
  )
}

export type SummaryStatCardProps = {
  variant: SummaryStatVariant
  count: number
  label: string
  /** 0–1 width of the colored segment on the bottom bar */
  barRatio?: number
}

export function SummaryStatCard({
  variant,
  count,
  label,
  barRatio = 0,
}: SummaryStatCardProps) {
  const styles = VARIANT_STYLES[variant]
  const fillPercent = Math.min(100, Math.max(0, barRatio * 100))

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-[#e2e8f0] bg-white p-3.5 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
            styles.iconBox,
          )}
        >
          <VariantIcon variant={variant} />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            className={cn(
              'text-[28px] font-bold leading-none tabular-nums tracking-tight',
              styles.number,
            )}
          >
            {count}
          </div>
          <div className="mt-1 truncate whitespace-nowrap text-[13px] font-medium leading-none text-[#475569]">
            {label}
          </div>
        </div>
      </div>
      <div
        className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-[#e2e8f0]"
        role="presentation"
        aria-hidden
      >
        {fillPercent > 0 ? (
          <div
            className={cn('h-full shrink-0 rounded-full', styles.bar)}
            style={{ width: `${fillPercent}%` }}
          />
        ) : null}
      </div>
    </div>
  )
}
