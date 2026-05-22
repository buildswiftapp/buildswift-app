/**
 * SessionStorage bridge from Clash/Gap Detection Tool → `/documents/new?type=rfi`.
 */
export const CLASH_GAP_RFI_PREFILL_STORAGE_KEY = 'buildswift:clashGapRfiPrefill'

export type ClashGapRfiPrefillPayload = {
  projectId: string
  title: string
  description: string
  dueDate?: string
  priority?: 'low' | 'normal' | 'urgent'
  detailReferences?: string
  drawingSheetNumbers?: string
  notes?: string
  sourceAnalysisId?: string
  sourceIssueId?: string
  suggestedAction?: string
}
