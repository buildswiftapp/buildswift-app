'use client'

import type { DetectionWizardStep } from '@/lib/clash-gap-types'
import { DETECTION_WIZARD_STEPS } from '@/lib/clash-gap-types'
import { Button } from '@/components/ui/button'
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

function stepIndex(step: DetectionWizardStep): number {
  return DETECTION_WIZARD_STEPS.indexOf(step)
}

export function DetectionStepFooter(props: {
  activeStep: DetectionWizardStep
  onStepChange: (step: DetectionWizardStep) => void
  canGoNext: boolean
  nextHint?: string | null
  showNext?: boolean
  onDone?: () => void
  doneReady?: boolean
  isFinishing?: boolean
}) {
  const idx = stepIndex(props.activeStep)
  const prev = idx > 0 ? DETECTION_WIZARD_STEPS[idx - 1] : null
  const next = idx < DETECTION_WIZARD_STEPS.length - 1 ? DETECTION_WIZARD_STEPS[idx + 1] : null
  const isLast = next === null
  const showNext = props.showNext ?? true

  return (
    <div className="mt-8 flex flex-col gap-4 border-t border-[#e2e8f0] pt-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          disabled={!prev}
          onClick={() => prev && props.onStepChange(prev)}
        >
          <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
          Previous
        </Button>
        <span className="hidden text-xs text-[#64748b] sm:inline">
          Step {idx + 1} of {DETECTION_WIZARD_STEPS.length}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {!isLast ? (
          showNext ? (
            <Button
              type="button"
              className="rounded-xl bg-violet-600 text-white hover:bg-violet-700"
              disabled={!props.canGoNext || !next}
              title={!props.canGoNext && props.nextHint ? props.nextHint : undefined}
              onClick={() => next && props.onStepChange(next)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
            </Button>
          ) : null
        ) : (
          <Button
            type="button"
            className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={!props.doneReady || props.isFinishing}
            onClick={props.onDone}
          >
            {props.isFinishing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
            )}
            {props.isFinishing ? 'Saving & clearing…' : 'Done — download & finish'}
          </Button>
        )}
      </div>
    </div>
  )
}
