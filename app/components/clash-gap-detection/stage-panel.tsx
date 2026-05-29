'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AlertTriangle, Check, Download, Eye, Loader2, Lock, Play, RotateCcw } from 'lucide-react'
import type { StageStatus } from '@/lib/clash-gap-stages'

export type StageDownload = {
  label: string
  onClick: () => void
  disabled?: boolean
  busy?: boolean
}

export type StagePreview = {
  label: string
  onClick: () => void
}

function StatusBanner(props: { status: StageStatus; detail?: string | null; error?: string | null; gateMet: boolean; gateHint?: string }) {
  if (!props.gateMet) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <Lock className="h-4 w-4 shrink-0" aria-hidden />
        <span>{props.gateHint || 'Complete the previous stage to unlock this one.'}</span>
      </div>
    )
  }
  if (props.status === 'running') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        <span>{props.detail?.trim() || 'Working…'}</span>
      </div>
    )
  }
  if (props.status === 'failed') {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{props.error?.trim() || 'This stage failed. You can run it again.'}</span>
      </div>
    )
  }
  if (props.status === 'completed') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        <span>{props.detail?.trim() || 'Stage complete — review the result and download below.'}</span>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
      Ready to run.
    </div>
  )
}

export function StagePanel(props: {
  title: string
  description: string
  status: StageStatus
  detail?: string | null
  error?: string | null
  gateMet: boolean
  gateHint?: string
  isRunning: boolean
  onRun: () => void
  runLabel: string
  downloads?: StageDownload[]
  preview?: StagePreview
  children?: ReactNode
}) {
  const completed = props.status === 'completed'
  const canRun = props.gateMet && !props.isRunning
  return (
    <Card className="rounded-2xl border-[#e2e8f0] shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{props.title}</CardTitle>
        <p className="text-sm text-[#64748b]">{props.description}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <StatusBanner status={props.status} detail={props.detail} error={props.error} gateMet={props.gateMet} gateHint={props.gateHint} />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className={cn('rounded-xl text-white', completed ? 'bg-slate-700 hover:bg-slate-800' : 'bg-violet-600 hover:bg-violet-700')}
            disabled={!canRun}
            onClick={props.onRun}
          >
            {props.isRunning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : completed ? (
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
            ) : (
              <Play className="mr-2 h-4 w-4 fill-current" aria-hidden />
            )}
            {props.isRunning ? 'Running…' : completed ? `Re-run ${props.runLabel}` : `Run ${props.runLabel}`}
          </Button>

          {props.preview ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-violet-200 text-violet-700 hover:bg-violet-50"
              disabled={!completed}
              onClick={props.preview.onClick}
            >
              <Eye className="mr-2 h-4 w-4" aria-hidden />
              {props.preview.label}
            </Button>
          ) : null}

          {(props.downloads ?? []).map((d) => (
            <Button
              key={d.label}
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={d.disabled || !completed}
              onClick={d.onClick}
            >
              {d.busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="mr-2 h-4 w-4" aria-hidden />
              )}
              {d.label}
            </Button>
          ))}
        </div>

        {completed && props.children ? <div className="pt-1">{props.children}</div> : null}
      </CardContent>
    </Card>
  )
}
