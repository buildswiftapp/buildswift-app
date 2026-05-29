export const CLASH_GAP_CO_PREFILL_STORAGE_KEY = 'buildswift:clashGapCoPrefill'

export type ClashGapCoPrefillPayload = {
  projectId: string
  title: string
  description: string
  reason: string
  costPlaceholder?: string
  sourceAnalysisId?: string
  sourceIssueId?: string
  notes?: string
}
