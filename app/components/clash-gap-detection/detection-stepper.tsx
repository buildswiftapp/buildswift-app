'use client'

import type { ReactNode } from 'react'
import { ClipboardCheck, FolderUp, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DetectionPhase = 'prepare' | 'results'

type ThemeKey = 'violet' | 'orange' | 'emerald' | 'slate'

type Theme = {
  ring: string
  bg: string
  icon: string
  badge: string
  pillBg: string
  pillText: string
  pillDot: string
}

const THEMES: Record<ThemeKey, Theme> = {
  violet: {
    ring: 'border-violet-300',
    bg: 'bg-violet-100',
    icon: 'text-violet-600',
    badge: 'bg-violet-600',
    pillBg: 'bg-violet-100',
    pillText: 'text-violet-700',
    pillDot: 'bg-violet-600',
  },
  orange: {
    ring: 'border-orange-300',
    bg: 'bg-orange-100',
    icon: 'text-orange-500',
    badge: 'bg-orange-500',
    pillBg: 'bg-orange-100',
    pillText: 'text-orange-700',
    pillDot: 'bg-orange-500',
  },
  emerald: {
    ring: 'border-emerald-300',
    bg: 'bg-emerald-100',
    icon: 'text-emerald-600',
    badge: 'bg-emerald-600',
    pillBg: 'bg-emerald-100',
    pillText: 'text-emerald-700',
    pillDot: 'bg-emerald-600',
  },
  slate: {
    ring: 'border-slate-300',
    bg: 'bg-slate-100',
    icon: 'text-slate-500',
    badge: 'bg-slate-500',
    pillBg: 'bg-slate-100',
    pillText: 'text-slate-600',
    pillDot: 'bg-slate-500',
  },
}

function Step(props: {
  num: 1 | 2 | 3
  theme: Exclude<ThemeKey, 'slate'>
  icon: ReactNode
  title: string
  description: string
  status: string
  statusTheme?: ThemeKey
}) {
  const t = THEMES[props.theme]
  const pill = THEMES[props.statusTheme ?? props.theme]
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center text-center">
      <div className="relative">
        <div
          className={cn(
            'flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed',
            t.ring,
          )}
        >
          <div
            className={cn(
              'flex h-[78px] w-[78px] items-center justify-center rounded-full',
              t.bg,
            )}
          >
            {props.icon}
          </div>
        </div>
        <span
          className={cn(
            'absolute -right-0.5 -top-0.5 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ring-2 ring-white',
            t.badge,
          )}
          aria-hidden
        >
          {props.num}
        </span>
      </div>
      <h4 className="mt-4 text-base font-bold text-[#0f172a]">{props.title}</h4>
      <p className="mt-1.5 max-w-[20rem] text-sm leading-relaxed text-[#64748b]">
        {props.description}
      </p>
      <span
        className={cn(
          'mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
          pill.pillBg,
          pill.pillText,
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', pill.pillDot)} aria-hidden />
        {props.status}
      </span>
    </div>
  )
}

function Connector() {
  return (
    <div className="mt-12 hidden shrink-0 items-center gap-1 self-start md:flex">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
      <span className="h-px w-10 bg-slate-300 lg:w-16" />
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
    </div>
  )
}

export function DetectionStepper(props: {
  phase: DetectionPhase
  uploadComplete: boolean
  uploadLabel: string
  settingsLabel: string
  resultsLabel: string
}) {
  const isProcessing = /^processing/i.test(props.resultsLabel)
  const resultsTheme: ThemeKey =
    props.phase === 'results' ? 'emerald' : isProcessing ? 'orange' : 'slate'

  return (
    <div className="w-full rounded-2xl border border-[#e2e8f0] bg-white px-4 py-6 sm:px-8 sm:py-7">
      <div className="flex flex-col items-stretch gap-8 md:flex-row md:items-start md:gap-3">
        <Step
          num={1}
          theme="violet"
          icon={<FolderUp className="h-10 w-10 text-violet-600" strokeWidth={2} aria-hidden />}
          title="Upload Documents"
          description="Add drawings, specifications, and supporting project files."
          status={props.uploadLabel}
        />
        <Connector />
        <Step
          num={2}
          theme="orange"
          icon={
            <SlidersHorizontal
              className="h-10 w-10 text-orange-500"
              strokeWidth={2}
              aria-hidden
            />
          }
          title="Detection Settings"
          description="Configure how aggressively the AI searches for gaps and conflicts."
          status={props.settingsLabel}
        />
        <Connector />
        <Step
          num={3}
          theme="emerald"
          icon={
            <ClipboardCheck
              className="h-10 w-10 text-emerald-600"
              strokeWidth={2}
              aria-hidden
            />
          }
          title="Results"
          description="Review generated RFIs, conflicts, and recommendations."
          status={props.resultsLabel}
          statusTheme={resultsTheme}
        />
      </div>
    </div>
  )
}
