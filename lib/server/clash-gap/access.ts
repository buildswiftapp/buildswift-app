import type { DetectionSettings } from '@/lib/clash-gap-types'
import { DEFAULT_DETECTION_SETTINGS } from '@/lib/clash-gap-api'

export type ClashGapAnalysisRow = {
  id: string
  account_id: string
  project_id: string
  created_by: string
  status: string
  processing_step: string | null
  settings: DetectionSettings
  error_message: string | null
  summary: Record<string, unknown> | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export function parseSettings(raw: unknown): DetectionSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DETECTION_SETTINGS }
  const o = raw as Record<string, unknown>
  return {
    mode:
      o.mode === 'gaps' || o.mode === 'conflicts' || o.mode === 'both'
        ? o.mode
        : DEFAULT_DETECTION_SETTINGS.mode,
    scope:
      o.scope === 'entire_project' ||
      o.scope === 'selected_trades' ||
      o.scope === 'selected_documents'
        ? o.scope
        : DEFAULT_DETECTION_SETTINGS.scope,
    sensitivity:
      o.sensitivity === 'low' || o.sensitivity === 'medium' || o.sensitivity === 'high'
        ? o.sensitivity
        : DEFAULT_DETECTION_SETTINGS.sensitivity,
    rfiFormat:
      o.rfiFormat === 'short' || o.rfiFormat === 'detailed'
        ? o.rfiFormat
        : DEFAULT_DETECTION_SETTINGS.rfiFormat,
    selectedTrades: Array.isArray(o.selectedTrades)
      ? o.selectedTrades.filter((t): t is string => typeof t === 'string')
      : [],
  }
}

export async function assertProjectOwned(
  supabase: any,
  accountId: string,
  projectId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('account_id', accountId)
    .maybeSingle()
  if (error) return { ok: false, reason: error.message }
  if (!data) return { ok: false, reason: 'Project not found' }
  return { ok: true }
}

export async function getAnalysisForAccount(
  supabase: any,
  analysisId: string,
  accountId: string
): Promise<ClashGapAnalysisRow | null> {
  const { data, error } = await supabase
    .from('clash_gap_analyses')
    .select('*')
    .eq('id', analysisId)
    .eq('account_id', accountId)
    .maybeSingle()
  if (error || !data) return null
  return {
    ...data,
    settings: parseSettings(data.settings),
  } as ClashGapAnalysisRow
}

export async function getIssueForAccount(
  supabase: any,
  issueId: string,
  accountId: string
) {
  const { data, error } = await supabase
    .from('clash_gap_issues')
    .select('*')
    .eq('id', issueId)
    .eq('account_id', accountId)
    .maybeSingle()
  if (error || !data) return null
  return data
}

export async function updateAnalysisStep(
  supabase: any,
  analysisId: string,
  patch: {
    status?: string
    processing_step?: string | null
    error_message?: string | null
    summary?: Record<string, unknown> | null
    completed_at?: string | null
  }
) {
  const { error } = await supabase
    .from('clash_gap_analyses')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', analysisId)
  return error
}
