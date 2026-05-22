'use client'

import type { ReactNode } from 'react'
import { FileDown, Play, Save, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DetectionToolShell(props: {
  children?: ReactNode
  stepper: ReactNode
  onSaveSession: () => void
  onRunDetection: () => void
  canRunDetection: boolean
  isRunning: boolean
  showRunDetection: boolean
  showGenerateReport?: boolean
  onGenerateReport?: () => void
  isGeneratingReport?: boolean
}) {
  const {
    onSaveSession,
    onRunDetection,
    canRunDetection,
    isRunning,
    showRunDetection,
    showGenerateReport,
    onGenerateReport,
    isGeneratingReport,
    stepper,
    children,
  } = props

  return (
    <div className="min-h-full w-full bg-[#f9fafb] pb-10">
      <div className="border-b border-[#e2e8f0] bg-white px-4 py-5 shadow-sm sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[min(100%,1720px)] flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 max-w-3xl items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100">
                <Sparkles
                  className="h-5 w-5 text-violet-600"
                  strokeWidth={2.25}
                  aria-hidden
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-[#0f172a] md:text-[26px]">
                    Detection Tool
                  </h1>
                  <span className="rounded-md bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">
                    BETA
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-[#475569]">
                  Find gaps and conflicts in your plans and specs. Auto-generate RFIs from detected
                  issues. Findings are based on document text, not 3D geometry.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
              <Button type="button" variant="outline" className="rounded-xl" onClick={onSaveSession}>
                <Save className="mr-2 h-4 w-4" aria-hidden />
                Save Session
              </Button>
              {showGenerateReport ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  disabled={isGeneratingReport}
                  onClick={onGenerateReport}
                >
                  <FileDown className="mr-2 h-4 w-4" aria-hidden />
                  {isGeneratingReport ? 'Generating…' : 'Generate Report'}
                </Button>
              ) : null}
              {showRunDetection ? (
                <Button
                  type="button"
                  className="rounded-xl bg-violet-600 text-white hover:bg-violet-700"
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