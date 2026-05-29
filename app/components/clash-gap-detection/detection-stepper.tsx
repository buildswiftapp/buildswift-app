'use client'

import type { ReactNode } from 'react'
import { Check, FolderUp, Layers, ScanText, FileCheck2, ClipboardCheck, Lock, Loader2, AlertTriangle } from 'lucide-react'
import type { DetectionWizardStep } from '@/lib/clash-gap-types'
import { cn } from '@/lib/utils'

export type StepDisplayStatus = 'locked' | 'ready' | 'running' | 'completed' | 'failed'

export type StepperItem = {
  id: DetectionWizardStep
  title: string
  description: string
  status: StepDisplayStatus
}

const STEP_ICONS: Record<DetectionWizardStep, ReactNode> = {
  upload: <FolderUp className="h-7 w-7" strokeWidth={2} aria-hidden />,
  chunk: <Layers className="h-7 w-7" strokeWidth={2} aria-hidden />,
  ocr: <ScanText className="h-7 w-7" strokeWidth={2} aria-hidden />,
  detection: <ClipboardCheck className="h-7 w-7" strokeWidth={2} aria-hidden />,
  result: <FileCheck2 className="h-7 w-7" strokeWidth={2} aria-hidden />,
}

const STATUS_LABEL: Record<StepDisplayStatus, string> = {
  locked: 'Locked',
  ready: 'Ready',
  running: 'Running…',
  completed: 'Done',
  failed: 'Failed',
}

function statusClasses(status: StepDisplayStatus, isActive: boolean) {
  if (status === 'completed')
    return { ring: 'border-emerald-300', bg: 'bg-emerald-100', icon: 'text-emerald-600', pill: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' }
  if (status === 'running')
    return { ring: 'border-orange-300', bg: 'bg-orange-100', icon: 'text-orange-500', pill: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' }
  if (status === 'failed')
    return { ring: 'border-red-300', bg: 'bg-red-100', icon: 'text-red-600', pill: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
  if (status === 'ready' || isActive)
    return { ring: 'border-violet-300', bg: 'bg-violet-100', icon: 'text-violet-600', pill: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' }
  return { ring: 'border-slate-200', bg: 'bg-slate-100', icon: 'text-slate-400', pill: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' }
}

function StepNode(props: {
  item: StepperItem
  num: number
  isActive: boolean
  clickable: boolean
  onSelect: (id: DetectionWizardStep) => void
}) {
  const { item, isActive } = props
  const c = statusClasses(item.status, isActive)
  return (
    <button
      type="button"
      disabled={!props.clickable}
      onClick={() => props.clickable && props.onSelect(item.id)}
      className={cn(
        'flex h-full min-w-[140px] flex-1 flex-col items-center rounded-xl px-2 py-2 text-center transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2',
        props.clickable ? 'cursor-pointer hover:bg-slate-50/80' : 'cursor-not-allowed opacity-80',
        isActive && 'bg-violet-50/80',
      )}
      aria-current={isActive ? 'step' : undefined}
    >
      <div className="relative">
        <div className={cn('flex h-[68px] w-[68px] items-center justify-center rounded-full border-2', isActive ? 'border-solid border-violet-400' : c.ring)}>
          <div className={cn('flex h-[54px] w-[54px] items-center justify-center rounded-full', c.bg, c.icon)}>
            {STEP_ICONS[item.id]}
          </div>
        </div>
        <span
          className={cn(
            'absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm ring-2 ring-white',
            item.status === 'completed' ? 'bg-emerald-600' : item.status === 'running' ? 'bg-orange-500' : item.status === 'failed' ? 'bg-red-500' : item.status === 'locked' ? 'bg-slate-400' : 'bg-violet-600',
          )}
          aria-hidden
        >
          {item.status === 'completed' ? <Check className="h-3.5 w-3.5" /> : item.status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : item.status === 'failed' ? <AlertTriangle className="h-3.5 w-3.5" /> : item.status === 'locked' ? <Lock className="h-3 w-3" /> : props.num}
        </span>
      </div>
      <h4 className="mt-3 text-sm font-bold text-[#0f172a]">{item.title}</h4>
      <p className="mt-1 mb-3 max-w-[16rem] text-xs leading-relaxed text-[#64748b]">{item.description}</p>
      <span className={cn('mt-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium', c.pill)}>
        <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} aria-hidden />
        {STATUS_LABEL[item.status]}
      </span>
    </button>
  )
}

export function DetectionStepper(props: {
  steps: StepperItem[]
  activeStep: DetectionWizardStep
  onStepChange: (step: DetectionWizardStep) => void
  canNavigateTo: (step: DetectionWizardStep) => boolean
}) {
  return (
    <div className="w-full rounded-2xl border border-[#e2e8f0] bg-white px-3 py-5 sm:px-6">
      <p className="mb-3 text-center text-xs text-[#64748b] md:text-left">
        Run each stage in order. Every finished stage can be reviewed and downloaded before you continue.
      </p>
      <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-stretch md:gap-1">
        {props.steps.map((item, i) => (
          <div key={item.id} className="flex flex-1 items-start md:contents">
            <StepNode
              item={item}
              num={i + 1}
              isActive={props.activeStep === item.id}
              clickable={props.canNavigateTo(item.id)}
              onSelect={props.onStepChange}
            />
            {i < props.steps.length - 1 ? (
              <div className="mt-9 hidden shrink-0 items-center self-start md:flex" aria-hidden>
                <span className={cn('h-px w-6 lg:w-10', item.status === 'completed' ? 'bg-emerald-300' : 'bg-slate-200')} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
