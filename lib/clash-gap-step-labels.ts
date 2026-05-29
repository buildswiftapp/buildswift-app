import {
  hasPlansDocument,
  hasSpecsDocument,
  hasReadyUploads,
  uploadsStillPending,
} from '@/lib/clash-gap-document-inference'
import { formatProcessingStatusLabel } from '@/lib/clash-gap-processing-status'
import type { ClashGapProcessingProgress } from '@/lib/clash-gap-processing-status'
import type { DetectionSettings, DocumentUploadRow, ProcessingStep } from '@/lib/clash-gap-types'

export function formatSettingsStepLabel(settings: DetectionSettings): string {
  const modeLabel =
    settings.mode === 'both'
      ? 'Gaps & conflicts'
      : settings.mode === 'gaps'
        ? 'Gaps only'
        : 'Conflicts only'
  const sens =
    settings.sensitivity.charAt(0).toUpperCase() + settings.sensitivity.slice(1)
  return `${modeLabel} · ${sens} sensitivity`
}

export function formatUploadStepLabel(rows: DocumentUploadRow[]): string {
  if (!rows.length) return 'No files uploaded'
  const ready = rows.filter((r) => r.status === 'ready' && r.serverFileId).length
  if (uploadsStillPending(rows)) {
    return `${ready} ready · upload in progress`
  }
  if (!hasReadyUploads(rows)) {
    return `${rows.length} file(s) · waiting for upload`
  }
  const plans = hasPlansDocument(rows)
  const specs = hasSpecsDocument(rows)
  if (plans && specs) return `${rows.length} file(s) · Plans & specs ready`
  if (!plans) return `${rows.length} file(s) · Plans required`
  return `${rows.length} file(s) · Specifications required`
}

export function formatResultsStepLabel(params: {
  hasRun: boolean
  issueCount: number
  processingStep: ProcessingStep | string | null
  processingProgress?: ClashGapProcessingProgress | null
  clientUploadLabel?: string | null
  isProcessing: boolean
}): string {
  if (params.isProcessing) {
    const detail = formatProcessingStatusLabel(params.processingProgress ?? null, {
      processingStep: params.processingStep as ProcessingStep | null,
      clientUploadLabel: params.clientUploadLabel,
    })
    return `Running · ${detail}`
  }
  if (params.isProcessing) return 'Analysis in progress'
  if (!params.hasRun) return 'Not started'
  if (params.issueCount === 0) return 'Complete · no issues found'
  return `${params.issueCount} issue${params.issueCount === 1 ? '' : 's'} found`
}
