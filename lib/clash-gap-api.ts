import type {
  ClashGapAnalysisSummary,
  ClashGapIssue,
  DetectionSettings,
  IssueSourceReference,
  IssueType,
} from '@/lib/clash-gap-types'

export type ApiClashGapIssue = {
  id: string
  issue_key: string | null
  type: 'clash' | 'gap' | 'mismatch'
  title: string
  description: string
  location: string | null
  sheet_reference: string | null
  severity: string
  suggested_action: string | null
  confidence_score: number | null
  sources: IssueSourceReference[]
  status: 'pending' | 'reviewed' | 'dismissed' | 'resolved'
  resolved_document_id: string | null
  discipline?: string | null
  category?: string | null
}

export type ApiClashGapAnalysis = {
  id: string
  project_id: string
  status: string
  processing_step: string | null
  settings: DetectionSettings
  error_message: string | null
  summary: ClashGapAnalysisSummary | null
  created_at: string
  completed_at: string | null
}

export type ApiClashGapFile = {
  id: string
  file_name: string
  file_role: string
  mime_type: string | null
  page_count: number | null
  status?: string
}

export type ApiClashGapAnalysisDetail = {
  analysis: ApiClashGapAnalysis
  files: ApiClashGapFile[]
  issues: ApiClashGapIssue[]
}

function dbTypeToUi(type: ApiClashGapIssue['type']): IssueType {
  if (type === 'clash') return 'conflict'
  if (type === 'gap') return 'missing'
  return 'mismatch'
}

function uiTypeToDb(type: IssueType): ApiClashGapIssue['type'] {
  if (type === 'conflict') return 'clash'
  if (type === 'missing') return 'gap'
  return 'mismatch'
}

export function confidenceBand(score: number | null | undefined): 'low' | 'medium' | 'high' {
  if (score == null || Number.isNaN(score)) return 'medium'
  if (score >= 0.75) return 'high'
  if (score >= 0.45) return 'medium'
  return 'low'
}

function normalizeSeverity(s: string): 'low' | 'medium' | 'high' {
  const v = s.toLowerCase()
  if (v === 'high') return 'high'
  if (v === 'low') return 'low'
  return 'medium'
}

export function mapApiIssueToClashGapIssue(row: ApiClashGapIssue): ClashGapIssue {
  return {
    id: row.id,
    type: dbTypeToUi(row.type),
    title: row.title,
    summary: row.description,
    confidence: confidenceBand(row.confidence_score),
    severity: normalizeSeverity(row.severity),
    sources: Array.isArray(row.sources) ? row.sources : [],
    location: row.location ?? undefined,
    sheetReference: row.sheet_reference ?? undefined,
    suggestedAction: row.suggested_action ?? undefined,
    confidenceScore: row.confidence_score ?? undefined,
    status: row.status,
    resolvedDocumentId: row.resolved_document_id ?? undefined,
    discipline: row.discipline ?? undefined,
    category: row.category ?? undefined,
  }
}

export { uiTypeToDb }

export const DEFAULT_DETECTION_SETTINGS: DetectionSettings = {
  mode: 'both',
  scope: 'entire_project',
  sensitivity: 'medium',
  rfiFormat: 'detailed',
  selectedTrades: [],
}
