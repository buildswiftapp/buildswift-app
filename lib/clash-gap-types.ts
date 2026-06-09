export const DOCUMENT_LABEL_TYPES = [
  'plans',
  'specs',
  'general_notes',
  'addenda',
  'rfis',
  'submittals',
] as const

export const CLASH_GAP_UPLOAD_TYPES = ['plans', 'specs', 'addenda'] as const

export type DocumentLabelType = (typeof DOCUMENT_LABEL_TYPES)[number]

export type UploadStatus = 'pending' | 'ready' | 'error'

export interface DocumentUploadRow {
  id: string
  filename: string
  type: DocumentLabelType | null
  pages: number | '—'
  status: UploadStatus
  progress?: number
  file?: File
  serverFileId?: string
}

export type IssueType = 'conflict' | 'missing' | 'mismatch'

export const INSIGHT_USER_DISPOSITIONS = [
  'External RFI',
  'Internal Review',
  'Field Verification',
  'Dismiss',
] as const

export const INSIGHT_WORKFLOW_STATUSES = [
  'open',
  'under_review',
  'internal_review',
  'field_verification',
  'rfi_drafting',
  'rfi_sent',
  'waiting_for_response',
  'resolved',
  'closed',
] as const

export type InsightWorkflowStatus = (typeof INSIGHT_WORKFLOW_STATUSES)[number]
export type InsightUserDisposition = (typeof INSIGHT_USER_DISPOSITIONS)[number]

export type IssueStatus = 'pending' | 'reviewed' | 'dismissed' | 'resolved' | InsightWorkflowStatus

export interface IssueSourceReference {
  documentLabel: string
  page: number | string
  excerpt: string
  highlight?: string
}

export interface ClashGapIssue {
  id: string
  type: IssueType
  title: string
  summary: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  sources: IssueSourceReference[]
  location?: string
  sheetReference?: string
  suggestedAction?: string
  status?: IssueStatus
  resolvedDocumentId?: string
  discipline?: string
  category?: string
  rationale?: string
  relatedIssueIds?: string[]
  issueType?: string
  csiDivision?: string
  evidenceStrength?: 'Strong' | 'Moderate' | 'Weak'
  contractorImpact?: 'High' | 'Medium' | 'Low'
  recommendedAction?: 'Internal Review' | 'External RFI' | 'Field Verification' | 'Dismiss'
  keyReferences?: string[]
  userDisposition?: InsightUserDisposition
  workflowStatus?: InsightWorkflowStatus
  priority?: 'critical' | 'high' | 'medium' | 'low'
  isLinkedToExisting?: boolean
  matchRationale?: string
  whyItMatters?: string
  suggestedResolution?: string
  decisionRationale?: string
  documentSearchResults?: string[]
  confidence?: 'low' | 'medium' | 'high'
  confidenceScore?: number
}

export type DetectionMode = 'gaps' | 'conflicts' | 'both'

export type DetectionScope = 'entire_project' | 'selected_trades' | 'selected_documents'

export type SensitivityLevel = 'low' | 'medium' | 'high'

export type RfiOutputFormat = 'short' | 'detailed'

export interface DetectionSettings {
  mode: DetectionMode
  scope: DetectionScope
  sensitivity: SensitivityLevel
  rfiFormat: RfiOutputFormat
  selectedTrades?: string[]
}

export interface ClashGapAnalysisSummary {
  total: number
  by_type: { clash: number; gap: number; mismatch: number }
  by_action?: { internal_review: number; external_rfi: number }
}

export type DetectionWizardStep = 'upload' | 'chunk' | 'ocr' | 'detection' | 'result'

export const DETECTION_WIZARD_STEPS: DetectionWizardStep[] = [
  'upload',
  'chunk',
  'ocr',
  'detection',
  'result',
]

export type AnalysisStatus =
  | 'draft'
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'

export type ProcessingStep = 'extract' | 'classify' | 'structure' | 'analyze' | 'done'

export interface RfiDraftState {
  title: string
  subject: string
  description: string
  relatedDocuments: string
  discipline: string
  priority: 'low' | 'normal' | 'urgent'
  dueDate: string
  assignee: string
  notes: string
}

export type WorkflowStep = 'uploadSetup' | 'results' | 'rfiDraft'
