import type { ProcessingStep } from '@/lib/clash-gap-types'

export type ClashGapProcessingPhase =
  | 'prepare'
  | 'download'
  | 'chunk'
  | 'embedded'
  | 'render'
  | 'ocr'
  | 'merge'
  | 'classify'
  | 'structure'
  | 'analyze'
  | 'done'

export type ClashGapProcessingProgress = {
  phase: ClashGapProcessingPhase
  fileName?: string
  fileIndex?: number
  fileTotal?: number
  pageIndex?: number
  pageTotal?: number
  chunkIndex?: number
  chunkTotal?: number
}

const PROGRESS_KEY = '_progress'

const VALID_PHASES: ClashGapProcessingPhase[] = [
  'prepare',
  'download',
  'chunk',
  'embedded',
  'render',
  'ocr',
  'merge',
  'classify',
  'structure',
  'analyze',
  'done',
]

export function processingProgressFromSummary(
  summary: unknown,
): ClashGapProcessingProgress | null {
  if (!summary || typeof summary !== 'object') return null
  const raw = (summary as Record<string, unknown>)[PROGRESS_KEY]
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const phase = o.phase
  if (typeof phase !== 'string' || !VALID_PHASES.includes(phase as ClashGapProcessingPhase)) {
    return null
  }
  return {
    phase: phase as ClashGapProcessingPhase,
    fileName: typeof o.fileName === 'string' ? o.fileName : undefined,
    fileIndex: typeof o.fileIndex === 'number' ? o.fileIndex : undefined,
    fileTotal: typeof o.fileTotal === 'number' ? o.fileTotal : undefined,
    pageIndex: typeof o.pageIndex === 'number' ? o.pageIndex : undefined,
    pageTotal: typeof o.pageTotal === 'number' ? o.pageTotal : undefined,
    chunkIndex: typeof o.chunkIndex === 'number' ? o.chunkIndex : undefined,
    chunkTotal: typeof o.chunkTotal === 'number' ? o.chunkTotal : undefined,
  }
}

export function summaryWithProgress(
  progress: ClashGapProcessingProgress,
): Record<string, unknown> {
  return { [PROGRESS_KEY]: progress }
}

export function phaseToProcessingStep(phase: ClashGapProcessingPhase): ProcessingStep {
  if (phase === 'classify') return 'classify'
  if (phase === 'structure') return 'structure'
  if (phase === 'analyze') return 'analyze'
  if (phase === 'done') return 'done'
  return 'extract'
}

export function formatProcessingStatusLabel(
  progress: ClashGapProcessingProgress | null,
  options?: {
    processingStep?: ProcessingStep | null
    clientUploadLabel?: string | null
  },
): string {
  if (options?.clientUploadLabel?.trim()) return options.clientUploadLabel.trim()

  if (progress) {
    const file =
      progress.fileName && progress.fileTotal && progress.fileIndex
        ? `${progress.fileName} (${progress.fileIndex}/${progress.fileTotal})`
        : progress.fileName

    const page =
      progress.pageIndex != null && progress.pageTotal != null
        ? `page ${progress.pageIndex}/${progress.pageTotal}`
        : null

    const chunk =
      progress.chunkIndex != null && progress.chunkTotal != null && progress.chunkTotal > 1
        ? `batch ${progress.chunkIndex}/${progress.chunkTotal}`
        : null

    const parts = [page, chunk].filter(Boolean).join(' · ')

    switch (progress.phase) {
      case 'prepare':
        return 'Preparing documents'
      case 'download':
        return file ? `Downloading ${file}` : 'Downloading PDF'
      case 'chunk':
        return parts ? `Splitting PDF ${parts}` : 'Splitting PDF into pages'
      case 'embedded':
        return parts ? `Extracting embedded text ${parts}` : 'Extracting embedded text'
      case 'render':
        return parts ? `Rendering ${parts}` : 'Rendering PDF pages'
      case 'ocr':
        return parts
          ? `OpenAI OCR ${parts}`
          : 'OpenAI OCR (reading text from pages)'
      case 'merge':
        return parts ? `Merging text ${parts}` : 'Merging text results'
      case 'classify':
        return 'Classifying disciplines'
      case 'structure':
        return 'Structuring sheet content'
      case 'analyze':
        return 'Analyzing gaps & conflicts'
      case 'done':
        return 'Finishing up'
    }
  }

  const step = options?.processingStep
  if (step === 'extract') return 'Extracting text (chunk + embedded + OCR)'
  if (step === 'classify') return 'Classifying'
  if (step === 'structure') return 'Structuring'
  if (step === 'analyze') return 'Analyzing'
  if (step === 'done') return 'Finishing'
  return 'Preparing'
}
