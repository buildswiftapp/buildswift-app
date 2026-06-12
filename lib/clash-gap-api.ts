import type {
  ClashGapAnalysisSummary,
  ClashGapIssue,
  DetectionSettings,
  IssueSourceReference,
  IssueType,
} from '@/lib/clash-gap-types'
import type { StagesMap } from '@/lib/clash-gap-stages'

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
  issue_type_v2?: string | null
  insight_category?: string | null
  csi_division_primary?: string | null
  evidence_strength?: string | null
  contractor_impact?: string | null
  recommended_action?: string | null
  key_references?: string[] | null
  why_it_matters?: string | null
  decision_rationale?: string | null
  suggested_resolution?: string | null
  document_search_results?: string[] | null
  workflow_status?: string | null
  user_disposition?: string | null
  priority?: string | null
  project_issue_id?: string | null
  is_linked_to_existing?: boolean | null
  match_rationale?: string | null
}

export type ClashGapSessionMeta = {
  bookmarkedIds?: string[]
  selectedIssueId?: string | null
}

export type ApiClashGapAnalysis = {
  id: string
  project_id: string
  status: string
  processing_step: string | null
  settings: DetectionSettings
  error_message: string | null
  summary: ClashGapAnalysisSummary | null
  stages?: StagesMap
  created_at: string
  completed_at: string | null
  saved_at?: string | null
  session_meta?: ClashGapSessionMeta
}

export type ApiClashGapAnalysisListItem = ApiClashGapAnalysis & {
  project_name?: string | null
  issue_count?: number
  plan_documents?: string[]
  spec_documents?: string[]
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

export type ApiClashGapAnalysisStatus = {
  analysis: Pick<
    ApiClashGapAnalysis,
    'id' | 'status' | 'processing_step' | 'error_message' | 'stages'
  > & { updated_at?: string }
}

function dbTypeToUi(type: ApiClashGapIssue['type'], issueTypeV2?: string | null): IssueType {
  if (issueTypeV2) {
    const t = issueTypeV2.toLowerCase()
    if (t.includes('conflict') || t.includes('clash')) return 'conflict'
    if (t.includes('gap') || t.includes('missing')) return 'missing'
  }
  if (type === 'clash') return 'conflict'
  if (type === 'gap') return 'missing'
  return 'mismatch'
}

function uiTypeToDb(type: IssueType): ApiClashGapIssue['type'] {
  if (type === 'conflict') return 'clash'
  if (type === 'missing') return 'gap'
  return 'mismatch'
}

function normalizeSeverity(s: string): 'low' | 'medium' | 'high' | 'critical' {
  const v = s.toLowerCase()
  if (v === 'critical') return 'critical'
  if (v === 'high') return 'high'
  if (v === 'low') return 'low'
  return 'medium'
}

function normalizeEvidence(s: string | null | undefined): ClashGapIssue['evidenceStrength'] {
  const v = (s || '').toLowerCase()
  if (v === 'strong') return 'Strong'
  if (v === 'weak') return 'Weak'
  if (v === 'moderate') return 'Moderate'
  return undefined
}

function normalizeImpact(s: string | null | undefined): ClashGapIssue['contractorImpact'] {
  const v = (s || '').toLowerCase()
  if (v === 'high') return 'High'
  if (v === 'low') return 'Low'
  if (v === 'medium') return 'Medium'
  return undefined
}

function normalizeRecommendedAction(
  s: string | null | undefined,
): ClashGapIssue['recommendedAction'] {
  const v = (s || '').toLowerCase()
  if (v.includes('internal')) return 'Internal Review'
  if (v.includes('field')) return 'Field Verification'
  if (v.includes('external') || v.includes('rfi')) return 'External RFI'
  if (v.includes('dismiss')) return 'Dismiss'
  return undefined
}

export function mapApiIssueToClashGapIssue(row: ApiClashGapIssue): ClashGapIssue {
  const recommendedAction = normalizeRecommendedAction(row.recommended_action)
  return {
    id: row.id,
    type: dbTypeToUi(row.type, row.issue_type_v2),
    title: row.title,
    summary: row.description,
    severity: normalizeSeverity(row.severity),
    sources: Array.isArray(row.sources) ? row.sources : [],
    location: row.location ?? undefined,
    sheetReference: row.sheet_reference ?? undefined,
    suggestedAction: row.suggested_action ?? row.suggested_resolution ?? undefined,
    status: row.status,
    resolvedDocumentId: row.resolved_document_id ?? undefined,
    discipline: row.discipline ?? undefined,
    category: row.insight_category ?? row.category ?? undefined,
    issueType: row.issue_type_v2 ?? undefined,
    csiDivision: row.csi_division_primary ?? undefined,
    evidenceStrength: normalizeEvidence(row.evidence_strength),
    contractorImpact: normalizeImpact(row.contractor_impact),
    recommendedAction,
    keyReferences: Array.isArray(row.key_references) ? row.key_references : undefined,
    whyItMatters: row.why_it_matters ?? undefined,
    suggestedResolution: row.suggested_resolution ?? undefined,
    decisionRationale: row.decision_rationale ?? undefined,
    documentSearchResults: Array.isArray(row.document_search_results)
      ? row.document_search_results
      : undefined,
    rationale: row.decision_rationale ?? undefined,
    userDisposition: (row.user_disposition as ClashGapIssue['userDisposition']) ?? undefined,
    workflowStatus: (row.workflow_status as ClashGapIssue['workflowStatus']) ?? undefined,
    priority: (row.priority as ClashGapIssue['priority']) ?? undefined,
    isLinkedToExisting: row.is_linked_to_existing ?? false,
    matchRationale: row.match_rationale ?? undefined,
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
