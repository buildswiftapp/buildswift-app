'use client'

import type { ReactNode } from 'react'
import { Play, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DetectionToolShell(props: {
  children?: ReactNode
  stepper: ReactNode
  onSaveSession: () => void
  onRunDetection: () => void
  canRunDetection: boolean
  isRunning: boolean
  showRunDetection: boolean
}) {
  const {
    onSaveSession,
    onRunDetection,
    canRunDetection,
    isRunning,
    showRunDetection,
    stepper,
    children,
  } = props

  return (
    <div className="min-h-full w-full bg-[#f9fafb] pb-10">
      <div className="border-b border-[#e2e8f0] bg-white px-4 py-5 shadow-sm sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[min(100%,1720px)] flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 max-w-3xl space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-[#0f172a] md:text-[26px]">
                  Detection Tool
                </h1>
                <span className="rounded-md bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800 dark:bg-violet-950/70 dark:text-violet-200">
                  BETA
                </span>
              </div>
              <p className="text-sm leading-relaxed text-[#475569]">
                Find gaps and conflicts in your plans and specs. Auto-generate RFIs from detected issues.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-[#cbd5e1] bg-white text-[#0f172a] hover:bg-[#f8fafc]"
                onClick={onSaveSession}
              >
                <Save className="mr-2 h-4 w-4 text-[#64748b]" strokeWidth={1.8} aria-hidden />
                Save Session
              </Button>
              {showRunDetection ? (
                <Button
                  type="button"
                  className="rounded-xl border-0 bg-violet-600 px-5 text-white shadow-sm hover:bg-violet-700"
                  disabled={!canRunDetection || isRunning}
                  onClick={onRunDetection}
                >
                  <Play className="mr-2 h-4 w-4 fill-current" aria-hidden />
                  {isRunning ? 'Running…' : 'Run Detection'}
                </Button>
              ) : null}
            </div>
          </div>
          {stepper}
        </div>
      </div>
      <div className="mx-auto w-full max-w-[min(100%,1720px)] px-4 pt-6 sm:px-6 lg:px-8">{children}</div>
    </div>
  )
}
