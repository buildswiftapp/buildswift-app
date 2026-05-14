'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DetectionPhase = 'prepare' | 'results'

export function DetectionStepper(props: {
  phase: DetectionPhase
  uploadComplete: boolean
  uploadLabel: string
  settingsLabel: string
  resultsLabel: string
}) {
  const { phase, uploadComplete } = props

  const step1Visual: 'complete' | 'active' | 'upcoming' =
    phase === 'results' ? 'complete' : uploadComplete ? 'complete' : 'active'

  const step2Visual: 'complete' | 'active' | 'upcoming' =
    phase === 'results' ? 'complete' : uploadComplete ? 'active' : 'upcoming'

  const step3Visual: 'complete' | 'active' | 'upcoming' =
    phase === 'results' ? 'active' : 'upcoming'

  /** Reference image 2: outline + digit except active Results = filled blue + white digit */
  const circle = (stepNum: 1 | 2 | 3, state: 'complete' | 'active' | 'upcoming') => {
    const filled = state === 'active' && stepNum === 3
    const outlineActive = state === 'active' || state === 'complete'
    return (
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors',
          filled && 'border-violet-600 bg-violet-600 text-white shadow-sm',
          !filled &&
            outlineActive &&
            'border-violet-600 bg-white text-violet-600 dark:border-violet-600 dark:bg-card',
          state === 'upcoming' &&
            'border-[#d1d5db] bg-white text-[#9ca3af] dark:border-border dark:bg-card',
        )}
      >
        {stepNum}
      </div>
    )
  }

  const titleRow = (title: string, showCompleteCheck: boolean) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-[#0f172a]">{title}</span>
      {showCompleteCheck ? (
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm"
          aria-label="Complete"
        >
          <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
        </span>
      ) : null}
    </div>
  )

  return (
    <div className="w-full rounded-2xl border border-[#e2e8f0] bg-white px-4 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-6 sm:py-6">
      {/* Mobile: stacked with horizontal rules */}
      <div className="flex flex-col divide-y divide-[#e5e7eb] md:hidden">
        <div className="flex gap-3 pb-5">
          {circle(1, step1Visual)}
          <div className="min-w-0">
            {titleRow('Upload Documents', step1Visual === 'complete')}
            <div className="text-muted-foreground mt-1 text-xs">{props.uploadLabel}</div>
          </div>
        </div>
        <div className="flex gap-3 py-5">
          {circle(2, step2Visual)}
          <div className="min-w-0">
            {titleRow('Detection Settings', false)}
            <div className="text-muted-foreground mt-1 text-xs">{props.settingsLabel}</div>
          </div>
        </div>
        <div
          className={cn(
            'w-full pt-5',
            step3Visual === 'active' ? 'border-b-[3px] border-violet-600 pb-4' : 'pb-5',
          )}
        >
          <div className="flex gap-3">
            {circle(3, step3Visual)}
            <div className="min-w-0">
              {titleRow('Results', false)}
              <div className="text-muted-foreground mt-1 text-xs">{props.resultsLabel}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: three columns with vertical dividers (reference image 2) */}
      <div className="hidden min-w-0 md:grid md:grid-cols-3 md:divide-x md:divide-[#e5e7eb]">
        <div
          className={cn(
            'flex min-w-0 flex-col border-b-[3px] border-transparent px-4 pb-4 pt-0 sm:px-5',
          )}
        >
          <div className="flex gap-3">
            {circle(1, step1Visual)}
            <div className="min-w-0 pr-2">
              {titleRow('Upload Documents', step1Visual === 'complete')}
              <div className="text-muted-foreground mt-1 text-xs leading-snug">
                {props.uploadLabel}
              </div>
            </div>
          </div>
        </div>

        <div
          className={cn(
            'flex min-w-0 flex-col border-b-[3px] border-transparent px-4 pb-4 pt-0 sm:px-5',
          )}
        >
          <div className="flex gap-3">
            {circle(2, step2Visual)}
            <div className="min-w-0 pr-2">
              {titleRow('Detection Settings', false)}
              <div className="text-muted-foreground mt-1 text-xs leading-snug">
                {props.settingsLabel}
              </div>
            </div>
          </div>
        </div>

        <div
          className={cn(
            'flex min-w-0 flex-col px-4 pb-4 pt-0 sm:px-5',
            step3Visual === 'active'
              ? 'border-b-[3px] border-violet-600'
              : 'border-b-[3px] border-transparent',
          )}
        >
          <div className="flex gap-3">
            {circle(3, step3Visual)}
            <div className="min-w-0 pr-2">
              {titleRow('Results', false)}
              <div className="text-muted-foreground mt-1 text-xs leading-snug">
                {props.resultsLabel}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
