import { randomUUID } from 'crypto'
import {
  insightFindingsToDbRows,
  sortInsightFindings,
  dedupeFindings,
  type InsightFinding,
} from '@/lib/server/clash-gap/map-issues'

export type PersistInsightParams = {
  supabase: any
  findings: InsightFinding[]
  analysisId: string
  projectId: string
  accountId: string
}

function passesQc(finding: InsightFinding): boolean {
  const cat = (finding.category || '').toLowerCase()
  if (cat === 'a') return false
  const action = (finding.recommended_action || '').toLowerCase()
  if (action === 'dismiss') return false
  return Boolean((finding.issue_title || '').trim() && (finding.summary || finding.why_it_matters || '').trim())
}

export async function persistInsightFindings(params: PersistInsightParams): Promise<{
  rows: Array<Record<string, unknown>>
  linked: number
  created: number
}> {
  const { supabase, analysisId, projectId, accountId } = params
  const filtered = sortInsightFindings(dedupeFindings(params.findings.filter(passesQc)))

  await supabase.from('clash_gap_issues').delete().eq('analysis_id', analysisId)
  try {
    await supabase.from('project_issue_scan_links').delete().eq('analysis_id', analysisId)
  } catch {
  }

  const scanRows: Array<Record<string, unknown>> = []
  let linked = 0
  let created = 0

  for (const finding of filtered) {
    const title = (finding.issue_title || '').trim()
    const issueType = (finding.issue_type || 'Coordination Concern').trim()
    const summary = (finding.summary || finding.why_it_matters || '').trim()
    const matchId = finding.match_existing_issue_id
    const matchRationale = finding.match_rationale

    let projectIssueId: string | null = null
    let isLinked = false

    if (matchId) {
      const { data: existing } = await supabase
        .from('project_issues')
        .select('id')
        .eq('id', matchId)
        .eq('project_id', projectId)
        .eq('account_id', accountId)
        .maybeSingle()
      if (existing?.id) {
        projectIssueId = existing.id
        isLinked = true
        linked++
        await supabase
          .from('project_issues')
          .update({
            latest_summary: summary,
            recommended_action: finding.recommended_action || null,
            updated_at: new Date().toISOString(),
            insight_metadata: finding,
          })
          .eq('id', projectIssueId)
      }
    }

    if (!projectIssueId) {
      projectIssueId = randomUUID()
      created++
      try {
        await supabase.from('project_issues').insert({
          id: projectIssueId,
          project_id: projectId,
          account_id: accountId,
          issue_key: randomUUID().slice(0, 8),
          title,
          issue_type_v2: issueType,
          insight_category: finding.category || null,
          csi_division_primary: finding.csi_division_primary || null,
          severity: (finding.severity || 'medium').toLowerCase(),
          workflow_status: 'open',
          recommended_action: finding.recommended_action || null,
          user_disposition: null,
          priority: finding.suggested_priority?.toLowerCase() || null,
          latest_summary: summary,
          insight_metadata: finding,
        })
      } catch {
        projectIssueId = null
      }
    }

    if (projectIssueId) {
      try {
        await supabase.from('project_issue_scan_links').upsert(
          {
            project_issue_id: projectIssueId,
            analysis_id: analysisId,
            account_id: accountId,
            finding_summary: summary,
            evidence_strength: finding.evidence_strength || null,
            contractor_impact: finding.contractor_impact || null,
            key_references: finding.key_references || [],
            sources: finding.sources || [],
            insight_metadata: finding,
            match_rationale: matchRationale || null,
          },
          { onConflict: 'project_issue_id,analysis_id' },
        )
      } catch {
      }
    }

    const legacyRows = insightFindingsToDbRows({
      findings: [finding],
      analysisId,
      accountId,
    })
    for (const row of legacyRows) {
      scanRows.push({
        ...row,
        project_issue_id: projectIssueId,
        workflow_status: 'open',
        status: 'pending',
        user_disposition: null,
        is_linked_to_existing: isLinked,
        match_rationale: matchRationale || null,
        priority:
          finding.suggested_priority?.toLowerCase() ||
          row.priority ||
          null,
      })
    }
  }

  if (scanRows.length) {
    const { error } = await supabase.from('clash_gap_issues').insert(scanRows)
    if (error) throw new Error(error.message)
  }

  return { rows: scanRows, linked, created }
}