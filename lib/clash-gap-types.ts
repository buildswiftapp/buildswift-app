export const DOCUMENT_LABEL_TYPES = [
  'plans',
  'specs',
  'general_notes',
  'addenda',
  'rfis',
  'submittals',
] as const

export type DocumentLabelType = (typeof DOCUMENT_LABEL_TYPES)[number]

export type UploadStatus = 'pending' | 'ready' | 'error'

export interface DocumentUploadRow {
  id: string
  filename: string
  type: DocumentLabelType
  pages: number | '—'
  status: UploadStatus
  file?: File
}

export type IssueType = 'conflict' | 'missing' | 'verified'

export interface IssueSourceReference {
  documentLabel: string
  page: number | string
  excerpt: string
  /** substring of excerpt to wrap in highlight (visual only) */
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
  /** For filters and detail metadata (mock / future API). */
  discipline?: string
  category?: string
  /** Explainer copy for the center column. */
  rationale?: string
  /** Other issue ids in the same run (for “Related issues”). */
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
}

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
