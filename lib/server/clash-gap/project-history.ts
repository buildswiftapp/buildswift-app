import { fetchAllRows } from '@/lib/server/clash-gap/fetch-all-rows'

export type ProjectHistoryIssue = {
  id: string
  issue_key: string | null
  title: string
  issue_type_v2: string | null
  workflow_status: string
  recommended_action: string | null
  user_disposition: string | null
  severity: string | null
  key_references: string[]
  summary: string | null
}

export type ProjectHistoryRfi = {
  id: string
  doc_number: string | null
  title: string
  status: string | null
}

export type ProjectHistoryContext = {
  project_id: string
  project_name: string | null
  existing_issues: ProjectHistoryIssue[]
  existing_rfis: ProjectHistoryRfi[]
  prior_scan_ids: string[]
  prior_dispositions: Array<{ issue_id: string; disposition: string | null; status: string }>
}

export async function loadProjectHistoryContext(
  supabase: any,
  projectId: string,
  accountId: string,
  excludeAnalysisId?: string,
): Promise<ProjectHistoryContext> {
  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .eq('account_id', accountId)
    .maybeSingle()

  let existingIssues: ProjectHistoryIssue[] = []
  try {
    const rows = await fetchAllRows<any>(async (from, to) =>
      supabase
        .from('project_issues')
        .select(
          'id, issue_key, title, issue_type_v2, workflow_status, recommended_action, user_disposition, severity, latest_summary, insight_metadata',
        )
        .eq('project_id', projectId)
        .eq('account_id', accountId)
        .order('updated_at', { ascending: false })
        .range(from, to),
    )
    existingIssues = rows
      .filter((r) => !['closed', 'resolved'].includes(r.workflow_status))
      .map((r) => ({
      id: r.id,
      issue_key: r.issue_key,
      title: r.title,
      issue_type_v2: r.issue_type_v2,
      workflow_status: r.workflow_status,
      recommended_action: r.recommended_action,
      user_disposition: r.user_disposition,
      severity: r.severity,
      key_references: (r.insight_metadata?.key_references as string[]) || [],
      summary: r.latest_summary,
    }))
  } catch {
    const analysisQuery = supabase
      .from('clash_gap_analyses')
      .select('id')
      .eq('project_id', projectId)
      .eq('account_id', accountId)
    if (excludeAnalysisId) analysisQuery.neq('id', excludeAnalysisId)
    const { data: analyses } = await analysisQuery
    const analysisIds = (analyses ?? []).map((a: { id: string }) => a.id)
    if (analysisIds.length) {
      const rows = await fetchAllRows<any>(async (from, to) =>
        supabase
          .from('clash_gap_issues')
          .select('id, issue_key, title, issue_type_v2, status, recommended_action, user_disposition, severity, description, key_references')
          .eq('account_id', accountId)
          .in('analysis_id', analysisIds)
          .range(from, to),
      )
      existingIssues = rows
        .filter((r) => !['dismissed', 'resolved'].includes(r.status))
        .map((r) => ({
        id: r.id,
        issue_key: r.issue_key,
        title: r.title,
        issue_type_v2: r.issue_type_v2,
        workflow_status: r.workflow_status || r.status || 'open',
        recommended_action: r.recommended_action,
        user_disposition: r.user_disposition,
        severity: r.severity,
        key_references: r.key_references || [],
        summary: r.description,
      }))
    }
  }

  let existingRfis: ProjectHistoryRfi[] = []
  try {
    const { data: rfis } = await supabase
      .from('documents')
      .select('id, doc_number, title, status, internal_status, external_status')
      .eq('project_id', projectId)
      .eq('account_id', accountId)
      .eq('doc_type', 'rfi')
      .order('created_at', { ascending: false })
      .limit(50)
    existingRfis = (rfis ?? []).map((r: any) => ({
      id: r.id,
      doc_number: r.doc_number,
      title: r.title,
      status: r.status || r.internal_status || r.external_status,
    }))
  } catch {
  }

  const analysisQuery = supabase
    .from('clash_gap_analyses')
    .select('id, completed_at, summary')
    .eq('project_id', projectId)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (excludeAnalysisId) analysisQuery.neq('id', excludeAnalysisId)
  const { data: priorAnalyses } = await analysisQuery

  const priorDispositions = existingIssues
    .filter((i) => i.user_disposition)
    .map((i) => ({
      issue_id: i.id,
      disposition: i.user_disposition,
      status: i.workflow_status,
    }))

  return {
    project_id: projectId,
    project_name: project?.name ?? null,
    existing_issues: existingIssues.slice(0, 100),
    existing_rfis: existingRfis,
    prior_scan_ids: (priorAnalyses ?? []).map((a: { id: string }) => a.id),
    prior_dispositions: priorDispositions,
  }
}
