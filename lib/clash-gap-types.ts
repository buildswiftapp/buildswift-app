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

export type IssueStatus = 'pending' | 'reviewed' | 'dismissed' | 'resolved'

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
  confidence: 'low' | 'medium' | 'high'
  severity: 'low' | 'medium' | 'high'
  sources: IssueSourceReference[]
  location?: string
  sheetReference?: string
  suggestedAction?: string
  confidenceScore?: number
  status?: IssueStatus
  resolvedDocumentId?: string
  discipline?: string
  category?: string
  rationale?: string
  relatedIssueIds?: string[]
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
