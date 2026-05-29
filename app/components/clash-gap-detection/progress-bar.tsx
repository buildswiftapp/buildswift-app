import { cn } from '@/lib/utils'

type Tone = 'violet' | 'orange' | 'sky' | 'emerald'

const TONES: Record<Tone, { track: string; fill: string }> = {
  violet: { track: 'bg-violet-100', fill: 'bg-violet-500' },
  orange: { track: 'bg-orange-100', fill: 'bg-orange-500' },
  sky: { track: 'bg-sky-100', fill: 'bg-sky-500' },
  emerald: { track: 'bg-emerald-100', fill: 'bg-emerald-500' },
}

export function ProgressBar({
  value,
  tone = 'violet',
  className,
}: {
  value?: number | null
  tone?: Tone
  className?: string
}) {
  const { track, fill } = TONES[tone]
  const indeterminate = value === null || value === undefined
  const pct = indeterminate ? 100 : Math.min(100, Math.max(0, value))
  return (
    <div
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('relative h-2 w-full overflow-hidden rounded-full', track, className)}
    >
      {indeterminate ? (
        <div
          className={cn('absolute inset-y-0 left-0 w-1/3 rounded-full', fill)}
          style={{ animation: 'clashIndeterminate 1.1s ease-in-out infinite' }}
        />
      ) : (
        <div
          className={cn('h-full rounded-full transition-all duration-300', fill)}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  )
}
