'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ClipboardCheck, FileDown } from 'lucide-react'

export function DetectionResultsIntro(props: {
  hasRun: boolean
  isProcessing?: boolean
  statusDetail?: string | null
  issueCount: number
  onDownloadReport: () => void
  canDownloadReport: boolean
  isGeneratingReport: boolean
  onGoToSettings: () => void
}) {
  if (props.isProcessing) {
    const detail = props.statusDetail?.trim()
    return (
      <Card className="rounded-2xl border-orange-200 bg-orange-50/50">
        <CardContent className="flex items-center gap-3 px-6 py-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-100">
            <ClipboardCheck className="h-6 w-6 text-orange-500" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-[#0f172a]">Analysis in progress</h3>
            <p className="text-sm text-[#475569]">
              {detail ||
                'Detection is running. Results and the PDF download will be available when it finishes.'}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!props.hasRun) {
    return (
      <Card className="rounded-2xl border-dashed border-[#e2e8f0] bg-white">
        <CardContent className="flex flex-col items-center gap-4 px-6 py-10 text-center">
          <ClipboardCheck className="h-12 w-12 text-slate-300" strokeWidth={1.5} aria-hidden />
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-[#0f172a]">No results yet</h3>
            <p className="max-w-md text-sm text-[#64748b]">
              Upload plans and specifications, configure detection settings, then run detection.
              Results and the downloadable PDF report will appear here.
            </p>
          </div>
          <Button type="button" variant="outline" className="rounded-xl" onClick={props.onGoToSettings}>
            Go to detection settings
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-2xl border-emerald-200 bg-emerald-50/40">
      <CardContent className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
            <ClipboardCheck className="h-6 w-6 text-emerald-600" aria-hidden />
          </span>
          <div>
            <h3 className="text-base font-semibold text-[#0f172a]">Analysis complete</h3>
            <p className="text-sm text-[#475569]">
              {props.issueCount === 0
                ? 'No issues were flagged. You can still download the full PDF report.'
                : `${props.issueCount} issue${props.issueCount === 1 ? '' : 's'} ready to review below.`}
            </p>
          </div>
        </div>
        <Button
          type="button"
          className="shrink-0 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={!props.canDownloadReport || props.isGeneratingReport}
          onClick={props.onDownloadReport}
        >
          <FileDown className="mr-2 h-4 w-4" aria-hidden />
          {props.isGeneratingReport ? 'Preparing download…' : 'Download results (PDF)'}
        </Button>
      </CardContent>
    </Card>
  )
}
