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

function normalizeDbType(raw: string): 'clash' | 'gap' | 'mismatch' | null {
  const t = raw.trim().toLowerCase()
  if (t === 'clash' || t === 'conflict') return 'clash'
  if (t === 'gap' || t === 'missing') return 'gap'
  if (t === 'mismatch' || t === 'verified') return 'mismatch'
  return null
}

function normalizeSeverity(raw: string | undefined): string {
  const s = (raw || 'medium').toLowerCase()
  if (s === 'high' || s === 'low') return s
  return 'medium'
}

export function parseLlmIssuesPayload(raw: unknown): LlmIssue[] {
  if (!raw || typeof raw !== 'object') return []
  const obj = raw as Record<string, unknown>
  const list = Array.isArray(obj.issues) ? obj.issues : Array.isArray(raw) ? raw : []
  return list.filter((item): item is LlmIssue => item && typeof item === 'object')
}

export function llmIssuesToDbRows(params: {
  issues: LlmIssue[]
  analysisId: string
  accountId: string
}) {
  const seen = new Set<string>()
  const rows: Array<Record<string, unknown>> = []

  for (const issue of params.issues) {
    const type = normalizeDbType(String(issue.type || ''))
    const title = typeof issue.title === 'string' ? issue.title.trim() : ''
    const description = typeof issue.description === 'string' ? issue.description.trim() : ''
    if (!type || !title || !description) continue

    const sheetRef =
      typeof issue.sheet_reference === 'string' ? issue.sheet_reference.trim() : ''
    const dedupeKey = `${type}:${title.toLowerCase()}:${sheetRef.toLowerCase()}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const score =
      typeof issue.confidence_score === 'number'
        ? Math.min(1, Math.max(0, issue.confidence_score))
        : null

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
      confidence_score: score,
      sources: Array.isArray(issue.sources) ? issue.sources : [],
      status: 'pending',
    })
  }

  return rows
}

export function buildSummaryFromRows(rows: Array<{ type: string }>) {
  const by_type = { clash: 0, gap: 0, mismatch: 0 }
  for (const r of rows) {
    if (r.type === 'clash') by_type.clash++
    else if (r.type === 'gap') by_type.gap++
    else if (r.type === 'mismatch') by_type.mismatch++
  }
  return { total: rows.length, by_type }
}
