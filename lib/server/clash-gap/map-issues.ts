import { randomUUID } from 'crypto'
import type { IssueSourceReference } from '@/lib/clash-gap-types'

export type LlmIssue = {
  type?: string
  title?: string
  description?: string
  location?: string
  sheet_reference?: string
  severity?: string
  suggested_action?: string
  confidence_score?: number
  sources?: IssueSourceReference[]
  discipline?: string
  category?: string
}

export type InsightFinding = {
  issue_title?: string
  issue_type?: string
  category?: string
  csi_division_primary?: string
  csi_divisions_secondary?: string[]
  trade_classifications?: string[]
  severity?: string
  evidence_strength?: string
  contractor_impact?: string
  recommended_action?: string
  missing_information_types?: string[]
  impacted_trades?: string[]
  summary?: string
  why_it_matters?: string
  decision_rationale?: string
  suggested_resolution?: string
  cost_risk?: string
  schedule_risk?: string
  field_risk?: string
  procurement_risk?: string
  key_references?: string[]
  drawing_references?: unknown[]
  specification_references?: unknown[]
  addendum_references?: unknown[]
  document_search_results?: string[]
  related_findings?: string[]
  match_existing_issue_id?: string
  match_rationale?: string
  suggested_priority?: string
  suggested_assignee_role?: string
  scan_phase?: string
  sources?: IssueSourceReference[]
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const IMPACT_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

const EVIDENCE_ORDER: Record<string, number> = {
  strong: 0,
  moderate: 1,
  weak: 2,
}

function norm(s: string | undefined): string {
  return (s || '').trim().toLowerCase()
}

function legacyTypeFromIssueType(issueType: string): 'clash' | 'gap' | 'mismatch' {
  const t = norm(issueType)
  if (t.includes('conflict') || t.includes('addendum')) return 'clash'
  if (t.includes('gap') || t.includes('missing')) return 'gap'
  return 'mismatch'
}

function normalizeSeverity(raw: string | undefined): string {
  const s = norm(raw)
  if (s === 'critical') return 'critical'
  if (s === 'high') return 'high'
  if (s === 'low') return 'low'
  return 'medium'
}

export function parseInsightFindingsPayload(raw: unknown): InsightFinding[] {
  if (!raw || typeof raw !== 'object') return []
  const obj = raw as Record<string, unknown>
  const list = Array.isArray(obj.findings) ? obj.findings : []
  return list.filter((item): item is InsightFinding => item && typeof item === 'object')
}

export function parseLlmIssuesPayload(raw: unknown): LlmIssue[] {
  if (!raw || typeof raw !== 'object') return []
  const obj = raw as Record<string, unknown>
  const list = Array.isArray(obj.issues) ? obj.issues : Array.isArray(raw) ? raw : []
  return list.filter((item): item is LlmIssue => item && typeof item === 'object')
}

function passesInsightQc(finding: InsightFinding): boolean {
  const cat = norm(finding.category)
  if (cat === 'a') return false
  const action = norm(finding.recommended_action)
  if (action === 'dismiss') return false
  const title = (finding.issue_title || '').trim()
  const summary = (finding.summary || finding.why_it_matters || '').trim()
  if (!title || !summary) return false
  if (norm(finding.evidence_strength) === 'weak' && norm(finding.contractor_impact) === 'low') {
    return norm(finding.severity) === 'critical' || norm(finding.severity) === 'high'
  }
  return true
}

export function dedupeFindings(findings: InsightFinding[]): InsightFinding[] {
  const seen = new Map<string, InsightFinding>()
  for (const f of findings) {
    const key = `${norm(f.issue_type)}:${(f.issue_title || '').toLowerCase()}:${(f.key_references || []).join(',')}`
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, f)
      continue
    }
    const refs = new Set([
      ...(existing.key_references || []),
      ...(f.key_references || []),
    ])
    existing.key_references = [...refs]
  }
  return [...seen.values()]
}

export function sortInsightFindings(findings: InsightFinding[]): InsightFinding[] {
  return [...findings].sort((a, b) => {
    const sa = SEVERITY_ORDER[norm(a.severity)] ?? 9
    const sb = SEVERITY_ORDER[norm(b.severity)] ?? 9
    if (sa !== sb) return sa - sb
    const ia = IMPACT_ORDER[norm(a.contractor_impact)] ?? 9
    const ib = IMPACT_ORDER[norm(b.contractor_impact)] ?? 9
    if (ia !== ib) return ia - ib
    const ea = EVIDENCE_ORDER[norm(a.evidence_strength)] ?? 9
    const eb = EVIDENCE_ORDER[norm(b.evidence_strength)] ?? 9
    if (ea !== eb) return ea - eb
    return (b.impacted_trades?.length ?? 0) - (a.impacted_trades?.length ?? 0)
  })
}

export function insightFindingsToDbRows(params: {
  findings: InsightFinding[]
  analysisId: string
  accountId: string
}) {
  const filtered = sortInsightFindings(
    dedupeFindings(params.findings.filter(passesInsightQc)),
  )
  const rows: Array<Record<string, unknown>> = []

  for (const finding of filtered) {
    const title = (finding.issue_title || '').trim()
    const issueType = (finding.issue_type || 'Coordination Concern').trim()
    const summary = (finding.summary || finding.why_it_matters || '').trim()
    const description = summary
    if (!title || !description) continue

    const legacyType = legacyTypeFromIssueType(issueType)
    const keyRefs = finding.key_references || []
    const sheetRef = keyRefs.find((r) => /^[A-Z]{0,3}\d/.test(r)) || keyRefs[0] || null

    rows.push({
      id: randomUUID(),
      analysis_id: params.analysisId,
      account_id: params.accountId,
      issue_key: randomUUID().slice(0, 8),
      type: legacyType,
      title,
      description,
      location: null,
      sheet_reference: sheetRef,
      severity: normalizeSeverity(finding.severity),
      suggested_action: finding.recommended_action || finding.suggested_resolution || null,
      confidence_score: null,
      sources: Array.isArray(finding.sources) ? finding.sources : [],
      status: 'pending',
      workflow_status: 'open',
      user_disposition: null,
      issue_type_v2: issueType,
      insight_category: finding.category || null,
      csi_division_primary: finding.csi_division_primary || null,
      csi_divisions_secondary: finding.csi_divisions_secondary || [],
      evidence_strength: finding.evidence_strength || null,
      contractor_impact: finding.contractor_impact || null,
      recommended_action: finding.recommended_action || null,
      missing_information_types: finding.missing_information_types || [],
      impacted_trades: finding.impacted_trades || finding.trade_classifications || [],
      drawing_references: finding.drawing_references || [],
      specification_references: finding.specification_references || [],
      addendum_references: finding.addendum_references || [],
      why_it_matters: finding.why_it_matters || null,
      decision_rationale: finding.decision_rationale || null,
      suggested_resolution: finding.suggested_resolution || null,
      cost_risk: finding.cost_risk || null,
      schedule_risk: finding.schedule_risk || null,
      field_risk: finding.field_risk || null,
      procurement_risk: finding.procurement_risk || null,
      related_issue_ids: [],
      document_search_results: finding.document_search_results || [],
      key_references: keyRefs,
      insight_metadata: finding,
      discipline: finding.trade_classifications?.[0] || null,
      category: finding.category || null,
    })
  }

  return rows
}

export function llmIssuesToDbRows(params: {
  issues: LlmIssue[]
  analysisId: string
  accountId: string
}) {
  const seen = new Set<string>()
  const rows: Array<Record<string, unknown>> = []

  for (const issue of params.issues) {
    const typeRaw = String(issue.type || '')
    const t = typeRaw.trim().toLowerCase()
    let type: 'clash' | 'gap' | 'mismatch' | null = null
    if (t === 'clash' || t === 'conflict') type = 'clash'
    else if (t === 'gap' || t === 'missing') type = 'gap'
    else if (t === 'mismatch' || t === 'verified') type = 'mismatch'
    const title = typeof issue.title === 'string' ? issue.title.trim() : ''
    const description = typeof issue.description === 'string' ? issue.description.trim() : ''
    if (!type || !title || !description) continue

    const sheetRef =
      typeof issue.sheet_reference === 'string' ? issue.sheet_reference.trim() : ''
    const dedupeKey = `${type}:${title.toLowerCase()}:${sheetRef.toLowerCase()}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    rows.push({
      id: randomUUID(),
      analysis_id: params.analysisId,
      account_id: params.accountId,
      issue_key: randomUUID().slice(0, 8),
      type,
      title,
      description,
      location: typeof issue.location === 'string' ? issue.location.trim() : null,
      sheet_reference: sheetRef || null,
      severity: normalizeSeverity(issue.severity),
      suggested_action:
        typeof issue.suggested_action === 'string' ? issue.suggested_action.trim() : null,
      confidence_score:
        typeof issue.confidence_score === 'number'
          ? Math.min(1, Math.max(0, issue.confidence_score))
          : null,
      sources: Array.isArray(issue.sources) ? issue.sources : [],
      status: 'pending',
    })
  }

  return rows
}

export function buildSummaryFromRows(
  rows: Array<{ type: string; issue_type_v2?: string | null; recommended_action?: string | null }>,
) {
  const by_type = { clash: 0, gap: 0, mismatch: 0 }
  const by_action = { internal_review: 0, external_rfi: 0 }
  for (const r of rows) {
    if (r.type === 'clash') by_type.clash++
    else if (r.type === 'gap') by_type.gap++
    else if (r.type === 'mismatch') by_type.mismatch++
    const action = (r.recommended_action || '').toLowerCase()
    if (action.includes('internal')) by_action.internal_review++
    else if (action.includes('external') || action.includes('rfi')) by_action.external_rfi++
  }
  return { total: rows.length, by_type, by_action }
}
