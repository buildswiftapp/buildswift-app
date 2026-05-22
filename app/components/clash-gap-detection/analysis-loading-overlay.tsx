'use client'

import type { ProcessingStep } from '@/lib/clash-gap-types'

type AnalysisLoadingOverlayProps = {
  open: boolean
  step: ProcessingStep | null
}

const STEP_EYEBROW: Record<ProcessingStep, string> = {
  extract: 'EXTRACTING',
  classify: 'CLASSIFYING',
  structure: 'STRUCTURING',
  analyze: 'ANALYZING',
  done: 'FINISHING',
}

function eyebrowLabel(step: ProcessingStep | null): string {
  if (!step) return 'PREPARING'
  return STEP_EYEBROW[step]
}

export function AnalysisLoadingOverlay({ open, step }: AnalysisLoadingOverlayProps) {
  if (!open) return null

  const label = eyebrowLabel(step)

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-[60] bg-white/65 backdrop-blur-sm"
    >
      <div className="absolute inset-0 grid place-items-center px-6">
        <div className="relative h-[320px] w-[320px] max-w-full">
          <Ring
            insetClass="inset-0"
            borderClass="border-violet-200/80"
            spinClass="motion-safe:animate-[orbitSpinCcw_18s_linear_infinite]"
          >
            <OrbitLine angleDeg={0} lineClass="bg-violet-500" length="w-6" />
            <OrbitLine angleDeg={140} lineClass="bg-violet-400/80" length="w-4" />
          </Ring>

          <Ring
            insetClass="inset-[7%]"
            borderClass="border-indigo-200"
            spinClass="motion-safe:animate-[orbitSpinCw_12s_linear_infinite]"
          >
            <OrbitLine angleDeg={0} lineClass="bg-indigo-500" length="w-5" />
            <OrbitLine angleDeg={200} lineClass="bg-indigo-400/80" length="w-3.5" />
          </Ring>

          <Ring
            insetClass="inset-[14%]"
            borderClass="border-violet-300/80"
            spinClass="motion-safe:animate-[orbitSpinCcw_8s_linear_infinite]"
          >
            <OrbitLine angleDeg={0} lineClass="bg-fuchsia-500" length="w-5" />
            <OrbitLine angleDeg={160} lineClass="bg-fuchsia-400/80" length="w-3" />
          </Ring>

          <Ring
            insetClass="inset-[21%]"
            borderClass="border-indigo-300/80"
            spinClass="motion-safe:animate-[orbitSpinCw_5.5s_linear_infinite]"
          >
            <OrbitLine angleDeg={0} lineClass="bg-violet-600" length="w-4" />
          </Ring>

          <div
            className="absolute inset-[30%] rounded-full bg-gradient-to-br from-violet-100/70 via-white to-indigo-100/70 shadow-[0_0_36px_rgba(139,92,246,0.2)] motion-safe:animate-pulse"
            aria-hidden
          />

          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="flex items-center text-[12px] font-bold uppercase tracking-[0.22em] text-violet-700">
              {label}
              <DotDotDot />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Ring(props: {
  insetClass: string
  borderClass: string
  spinClass: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={`absolute ${props.insetClass} rounded-full border ${props.borderClass} ${props.spinClass}`}
      aria-hidden
    >
      {props.children}
    </div>
  )
}

function OrbitLine({
  angleDeg,
  lineClass,
  length,
}: {
  angleDeg: number
  lineClass: string
  length: string
}) {
  return (
    <span
      className="pointer-events-none absolute inset-0"
      style={{ transform: `rotate(${angleDeg}deg)` }}
      aria-hidden
    >
      <span
        className={`absolute left-1/2 top-0 block h-px -translate-x-1/2 -translate-y-1/2 rounded-full ${length} ${lineClass} shadow-[0_0_10px_rgba(139,92,246,0.55)]`}
      />
    </span>
  )
}

function DotDotDot() {
  return (
    <span className="ml-1 inline-flex items-end gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1 w-1 rounded-full bg-violet-500 motion-safe:animate-pulse"
          style={{ animationDelay: `${i * 180}ms` }}
        />
      ))}
    </span>
  )
}
