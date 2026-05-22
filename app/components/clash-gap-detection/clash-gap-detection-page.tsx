'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { apiDownloadBlob, apiUpload } from '@/lib/api-upload'
import {
  mapApiIssueToClashGapIssue,
  type ApiClashGapAnalysisDetail,
} from '@/lib/clash-gap-api'
import {
  CLASH_GAP_CO_PREFILL_STORAGE_KEY,
  type ClashGapCoPrefillPayload,
} from '@/lib/clash-gap-co-prefill'
import {
  CLASH_GAP_RFI_PREFILL_STORAGE_KEY,
  type ClashGapRfiPrefillPayload,
} from '@/lib/clash-gap-rfi-prefill'
import {
  CLASH_GAP_SESSION_STORAGE_KEY,
  type ClashGapSessionV1,
} from '@/lib/clash-gap-session'
import {
  canRunClashGapDetection,
  fileRoleFromDocType,
  missingDocumentRolesMessage,
  reconcileDocumentTypes,
} from '@/lib/clash-gap-document-inference'
import type {
  ClashGapIssue,
  DetectionSettings,
  DocumentLabelType,
  DocumentUploadRow,
  IssueType,
  ProcessingStep,
  RfiDraftState,
} from '@/lib/clash-gap-types'
import type { Project } from '@/lib/types'
import { toast } from 'sonner'
import { AnalysisLoadingOverlay } from './analysis-loading-overlay'
import { DetectionResultsWorkspace } from './detection-results-workspace'
import { DetectionStepper } from './detection-stepper'
import { DetectionToolShell } from './detection-tool-shell'
import { SourceComparisonSheet } from './source-comparison-sheet'
import { UploadSetupStep } from './upload-setup-step'

const defaultSettings: DetectionSettings = {
  mode: 'both',
  scope: 'entire_project',
  sensitivity: 'medium',
  rfiFormat: 'detailed',
  selectedTrades: [],
}

const SUBJECT_MAX = 255
const DESC_MAX = 2000

function defaultDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

function formatSettingsSummary(s: DetectionSettings): string {
  const modeLabel =
    s.mode === 'both' ? 'Conflicts & Gaps' : s.mode === 'gaps' ? 'Gaps' : 'Conflicts'
  const sens = s.sensitivity.slice(0, 1).toUpperCase() + s.sensitivity.slice(1)
  return `${modeLabel} • ${sens} sensitivity`
}

function titleCaseWords(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ')
}

function rfiTitleFromIssue(issue: ClashGapIssue): string {
  const base = issue.title.replace(/\s*conflict\s*$/i, '').replace(/\s*gap\s*$/i, '').trim()
  return `${titleCaseWords(base)} Clarification`.replace(/\s+/g, ' ')
}

function defaultAssigneeForDiscipline(discipline: string): string {
  const d = discipline.toLowerCase()
  if (d.includes('structural')) return 'Structural Engineer'
  if (d.includes('architect')) return 'Architect'
  if (d.includes('mep')) return 'MEP Engineer'
  if (d.includes('civil')) return 'Civil Engineer'
  return 'General Contractor'
}

function uniqueUploadFilenames(rows: DocumentUploadRow[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of rows) {
    if (row.status === 'error') continue
    const name = row.filename.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out.slice(0, 16)
}

function buildRfiDraftFromIssue(
  issue: ClashGapIssue,
  settings: DetectionSettings,
  trades: string[],
  uploadRows: DocumentUploadRow[],
): RfiDraftState {
  const related = uniqueUploadFilenames(uploadRows).join('\n')
  const rawSubject = (issue.summary.split('.')[0] ?? issue.summary).trim()
  const subject = rawSubject.slice(0, SUBJECT_MAX)

  const actionLine = issue.suggestedAction
    ? `Suggested action: ${issue.suggestedAction}`
    : 'Please confirm the correct, coordinated requirement.'

  const shortBody = `Contract documents require coordination on: ${issue.title.toLowerCase()}. ${issue.summary} ${actionLine}`

  const detailedBody = [
    `Context: ${issue.summary}`,
    issue.suggestedAction ? `\nSuggested action: ${issue.suggestedAction}` : '',
    '',
    'Referenced locations:',
    ...issue.sources.map(
      (s, i) =>
        `${i + 1}. ${s.documentLabel} (page ${s.page}) — “${s.excerpt.slice(0, 120)}${s.excerpt.length > 120 ? '…' : ''}”`,
    ),
    '',
    actionLine,
  ].join('\n')

  const rawDescription = settings.rfiFormat === 'short' ? shortBody : detailedBody
  const description = rawDescription.slice(0, DESC_MAX)

  const drawingLike =
    issue.sheetReference ||
    issue.sources
      .map((s) => s.page)
      .filter((p): p is string => typeof p === 'string')
      .join(', ')

  const specLike = issue.sources
    .map((s) => s.documentLabel)
    .filter((l) => /spec|section|addendum/i.test(l))
    .slice(0, 4)
    .join('; ')

  const discipline =
    issue.discipline ??
    (trades.length > 0 ? trades[0]! : issue.type === 'conflict' ? 'Structural' : 'General')

  return {
    title: rfiTitleFromIssue(issue),
    subject,
    description,
    relatedDocuments: related,
    discipline,
    priority:
      issue.severity === 'high' && issue.type === 'conflict' ? 'urgent' : 'normal',
    dueDate: defaultDueDate(),
    assignee: defaultAssigneeForDiscipline(discipline),
    notes: [
      'Source excerpts summarized from Detection Tool.',
      drawingLike ? `Drawing / sheet refs: ${drawingLike}` : '',
      specLike ? `Spec / addendum refs: ${specLike}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

function buildPrefillExtras(issue: ClashGapIssue) {
  const drawingSheetNumbers =
    issue.sheetReference ||
    issue.sources
      .map((s) => s.page)
      .filter((p): p is string => typeof p === 'string')
      .join(', ')

  const detailReferences = issue.sources
    .map((s) => `${s.documentLabel} (p. ${s.page})`)
    .join('; ')

  return { drawingSheetNumbers, detailReferences }
}

function coReasonFromIssue(issue: ClashGapIssue): string {
  if (issue.type === 'missing') return 'Scope gap identified during document analysis'
  if (issue.type === 'mismatch') return 'Specification vs plan mismatch'
  return 'Coordination conflict between disciplines'
}

export function ClashGapDetectionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const rfiPanelRef = useRef<HTMLDivElement>(null)

  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [phase, setPhase] = useState<'prepare' | 'results'>('prepare')
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [rows, setRows] = useState<DocumentUploadRow[]>([])
  const [settings, setSettings] = useState<DetectionSettings>(defaultSettings)
  const [selectedTrades, setSelectedTrades] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [processingStep, setProcessingStep] = useState<ProcessingStep | null>(null)
  const [issues, setIssues] = useState<ClashGapIssue[]>([])
  const [bookmarkedIds, setBookmarkedIds] = useState(() => new Set<string>())
  const [disciplineFilter, setDisciplineFilter] = useState('all')
  const [filter, setFilter] = useState<IssueType | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [sheetIssue, setSheetIssue] = useState<ClashGapIssue | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [rfiDraft, setRfiDraft] = useState<RfiDraftState | null>(null)

  const setRfiDraftFromPanel = useCallback(
    (updater: RfiDraftState | ((prev: RfiDraftState) => RfiDraftState)) => {
      setRfiDraft((prev) => {
        if (prev === null) return null
        return typeof updater === 'function' ? updater(prev) : updater
      })
    },
    [],
  )

  const sessionRestored = useRef(false)

  const loadAnalysis = useCallback(async (id: string) => {
    const data = await apiFetch<ApiClashGapAnalysisDetail>(`/api/clash-gap/analyses/${id}`)
    setAnalysisId(id)
    setProjectId(data.analysis.project_id)
    setSettings({ ...defaultSettings, ...data.analysis.settings, selectedTrades: data.analysis.settings.selectedTrades ?? selectedTrades })
    setProcessingStep((data.analysis.processing_step as ProcessingStep) || null)

    const mapped = (data.issues ?? []).map(mapApiIssueToClashGapIssue)
    setIssues(mapped)

    if (data.analysis.status === 'completed' && mapped.length) {
      setPhase('results')
      setSelectedIssueId((prev) => prev || mapped[0]?.id || null)
    }

    if (data.files?.length) {
      setRows(
        data.files.map((f) => ({
          id: f.id,
          serverFileId: f.id,
          filename: f.file_name,
          type: f.file_role === 'specs' ? 'specs' : f.file_role === 'addenda' ? 'addenda' : 'plans',
          pages: f.page_count ?? '—',
          status: 'ready' as const,
        })),
      )
    }
    return data
  }, [selectedTrades])

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiFetch<{
          projects: Array<{
            id: string
            name: string
            address: string | null
            job_number?: string | null
            created_at: string
            updated_at: string
          }>
        }>('/api/projects')
        const mapped = data.projects.map((p) => ({
          id: p.id,
          name: p.name,
          description: '',
          companyId: '',
          status: 'active' as const,
          address: p.address ?? undefined,
          startDate: p.created_at,
          documentsCount: 0,
          teamMembers: [],
          createdAt: p.created_at,
          updatedAt: p.updated_at,
          jobNumber: p.job_number ?? undefined,
        }))
        setProjects(mapped)
        setProjectId((prev) => prev || mapped[0]?.id || '')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load projects')
      }
    }
    void load()
  }, [])

  useEffect(() => {
    const analysisParam = searchParams.get('analysis')

    // One-time session restore when landing without ?analysis= (merged here so hook
    // dependency array length stays stable — a separate effect caused React 19 errors
    // when its deps changed from [] to [searchParams, router] during hot reload).
    if (!sessionRestored.current) {
      sessionRestored.current = true
      if (!analysisParam && typeof window !== 'undefined') {
        try {
          const rawLocal = localStorage.getItem(CLASH_GAP_SESSION_STORAGE_KEY)
          if (rawLocal) {
            const s = JSON.parse(rawLocal) as ClashGapSessionV1
            if (s.version === 1) {
              if (s.analysisId) {
                router.replace(`/clash-gap-detection?analysis=${s.analysisId}`)
                return
              }
              if (s.projectId) setProjectId(s.projectId)
              setSettings(s.settings ?? defaultSettings)
              setRows(
                (s.rows ?? []).map((r) => ({
                  ...r,
                  file: undefined,
                })) as DocumentUploadRow[],
              )
              setSelectedIssueId(s.selectedIssueId ?? null)
              setPhase(s.phase === 'results' ? 'results' : 'prepare')
            }
          }
        } catch {
          /* ignore corrupt session */
        }
      }
    }

    if (analysisParam && analysisParam !== analysisId) {
      void (async () => {
        try {
          let data = await loadAnalysis(analysisParam)
          while (data.analysis.status === 'processing' || data.analysis.status === 'queued') {
            setIsRunning(true)
            await new Promise((r) => setTimeout(r, 2500))
            data = await loadAnalysis(analysisParam)
          }
          if (data.analysis.status === 'failed') {
            toast.error(data.analysis.error_message || 'Analysis failed')
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Failed to load analysis')
        } finally {
          setIsRunning(false)
        }
      })()
    }
  }, [searchParams, projectId, analysisId, router, loadAnalysis, settings, selectedTrades])

  const linkedIssue = useMemo(
    () => issues.find((i) => i.id === selectedIssueId) ?? null,
    [issues, selectedIssueId],
  )

  useEffect(() => {
    if (!linkedIssue) {
      setRfiDraft(null)
      return
    }
    const key =
      projectId.length > 0 ? `buildswift:clashGapRfiDraft:${projectId}:${linkedIssue.id}` : null
    let draft = buildRfiDraftFromIssue(linkedIssue, settings, selectedTrades, rows)
    if (key && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(key)
        if (raw) {
          const parsed = JSON.parse(raw) as RfiDraftState
          if (parsed && typeof parsed === 'object' && typeof parsed.description === 'string') {
            draft = {
              ...draft,
              ...parsed,
              relatedDocuments: uniqueUploadFilenames(rows).join('\n'),
            }
          }
        }
      } catch {
        /* keep generated draft */
      }
    }
    setRfiDraft(draft)
  }, [linkedIssue?.id, projectId, settings, selectedTrades, rows])

  const patchIssueStatus = useCallback(
    async (issueId: string, status: 'dismissed' | 'reviewed' | 'resolved', resolvedDocumentId?: string) => {
      await apiFetch(`/api/clash-gap/issues/${issueId}`, {
        method: 'PATCH',
        json: {
          status,
          ...(resolvedDocumentId ? { resolved_document_id: resolvedDocumentId } : {}),
        },
      })
      setIssues((prev) =>
        prev.map((i) =>
          i.id === issueId ? { ...i, status, resolvedDocumentId: resolvedDocumentId ?? i.resolvedDocumentId } : i,
        ),
      )
    },
    [],
  )

  const uploadRowFile = useCallback(
    async (row: DocumentUploadRow, targetAnalysisId: string): Promise<DocumentUploadRow> => {
      if (!row.file) return row
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, status: 'pending' as const } : r)),
      )
      const fd = new FormData()
      fd.append('file', row.file)
      fd.append('file_role', fileRoleFromDocType(row.type))
      const res = await apiUpload<{ file: { id: string; page_count: number | null } }>(
        `/api/clash-gap/analyses/${targetAnalysisId}/files`,
        fd,
      )
      const updated: DocumentUploadRow = {
        ...row,
        serverFileId: res.file.id,
        status: 'ready',
        pages: res.file.page_count ?? row.pages,
        file: undefined,
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
      return updated
    },
    [],
  )

  const ensureAnalysis = useCallback(async (): Promise<string> => {
    if (analysisId) return analysisId
    if (!projectId) throw new Error('Select a project')
    const res = await apiFetch<{ analysis: { id: string } }>('/api/clash-gap/analyses', {
      method: 'POST',
      json: {
        project_id: projectId,
        settings: { ...settings, selectedTrades },
      },
    })
    setAnalysisId(res.analysis.id)
    router.replace(`/clash-gap-detection?analysis=${res.analysis.id}`)
    return res.analysis.id
  }, [analysisId, projectId, settings, selectedTrades, router])

  const syncFileRoleToServer = useCallback(
    async (analysisId: string, row: DocumentUploadRow) => {
      if (!row.serverFileId) return
      await apiFetch(`/api/clash-gap/analyses/${analysisId}/files/${row.serverFileId}`, {
        method: 'PATCH',
        json: { file_role: fileRoleFromDocType(row.type) },
      })
    },
    [],
  )

  const runDetection = useCallback(async () => {
    if (!projectId) return toast.error('Select a project')
    if (!rows.length) return toast.error('Add at least one document')

    let rowsForRun = rows
    if (!canRunClashGapDetection(rowsForRun)) {
      rowsForRun = reconcileDocumentTypes(rowsForRun)
      if (!canRunClashGapDetection(rowsForRun)) {
        const msg = missingDocumentRolesMessage(rowsForRun)
        return toast.error(msg ?? 'Upload plans and specifications documents')
      }
      setRows(rowsForRun)
    }

    setIsRunning(true)
    try {
      const id = await ensureAnalysis()

      await apiFetch(`/api/clash-gap/analyses/${id}`, {
        method: 'PATCH',
        json: { settings: { ...settings, selectedTrades } },
      })

      const notOnServer = rowsForRun.filter((r) => !r.serverFileId)
      const missingBlob = notOnServer.filter((r) => !r.file)
      if (missingBlob.length) {
        throw new Error(
          'Some files are only in this browser session and were not saved to the server. Re-add the PDFs or open the analysis from your saved link (?analysis=…).',
        )
      }

      const updatedById = new Map(rowsForRun.map((r) => [r.id, r]))
      for (const row of notOnServer) {
        if (!row.file) continue
        try {
          const updated = await uploadRowFile(row, id)
          updatedById.set(row.id, updated)
        } catch (e) {
          setRows((prev) =>
            prev.map((r) => (r.id === row.id ? { ...r, status: 'error' as const } : r)),
          )
          throw e
        }
      }

      const rowsForSync = rowsForRun.map((r) => updatedById.get(r.id) ?? r)
      for (const row of rowsForSync) {
        if (row.serverFileId) {
          await syncFileRoleToServer(id, row)
        }
      }

      if (!rowsForSync.some((r) => r.serverFileId)) {
        throw new Error('No files were uploaded to the server. Add PDF plans and specifications and try again.')
      }

      const runRes = await apiFetch<{ status: string }>(`/api/clash-gap/analyses/${id}/run`, {
        method: 'POST',
      })
      if (runRes.status === 'completed') {
        const data = await apiFetch<ApiClashGapAnalysisDetail>(`/api/clash-gap/analyses/${id}`)
        const mapped = (data.issues ?? []).map(mapApiIssueToClashGapIssue)
        setIssues(mapped)
        setBookmarkedIds(new Set())
        setDisciplineFilter('all')
        setFilter('all')
        setSearch('')
        setSelectedIssueId(mapped[0]?.id ?? null)
        setPhase('results')
        toast.success(`Detection finished — ${mapped.length} issues found.`)
        return
      }

      const poll = async (): Promise<void> => {
        const data = await apiFetch<ApiClashGapAnalysisDetail>(`/api/clash-gap/analyses/${id}`)
        setProcessingStep((data.analysis.processing_step as ProcessingStep) || null)
        if (data.analysis.status === 'processing' || data.analysis.status === 'queued') {
          await new Promise((r) => setTimeout(r, 2500))
          return poll()
        }
        if (data.analysis.status === 'failed') {
          throw new Error(data.analysis.error_message || 'Analysis failed')
        }
        const mapped = (data.issues ?? []).map(mapApiIssueToClashGapIssue)
        setIssues(mapped)
        setBookmarkedIds(new Set())
        setDisciplineFilter('all')
        setFilter('all')
        setSearch('')
        setSelectedIssueId(mapped[0]?.id ?? null)
        setPhase('results')
        toast.success(`Detection finished — ${mapped.length} issues found.`)
      }

      await poll()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Detection failed')
    } finally {
      setIsRunning(false)
      setProcessingStep(null)
    }
  }, [projectId, rows, settings, selectedTrades, ensureAnalysis, uploadRowFile, syncFileRoleToServer])

  const generateReport = useCallback(async () => {
    if (!analysisId) return toast.error('No analysis to report')
    setIsGeneratingReport(true)
    try {
      const blob = await apiDownloadBlob(`/api/clash-gap/analyses/${analysisId}/report`, {
        method: 'POST',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `clash-gap-report-${analysisId.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Report downloaded')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Report failed')
    } finally {
      setIsGeneratingReport(false)
    }
  }, [analysisId])

  const openSources = useCallback((issue: ClashGapIssue) => {
    setSheetIssue(issue)
    setSheetOpen(true)
  }, [])

  const toggleBookmark = useCallback((id: string) => {
    setBookmarkedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const saveSession = useCallback(() => {
    const payload: ClashGapSessionV1 = {
      version: 1,
      analysisId: analysisId ?? null,
      projectId,
      settings,
      rows: rows.map(({ file: _file, ...rest }) => ({ ...rest })),
      issues: [],
      ignoredIds: [],
      bookmarkedIds: [...bookmarkedIds],
      selectedIssueId,
      phase,
    }
    try {
      localStorage.setItem(CLASH_GAP_SESSION_STORAGE_KEY, JSON.stringify(payload))
      toast.success('Session saved.')
    } catch {
      toast.error('Could not save session.')
    }
  }, [analysisId, projectId, settings, rows, bookmarkedIds, selectedIssueId, phase])

  const clearDraft = useCallback(() => {
    if (!linkedIssue) return
    setRfiDraft(buildRfiDraftFromIssue(linkedIssue, settings, selectedTrades, rows))
    toast.message('Draft reset from current issue.')
  }, [linkedIssue, settings, selectedTrades, rows])

  const saveDraftLocal = useCallback(() => {
    if (!rfiDraft || !linkedIssue || !projectId) return
    try {
      const key = `buildswift:clashGapRfiDraft:${projectId}:${linkedIssue.id}`
      localStorage.setItem(key, JSON.stringify(rfiDraft))
      toast.success('Draft saved in this browser for this issue.')
    } catch {
      toast.error('Could not save draft locally.')
    }
  }, [rfiDraft, linkedIssue, projectId])

  const createRfiNavigate = useCallback(() => {
    if (!rfiDraft || !linkedIssue || !projectId) return
    const { drawingSheetNumbers, detailReferences } = buildPrefillExtras(linkedIssue)
    const desc =
      rfiDraft.subject.trim().length > 0
        ? `${rfiDraft.subject.trim()}\n\n${rfiDraft.description.trim()}`.trim()
        : rfiDraft.description.trim()

    const payload: ClashGapRfiPrefillPayload = {
      projectId,
      title: rfiDraft.title.trim(),
      description: desc,
      dueDate: rfiDraft.dueDate || undefined,
      priority: rfiDraft.priority,
      drawingSheetNumbers: drawingSheetNumbers || undefined,
      detailReferences: detailReferences || undefined,
      notes:
        `${rfiDraft.relatedDocuments.trim()}\n\n${rfiDraft.notes.trim()}`.trim() || undefined,
      sourceAnalysisId: analysisId || undefined,
      sourceIssueId: linkedIssue.id,
      suggestedAction: linkedIssue.suggestedAction,
    }

    try {
      sessionStorage.setItem(CLASH_GAP_RFI_PREFILL_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      toast.error('Could not prepare RFI draft for handoff.')
      return
    }
    router.push(`/documents/new?type=rfi&project=${encodeURIComponent(projectId)}`)
  }, [rfiDraft, linkedIssue, projectId, router, analysisId])

  const createCoNavigate = useCallback(() => {
    if (!linkedIssue || !projectId) return
    const payload: ClashGapCoPrefillPayload = {
      projectId,
      title: `${titleCaseWords(linkedIssue.title)} — Change Order`,
      description: linkedIssue.summary,
      reason: coReasonFromIssue(linkedIssue),
      costPlaceholder: 'TBD — quantify cost impact during review',
      sourceAnalysisId: analysisId || undefined,
      sourceIssueId: linkedIssue.id,
      notes: linkedIssue.suggestedAction,
    }
    try {
      sessionStorage.setItem(CLASH_GAP_CO_PREFILL_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      toast.error('Could not prepare Change Order draft.')
      return
    }
    router.push(`/change-orders/new?project=${encodeURIComponent(projectId)}`)
  }, [linkedIssue, projectId, router, analysisId])

  const scrollToRfi = useCallback(() => {
    rfiPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])

  const visibleIssues = useMemo(
    () => issues.filter((i) => i.status !== 'dismissed'),
    [issues],
  )

  const uploadFilenames = useMemo(() => uniqueUploadFilenames(rows), [rows])

  const sensitivityLabel = `${settings.sensitivity.slice(0, 1).toUpperCase()}${settings.sensitivity.slice(1)} sensitivity`
  const stepper = (
    <DetectionStepper
      phase={phase}
      uploadComplete={rows.length > 0}
      uploadLabel={`${rows.length} file${rows.length === 1 ? '' : 's'} uploaded`}
      settingsLabel={sensitivityLabel}
      resultsLabel={
        phase === 'results'
          ? `${visibleIssues.length} issues found`
          : processingStep
            ? `Processing: ${processingStep}`
            : 'Not started'
      }
    />
  )

  const handleCreateProject = useCallback(
    async (input: { name: string; address?: string; jobNumber?: string }) => {
      const res = await apiFetch<{ project: { id: string; name: string; job_number?: string | null } }>(
        '/api/projects',
        {
          method: 'POST',
          json: {
            name: input.name,
            address: input.address || null,
            job_number: input.jobNumber || null,
          },
        },
      )
      const p = res.project
      setProjects((prev) => [
        {
          id: p.id,
          name: p.name,
          description: '',
          companyId: '',
          status: 'active',
          jobNumber: p.job_number ?? input.jobNumber,
          startDate: new Date().toISOString(),
          documentsCount: 0,
          teamMembers: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...prev,
      ])
      setProjectId(p.id)
      if (analysisId) {
        await apiFetch(`/api/clash-gap/analyses/${analysisId}`, {
          method: 'PATCH',
          json: { project_id: p.id },
        })
      }
      toast.success('Project created')
    },
    [analysisId],
  )

  return (
    <>
      <DetectionToolShell
        stepper={stepper}
        onSaveSession={saveSession}
        onRunDetection={() => void runDetection()}
        canRunDetection={Boolean(projectId) && canRunClashGapDetection(rows) && !isRunning}
        isRunning={isRunning}
        showRunDetection={phase === 'prepare'}
        showGenerateReport={phase === 'results'}
        onGenerateReport={() => void generateReport()}
        isGeneratingReport={isGeneratingReport}
      >
        {phase === 'prepare' ? (
          <UploadSetupStep
            projects={projects}
            projectId={projectId}
            onProjectIdChange={setProjectId}
            rows={rows}
            onRowsChange={setRows}
            fileInputRef={fileInputRef}
            analysisId={analysisId}
            onUploadRow={async (row) => {
              try {
                const id = await ensureAnalysis()
                setAnalysisId(id)
                setRows((prev) =>
                  prev.map((r) => (r.id === row.id ? { ...r, status: 'pending' } : r)),
                )
                const fd = new FormData()
                if (!row.file) return
                fd.append('file', row.file)
                fd.append('file_role', fileRoleFromDocType(row.type))
                const res = await apiUpload<{ file: { id: string; page_count: number | null } }>(
                  `/api/clash-gap/analyses/${id}/files`,
                  fd,
                )
                setRows((prev) =>
                  prev.map((r) =>
                    r.id === row.id
                      ? {
                          ...r,
                          serverFileId: res.file.id,
                          status: 'ready',
                          pages: res.file.page_count ?? r.pages,
                          file: undefined,
                        }
                      : r,
                  ),
                )
              } catch (e) {
                setRows((prev) =>
                  prev.map((r) => (r.id === row.id ? { ...r, status: 'error' } : r)),
                )
                toast.error(e instanceof Error ? e.message : 'Upload failed')
              }
            }}
            onCreateProject={handleCreateProject}
            onRowTypeChange={async (row) => {
              if (!analysisId || !row.serverFileId) return
              try {
                await syncFileRoleToServer(analysisId, row)
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Could not update document type')
              }
            }}
          />
        ) : (
          <DetectionResultsWorkspace
            issues={visibleIssues}
            onDismiss={(id) => {
              void patchIssueStatus(id, 'dismissed').then(() => {
                setSelectedIssueId((sel) => {
                  if (sel !== id) return sel
                  const visible = visibleIssues.filter((i) => i.id !== id)
                  return visible[0]?.id ?? null
                })
                toast.message('Issue dismissed')
              })
            }}
            onMarkReviewed={(id) => {
              void patchIssueStatus(id, 'reviewed').then(() => toast.success('Marked as reviewed'))
            }}
            filter={filter}
            onFilterChange={setFilter}
            disciplineFilter={disciplineFilter}
            onDisciplineFilterChange={setDisciplineFilter}
            search={search}
            onSearchChange={setSearch}
            selectedIssueId={selectedIssueId}
            onSelectIssue={setSelectedIssueId}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={toggleBookmark}
            onOpenSources={openSources}
            onFocusRfi={scrollToRfi}
            draft={rfiDraft}
            setDraft={setRfiDraftFromPanel}
            uploadFilenames={uploadFilenames}
            linkedIssue={linkedIssue}
            onClearDraft={clearDraft}
            onSaveDraftLocal={saveDraftLocal}
            onCreateRfi={createRfiNavigate}
            onCreateChangeOrder={createCoNavigate}
            rfiPanelRef={rfiPanelRef}
            onBackToPrepare={() => {
              setPhase('prepare')
              setSheetOpen(false)
              setSheetIssue(null)
            }}
          />
        )}
      </DetectionToolShell>

      <SourceComparisonSheet open={sheetOpen} onOpenChange={setSheetOpen} issue={sheetIssue} />

      <AnalysisLoadingOverlay open={isRunning} step={processingStep} />
    </>
  )
}
