'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { downloadAndSaveBlob, uploadClashGapFile, countPdfPagesClientSide } from '@/lib/api-upload'
import {
  clientChunkMaxPages,
  clientChunkSkipDetail,
  shouldClientRasterize,
} from '@/lib/clash-gap-chunk-policy'
import { rasterizePdfPages } from '@/lib/clash-gap-rasterize'
import {
  mapApiIssueToClashGapIssue,
  type ApiClashGapAnalysisDetail,
  type ClashGapSessionMeta,
} from '@/lib/clash-gap-api'

import { Download, Play } from 'lucide-react'
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
  hasPlansDocument,
  hasSpecsDocument,
  missingDocumentRolesMessage,
  reconcileDocumentTypes,
  sanitizeClashGapDocumentType,
  uploadsStillPending,
} from '@/lib/clash-gap-document-inference'
import { displayPageCount, mapApiFilesToUploadRows } from '@/lib/clash-gap-file-rows'
import {
  CLASH_GAP_STAGES,
  allStagesComplete,
  anyStageRunning,
  isStageComplete,
  parseStages,
  stageGateMet,
  stageStatus,
  type ClashGapStage,
  type StagesMap,
} from '@/lib/clash-gap-stages'
import type {
  ClashGapIssue,
  DetectionSettings,
  DetectionWizardStep,
  DocumentLabelType,
  DocumentUploadRow,
  IssueType,
  RfiDraftState,
} from '@/lib/clash-gap-types'
import type { Project } from '@/lib/types'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DetectionResultsWorkspace } from './detection-results-workspace'
import { DetectionResultViewer } from './detection-result-viewer'
import { DetectionSettingsStep } from './detection-settings-step'
import { DetectionStepper, type StepDisplayStatus, type StepperItem } from './detection-stepper'
import { DetectionToolShell } from './detection-tool-shell'
import { SessionLoadingOverlay } from './session-loading-overlay'
import { SourceComparisonSheet } from './source-comparison-sheet'
import { StagePanel } from './stage-panel'
import { UploadSetupStep } from './upload-setup-step'

const CLASH_GAP_SESSION_PATH = '/clash-gap-detection/session'

const defaultSettings: DetectionSettings = {
  mode: 'both',
  scope: 'entire_project',
  sensitivity: 'medium',
  rfiFormat: 'detailed',
  selectedTrades: [],
}

const SUBJECT_MAX = 255
const DESC_MAX = 2000

const STEP_TO_STAGE: Record<Exclude<DetectionWizardStep, 'upload' | 'result'>, ClashGapStage> = {
  chunk: 'chunk',
  ocr: 'ocr',
  detection: 'detect',
}

const STAGE_RUN_LABEL: Record<ClashGapStage, string> = {
  chunk: 'chunking',
  ocr: 'OCR',
  detect: 'detection',
}

function defaultDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
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
    priority: issue.severity === 'high' && issue.type === 'conflict' ? 'urgent' : 'normal',
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

function firstIncompleteStep(stages: StagesMap, hasFiles: boolean): DetectionWizardStep {
  if (!hasFiles) return 'upload'
  for (const stage of CLASH_GAP_STAGES) {
    if (!isStageComplete(stages, stage)) {
      return stage === 'detect' ? 'detection' : (stage as DetectionWizardStep)
    }
  }
  return 'result'
}

export function ClashGapDetectionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const rfiPanelRef = useRef<HTMLDivElement>(null)

  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<DetectionWizardStep>('upload')
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [rows, setRows] = useState<DocumentUploadRow[]>([])
  const [settings, setSettings] = useState<DetectionSettings>(defaultSettings)
  const [selectedTrades, setSelectedTrades] = useState<string[]>([])
  const [stages, setStages] = useState<StagesMap>({})
  const [runningStage, setRunningStage] = useState<ClashGapStage | null>(null)
  const [clientUploadLabel, setClientUploadLabel] = useState<string | null>(null)
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null)
  const [newSessionConfirmOpen, setNewSessionConfirmOpen] = useState(false)
  const [deleteSavedConfirmOpen, setDeleteSavedConfirmOpen] = useState(false)
  const [isStartingNewSession, setIsStartingNewSession] = useState(false)
  const [isDeletingSavedSession, setIsDeletingSavedSession] = useState(false)
  const [isSavingAndDone, setIsSavingAndDone] = useState(false)
  const [isSavedSession, setIsSavedSession] = useState(false)
  const [isLoadingSession, setIsLoadingSession] = useState(false)
  const [issues, setIssues] = useState<ClashGapIssue[]>([])
  const [bookmarkedIds, setBookmarkedIds] = useState(() => new Set<string>())
  const [disciplineFilter, setDisciplineFilter] = useState('all')
  const [filter, setFilter] = useState<IssueType | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [sheetIssue, setSheetIssue] = useState<ClashGapIssue | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [rfiDraft, setRfiDraft] = useState<RfiDraftState | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)

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
  const analysisIdRef = useRef<string | null>(analysisId)
  const creatingAnalysisRef = useRef<Promise<string> | null>(null)
  const pollingRef = useRef(false)
  const savedAnalysisRef = useRef(false)
  const fileBlobsRef = useRef<Map<string, File>>(new Map())

  useEffect(() => {
    analysisIdRef.current = analysisId
  }, [analysisId])

  const applyAnalysis = useCallback((data: ApiClashGapAnalysisDetail) => {
    const nextStages = parseStages(data.analysis.stages)
    setStages(nextStages)
    const mapped = (data.issues ?? []).map(mapApiIssueToClashGapIssue)
    setIssues(mapped)
    if (data.files?.length) setRows(mapApiFilesToUploadRows(data.files))
    return nextStages
  }, [])

  const loadAnalysis = useCallback(
    async (id: string) => {
      const data = await apiFetch<ApiClashGapAnalysisDetail>(`/api/clash-gap/analyses/${id}`)
      setAnalysisId(id)
      savedAnalysisRef.current = Boolean(data.analysis.saved_at)
      setIsSavedSession(Boolean(data.analysis.saved_at))
      setProjectId(data.analysis.project_id)
      setSettings({
        ...defaultSettings,
        ...data.analysis.settings,
        selectedTrades: data.analysis.settings.selectedTrades ?? selectedTrades,
      })
      applyAnalysis(data)
      return data
    },
    [applyAnalysis, selectedTrades],
  )

  const pollStage = useCallback(
    async (id: string, stage: ClashGapStage) => {
      pollingRef.current = true
      const started = Date.now()
      const maxMs = 6 * 60 * 60 * 1000
      const stallMs = 165 * 1000
      const maxResumes = 80
      let resumes = 0
      let lastProgress = -1
      let lastProgressAt = Date.now()
      try {
        for (;;) {
          const data = await apiFetch<ApiClashGapAnalysisDetail>(`/api/clash-gap/analyses/${id}`)
          const nextStages = applyAnalysis(data)
          const status = stageStatus(nextStages, stage)
          if (status === 'completed') return
          if (status === 'failed') {
            throw new Error(nextStages[stage]?.error || `${STAGE_RUN_LABEL[stage]} failed`)
          }
          const progress = nextStages[stage]?.processed ?? 0
          if (progress > lastProgress) {
            lastProgress = progress
            lastProgressAt = Date.now()
          } else if (Date.now() - lastProgressAt > stallMs) {
            if (resumes >= maxResumes || Date.now() - started > maxMs) {
              throw new Error('Processing stalled. Click Run again to resume from where it left off.')
            }
            resumes++
            try {
              await apiFetch(`/api/clash-gap/analyses/${id}/stages/${stage}/run`, { method: 'POST' })
            } catch {
            }
            lastProgressAt = Date.now()
          }
          await new Promise((r) => setTimeout(r, 2500))
        }
      } finally {
        pollingRef.current = false
      }
    },
    [applyAnalysis],
  )

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
    const isNewSession = searchParams.get('new') === '1'
    const isReload =
      typeof performance !== 'undefined' &&
      (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)
        ?.type === 'reload'

    if (!sessionRestored.current) {
      sessionRestored.current = true
      if (isNewSession) {
        try {
          localStorage.removeItem(CLASH_GAP_SESSION_STORAGE_KEY)
        } catch {
        }
        return
      }

      if (isReload) {
        let local: ClashGapSessionV1 | null = null
        try {
          const raw = localStorage.getItem(CLASH_GAP_SESSION_STORAGE_KEY)
          if (raw) {
            const parsed = JSON.parse(raw) as ClashGapSessionV1
            if (parsed.version === 1) local = parsed
          }
        } catch {
        }
        const inProgressDraft =
          !!local &&
          local.phase !== 'results' &&
          stageStatus(local.stages ?? {}, 'chunk') !== 'completed' &&
          ((local.rows?.length ?? 0) > 0 || !!local.analysisId)
        if (inProgressDraft) {
          if (local.analysisId) {
            router.replace(`${CLASH_GAP_SESSION_PATH}?analysis=${local.analysisId}`)
            return
          }
          try {
            localStorage.removeItem(CLASH_GAP_SESSION_STORAGE_KEY)
          } catch {
          }
          toast.error(
            'Your uploaded files were cleared because the page was refreshed. Please re-upload to continue.',
          )
          router.replace(`${CLASH_GAP_SESSION_PATH}?new=1`)
          return
        }
      }

      if (!analysisParam && typeof window !== 'undefined') {
        try {
          const rawLocal = localStorage.getItem(CLASH_GAP_SESSION_STORAGE_KEY)
          if (rawLocal) {
            const s = JSON.parse(rawLocal) as ClashGapSessionV1
            if (s.version === 1) {
              if (s.analysisId) {
                router.replace(`${CLASH_GAP_SESSION_PATH}?analysis=${s.analysisId}`)
                return
              }
              if (s.projectId) setProjectId(s.projectId)
              setSettings(s.settings ?? defaultSettings)
              setRows(
                (s.rows ?? []).map((r) => ({
                  ...r,
                  file: undefined,
                  type: sanitizeClashGapDocumentType(r.type),
                })) as DocumentUploadRow[],
              )
              if (s.issues?.length) setIssues(s.issues)
              if (s.bookmarkedIds?.length) setBookmarkedIds(new Set(s.bookmarkedIds))
              if (s.selectedIssueId) setSelectedIssueId(s.selectedIssueId)
              if (s.activeStep) setActiveStep(s.activeStep)
              if (s.stages) setStages(s.stages)
            }
          }
        } catch {
        }
      }
    }

    if (isNewSession || !analysisParam || analysisParam === analysisId) return

    setIsLoadingSession(true)
    void (async () => {
      try {
        const data = await loadAnalysis(analysisParam)
        const loaded = parseStages(data.analysis.stages)
        if (
          isReload &&
          !data.analysis.saved_at &&
          stageStatus(loaded, 'chunk') !== 'completed' &&
          !(data.files?.length ?? 0)
        ) {
          try {
            localStorage.removeItem(CLASH_GAP_SESSION_STORAGE_KEY)
          } catch {
          }
          setAnalysisId(null)
          setRows([])
          setStages({})
          setIssues([])
          setActiveStep('upload')
          toast.error(
            'Your uploaded files were cleared because the page was refreshed. Please re-upload to continue.',
          )
          router.replace(`${CLASH_GAP_SESSION_PATH}?new=1`)
          return
        }

        const meta = (data.analysis.session_meta ?? {}) as ClashGapSessionMeta
        if (meta.bookmarkedIds?.length) setBookmarkedIds(new Set(meta.bookmarkedIds))
        if (meta.selectedIssueId) setSelectedIssueId(meta.selectedIssueId)
        if (data.analysis.saved_at) {
          setActiveStep('result')
        } else {
          setActiveStep(firstIncompleteStep(loaded, Boolean(data.files?.length)))
        }
        const running = CLASH_GAP_STAGES.find((s) => stageStatus(loaded, s) === 'running')
        if (running && !pollingRef.current) {
          setRunningStage(running)
          try {
            await pollStage(analysisParam, running)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Stage failed')
          } finally {
            setRunningStage(null)
          }
        }
      } catch (e) {
        const status = typeof (e as { status?: number })?.status === 'number' ? (e as { status?: number }).status : null
        if (status === 404) {
          toast.error('This analysis link is no longer available. Starting a new draft.')
          setAnalysisId(null)
          setStages({})
          setIssues([])
          setRows([])
          setActiveStep('upload')
          try {
            localStorage.removeItem(CLASH_GAP_SESSION_STORAGE_KEY)
          } catch {
          }
          router.replace(`${CLASH_GAP_SESSION_PATH}?new=1`)
          return
        }
        toast.error(e instanceof Error ? e.message : 'Failed to load analysis')
      } finally {
        setIsLoadingSession(false)
      }
    })()
  }, [searchParams])

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
      }
    }
    setRfiDraft(draft)
  }, [linkedIssue?.id, projectId, settings, selectedTrades, rows])

  const patchIssueStatus = useCallback(
    async (issueId: string, status: 'dismissed' | 'reviewed' | 'resolved', resolvedDocumentId?: string) => {
      await apiFetch(`/api/clash-gap/issues/${issueId}`, {
        method: 'PATCH',
        json: { status, ...(resolvedDocumentId ? { resolved_document_id: resolvedDocumentId } : {}) },
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
      if (!row.file) {
        if (row.serverFileId) return row
        throw new Error('File is no longer available in this browser session. Remove and re-add it.')
      }
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, status: 'pending' as const, progress: undefined } : r)),
      )
      try {
        const uploaded = await uploadClashGapFile({
          analysisId: targetAnalysisId,
          file: row.file,
          fileRole: fileRoleFromDocType(row.type),
          onProgress: (fraction) =>
            setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, progress: fraction } : r))),
          onPageCount: (count) =>
            setRows((prev) =>
              prev.map((r) => (r.id === row.id ? { ...r, pages: displayPageCount(count) } : r)),
            ),
        })
        fileBlobsRef.current.set(uploaded.id, row.file)
        const updated: DocumentUploadRow = {
          ...row,
          serverFileId: uploaded.id,
          status: 'ready',
          pages: displayPageCount(uploaded.page_count),
          progress: undefined,
          file: undefined,
        }
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? { ...updated, pages: uploaded.page_count != null ? updated.pages : r.pages }
              : r,
          ),
        )
        return updated
      } catch (e) {
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, status: 'error' as const, progress: undefined } : r)),
        )
        throw e
      }
    },
    [],
  )

  const ensureAnalysis = useCallback(async (): Promise<string> => {
    const existing = analysisIdRef.current
    if (existing) return existing
    if (!projectId) throw new Error('Select a project before uploading files')

    if (!creatingAnalysisRef.current) {
      creatingAnalysisRef.current = (async () => {
        const res = await apiFetch<{ analysis: { id: string } }>('/api/clash-gap/analyses', {
          method: 'POST',
          json: { project_id: projectId, settings: { ...settings, selectedTrades } },
        })
        const id = res.analysis.id
        analysisIdRef.current = id
        setAnalysisId(id)
        router.replace(`${CLASH_GAP_SESSION_PATH}?analysis=${id}`)
        return id
      })().finally(() => {
        creatingAnalysisRef.current = null
      })
    }

    return creatingAnalysisRef.current
  }, [projectId, settings, selectedTrades, router])

  const syncFileRoleToServer = useCallback(async (id: string, row: DocumentUploadRow) => {
    if (!row.serverFileId) return
    await apiFetch(`/api/clash-gap/analyses/${id}/files/${row.serverFileId}`, {
      method: 'PATCH',
      json: { file_role: fileRoleFromDocType(row.type) },
    })
  }, [])

  const ensureUploadsReady = useCallback(
    async (id: string) => {
      let working = reconcileDocumentTypes(rows)
      setRows(working)

      const updatedById = new Map(working.map((r) => [r.id, r]))
      const toUpload = working.filter((r) => !r.serverFileId && r.file)
      const missingBlob = working.filter((r) => !r.serverFileId && !r.file)
      if (missingBlob.length) {
        throw new Error(
          'Some files are only in this browser session. Re-add them or open the analysis from your saved link.',
        )
      }
      for (let u = 0; u < toUpload.length; u++) {
        const row = toUpload[u]!
        setClientUploadLabel(
          toUpload.length > 1
            ? `Uploading ${row.filename} (${u + 1}/${toUpload.length})…`
            : `Uploading ${row.filename}…`,
        )
        try {
          updatedById.set(row.id, await uploadRowFile(row, id))
        } catch (e) {
          setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: 'error' as const } : r)))
          throw e
        }
      }
      setClientUploadLabel(null)
      const synced = working.map((r) => updatedById.get(r.id) ?? r)
      setRows(synced)
      working = reconcileDocumentTypes(synced)
      for (const row of working) {
        if (row.serverFileId) await syncFileRoleToServer(id, row)
      }
      if (!working.some((r) => r.serverFileId)) {
        throw new Error('No files were uploaded to the server. Add documents and try again.')
      }
    },
    [rows, uploadRowFile, syncFileRoleToServer],
  )

  const hasUploadsReady = useMemo(
    () => hasPlansDocument(rows) && hasSpecsDocument(rows),
    [rows],
  )
  const uploadDocsHint = useMemo(() => {
    if (hasUploadsReady) return null
    const missing: string[] = []
    if (!hasPlansDocument(rows)) missing.push('Plans')
    if (!hasSpecsDocument(rows)) missing.push('Specifications')
    return `Upload and set the Document type for both Plans and Specifications — ${missing.join(' and ')} still missing.`
  }, [hasUploadsReady, rows])

  const stageOf = useCallback((step: DetectionWizardStep): ClashGapStage | null => {
    return step === 'upload' || step === 'result' ? null : STEP_TO_STAGE[step]
  }, [])

  const rasterizeChunkPages = useCallback(async (id: string) => {
    setStages((prev) => ({
      ...prev,
      chunk: {
        ...(prev.chunk ?? { status: 'running' }),
        status: 'running',
        processed: 0,
        total: 0,
        detail: 'Identifying pages…',
      },
    }))
    const detail = await apiFetch<ApiClashGapAnalysisDetail>(`/api/clash-gap/analyses/${id}`)
    const pdfFiles = (detail.files ?? []).filter(
      (f) => /\.pdf$/i.test(f.file_name) || (f.mime_type ?? '').toLowerCase().includes('pdf'),
    )

    const grandTotal = pdfFiles.reduce((sum, f) => sum + (f.page_count ?? 0), 0)
    let baseProcessed = 0
    const serverOnly: string[] = []

    for (const f of pdfFiles) {
      const blob = fileBlobsRef.current.get(f.id)
      let pageCount = f.page_count ?? null
      if (pageCount == null && blob) {
        pageCount = await countPdfPagesClientSide(blob)
        if (pageCount != null) {
          void apiFetch(`/api/clash-gap/analyses/${id}/files/${f.id}`, {
            method: 'PATCH',
            json: { page_count: pageCount },
          }).catch(() => {})
        }
      }
      if (
        !shouldClientRasterize({
          pageCount,
          hasLocalFile: Boolean(blob),
        })
      ) {
        const reason =
          pageCount != null && pageCount > clientChunkMaxPages() ? 'large_pdf' : 'no_local_file'
        serverOnly.push(clientChunkSkipDetail({ fileName: f.file_name, reason, pageCount }))
        continue
      }

      const result = await rasterizePdfPages({
        analysisId: id,
        fileId: f.id,
        file: blob!,
        fileLabel: f.file_name,
        onProgress: (p) =>
          setStages((prev) => ({
            ...prev,
            chunk: {
              ...(prev.chunk ?? { status: 'running' }),
              status: 'running',
              processed: baseProcessed + p.processed,
              total: Math.max(grandTotal, baseProcessed + p.total),
              detail: p.pageLabel,
            },
          })),
      })
      baseProcessed += result.pages
    }

    if (serverOnly.length) {
      const detailText = serverOnly.join(' · ')
      setStages((prev) => ({
        ...prev,
        chunk: {
          ...(prev.chunk ?? { status: 'running' }),
          status: 'running',
          processed: baseProcessed,
          total: Math.max(grandTotal, baseProcessed) || undefined,
          detail: detailText,
        },
      }))
      if (serverOnly.length === pdfFiles.length) {
        toast.info(
          `Large or remote PDFs are processed on the server (resumable). Browser limit: ${clientChunkMaxPages()} pages per file.`,
          { duration: 6000 },
        )
      }
    }
  }, [])

  const runStage = useCallback(
    async (stage: ClashGapStage) => {
      if (runningStage) return
      setRunningStage(stage)
      try {
        const id = await ensureAnalysis()

        if (stage === 'chunk') {
          await ensureUploadsReady(id)
          await rasterizeChunkPages(id)
        }
        if (stage === 'detect') {
          await apiFetch(`/api/clash-gap/analyses/${id}`, {
            method: 'PATCH',
            json: { settings: { ...settings, selectedTrades } },
          })
          const reconciled = reconcileDocumentTypes(rows)
          if (!canRunClashGapDetection(reconciled)) {
            const msg = missingDocumentRolesMessage(reconciled)
            setActiveStep('upload')
            throw new Error(msg ?? 'Set one Plans file and one Specifications file before detection.')
          }
        }

        await apiFetch(`/api/clash-gap/analyses/${id}/stages/${stage}/run`, { method: 'POST' })
        await pollStage(id, stage)
        toast.success(`${STAGE_RUN_LABEL[stage][0]!.toUpperCase()}${STAGE_RUN_LABEL[stage].slice(1)} complete.`)
        
        if (stage === 'chunk') setActiveStep('ocr')
        else if (stage === 'ocr') setActiveStep('detection')
        else if (stage === 'detect') setActiveStep('result')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Stage failed')
      } finally {
        setRunningStage(null)
        setClientUploadLabel(null)
      }
    },
    [
      runningStage,
      ensureAnalysis,
      ensureUploadsReady,
      rasterizeChunkPages,
      pollStage,
      settings,
      selectedTrades,
      rows,
    ],
  )

  const autoRunRef = useRef(false)
  useEffect(() => {
    const stage: ClashGapStage | null =
      activeStep === 'chunk'
        ? 'chunk'
        : activeStep === 'ocr'
          ? 'ocr'
          : activeStep === 'detection'
            ? 'detect'
            : null
    if (!stage || runningStage || autoRunRef.current) return
    if (stageStatus(stages, stage) !== 'pending') return
    if (!stageGateMet(stages, stage, hasUploadsReady)) return
    autoRunRef.current = true
    void runStage(stage).finally(() => {
      autoRunRef.current = false
    })
  }, [activeStep, hasUploadsReady, runningStage, stages, runStage])

  const downloadArtifact = useCallback(
    async (key: string, path: string, filename: string, init?: RequestInit) => {
      setDownloadingKey(key)
      try {
        await downloadAndSaveBlob(path, filename, init)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Download failed')
      } finally {
        setDownloadingKey(null)
      }
    },
    [],
  )

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

  const buildSessionPayload = useCallback(
    (): ClashGapSessionV1 => ({
      version: 1,
      analysisId: analysisId ?? null,
      projectId,
      settings,
      rows: rows.map(({ file: _file, ...rest }) => ({ ...rest })),
      issues,
      ignoredIds: issues.filter((i) => i.status === 'dismissed').map((i) => i.id),
      bookmarkedIds: [...bookmarkedIds],
      selectedIssueId,
      phase: allStagesComplete(stages) ? 'results' : 'prepare',
      activeStep,
      stages,
    }),
    [analysisId, projectId, settings, rows, issues, bookmarkedIds, selectedIssueId, stages, activeStep],
  )

  const persistSession = useCallback(
    (opts?: { silent?: boolean }) => {
      if (typeof window === 'undefined') return
      try {
        localStorage.setItem(CLASH_GAP_SESSION_STORAGE_KEY, JSON.stringify(buildSessionPayload()))
        if (!opts?.silent) toast.success('Session saved.')
      } catch {
        if (!opts?.silent) toast.error('Could not save session.')
      }
    },
    [buildSessionPayload],
  )

  const resetToFreshSession = useCallback(() => {
    savedAnalysisRef.current = false
    setIsSavedSession(false)
    setAnalysisId(null)
    analysisIdRef.current = null
    creatingAnalysisRef.current = null
    autoRunRef.current = false
    setActiveStep('upload')
    setRows([])
    setSettings(defaultSettings)
    setSelectedTrades([])
    setStages({})
    setRunningStage(null)
    setClientUploadLabel(null)
    setIssues([])
    setBookmarkedIds(new Set())
    setDisciplineFilter('all')
    setFilter('all')
    setSearch('')
    setSelectedIssueId(null)
    setSheetIssue(null)
    setSheetOpen(false)
    setRfiDraft(null)
    setViewerOpen(false)
  }, [])

  const startNewSession = useCallback(async () => {
    const id = analysisIdRef.current
    setIsStartingNewSession(true)
    try {
      if (id && !savedAnalysisRef.current) {
        try {
          await apiFetch(`/api/clash-gap/analyses/${id}`, { method: 'DELETE' })
        } catch {
        }
      }
      try {
        localStorage.removeItem(CLASH_GAP_SESSION_STORAGE_KEY)
      } catch {
      }
      resetToFreshSession()
      setNewSessionConfirmOpen(false)
      router.push('/clash-gap-detection/session?new=1')
      toast.success('Ready for a new session.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start a new session')
    } finally {
      setIsStartingNewSession(false)
    }
  }, [resetToFreshSession, router])

  const goToList = useCallback(() => {
    router.push('/clash-gap-detection')
  }, [router])

  const deleteSavedSession = useCallback(async () => {
    const id = analysisIdRef.current
    if (!id) return
    setIsDeletingSavedSession(true)
    try {
      await apiFetch(`/api/clash-gap/analyses/${id}`, { method: 'DELETE' })
      try {
        localStorage.removeItem(CLASH_GAP_SESSION_STORAGE_KEY)
      } catch {
      }
      setDeleteSavedConfirmOpen(false)
      router.push('/clash-gap-detection')
      toast.success('Session deleted.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete session')
    } finally {
      setIsDeletingSavedSession(false)
    }
  }, [router])

  const saveAndDone = useCallback(async () => {
    const id = analysisIdRef.current
    if (!id) return
    setIsSavingAndDone(true)
    try {
      await apiFetch(`/api/clash-gap/analyses/${id}`, {
        method: 'PATCH',
        json: {
          saved_at: new Date().toISOString(),
          session_meta: {
            bookmarkedIds: [...bookmarkedIds],
            selectedIssueId,
          },
        },
      })
      try {
        localStorage.removeItem(CLASH_GAP_SESSION_STORAGE_KEY)
      } catch {
      }
      router.push('/clash-gap-detection')
      toast.success('Session saved.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save session')
    } finally {
      setIsSavingAndDone(false)
    }
  }, [bookmarkedIds, selectedIssueId, router])

  const autosaveMountedRef = useRef(false)
  useEffect(() => {
    if (!autosaveMountedRef.current) {
      autosaveMountedRef.current = true
      return
    }
    const timer = setTimeout(() => persistSession({ silent: true }), 800)
    return () => clearTimeout(timer)
  }, [persistSession])

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
      notes: `${rfiDraft.relatedDocuments.trim()}\n\n${rfiDraft.notes.trim()}`.trim() || undefined,
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

  const addIssueToRfiDraft = useCallback(
    (issueId: string) => {
      const issue = issues.find((i) => i.id === issueId)
      if (!issue) return
      if (issue.status === 'dismissed') {
        toast.error('This issue was ignored. Select another issue.')
        return
      }
      setSelectedIssueId(issueId)
      setRfiDraft(buildRfiDraftFromIssue(issue, settings, selectedTrades, rows))
      requestAnimationFrame(() => {
        rfiPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
      toast.success('Ready to RFI draft')
    },
    [issues, settings, selectedTrades, rows],
  )

  const ignoreIssue = useCallback(
    (issueId: string) => {
      void patchIssueStatus(issueId, 'dismissed')
        .then(() => {
          setSelectedIssueId((sel) => {
            if (sel !== issueId) return sel
            const visible = issues.filter((i) => i.id !== issueId && i.status !== 'dismissed')
            return visible[0]?.id ?? null
          })
          toast.success('Issue ignored')
        })
        .catch((e) => {
          toast.error(e instanceof Error ? e.message : 'Could not ignore issue')
        })
    },
    [patchIssueStatus, issues],
  )

  const visibleIssues = useMemo(() => issues.filter((i) => i.status !== 'dismissed'), [issues])
  const uploadFilenames = useMemo(() => uniqueUploadFilenames(rows), [rows])

  const stepDisplayStatus = useCallback(
    (step: DetectionWizardStep): StepDisplayStatus => {
      if (step === 'upload') return hasUploadsReady ? 'completed' : 'ready'
      if (step === 'result') return isStageComplete(stages, 'detect') ? 'completed' : 'locked'
      const stage = STEP_TO_STAGE[step]
      const st = stageStatus(stages, stage)
      if (runningStage === stage || st === 'running') return 'running'
      if (st === 'completed') return 'completed'
      if (st === 'failed') return 'failed'
      return stageGateMet(stages, stage, hasUploadsReady) ? 'ready' : 'locked'
    },
    [stages, runningStage, hasUploadsReady],
  )

  const canNavigateTo = useCallback(
    (step: DetectionWizardStep): boolean => {
      if (step === 'upload') return true
      if (step === 'result') return isStageComplete(stages, 'detect')
      const stage = STEP_TO_STAGE[step]
      if (stageStatus(stages, stage) !== 'pending') return true
      return stageGateMet(stages, stage, hasUploadsReady)
    },
    [stages, hasUploadsReady],
  )

  const stepperItems: StepperItem[] = useMemo(
    () => [
      {
        id: 'upload',
        title: 'Upload',
        description: 'Add plans & specs, set document type and options.',
        status: stepDisplayStatus('upload'),
      },
      {
        id: 'chunk',
        title: 'Chunk',
        description: 'Split each PDF into one image per page.',
        status: stepDisplayStatus('chunk'),
      },
      {
        id: 'ocr',
        title: 'OCR',
        description: 'Read text from each page and merge per document.',
        status: stepDisplayStatus('ocr'),
      },
      {
        id: 'detection',
        title: 'Detection',
        description: 'Find gaps, clashes & mismatches.',
        status: stepDisplayStatus('detection'),
      },
      {
        id: 'result',
        title: 'Final result',
        description: 'Review issues, draft RFIs & download report.',
        status: stepDisplayStatus('result'),
      },
    ],
    [stepDisplayStatus],
  )

  const canGoNext = useMemo(() => {
    const order: DetectionWizardStep[] = ['upload', 'chunk', 'ocr', 'detection', 'result']
    const idx = order.indexOf(activeStep)
    const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1]! : null
    return next ? canNavigateTo(next) : false
  }, [activeStep, canNavigateTo])

  const detectComplete = isStageComplete(stages, 'detect')

  const stepper = (
    <DetectionStepper
      steps={stepperItems}
      activeStep={activeStep}
      onStepChange={setActiveStep}
      canNavigateTo={canNavigateTo}
    />
  )

  const base = analysisId ? `clash-gap-${analysisId.slice(0, 8)}` : 'clash-gap'

  const renderProcessingStage = (step: 'chunk' | 'ocr') => {
    const stage = STEP_TO_STAGE[step]
    const state = stages[stage]
    const gateMet = stageGateMet(stages, stage, hasUploadsReady)
    const id = analysisId
    const meta: Record<typeof step, { title: string; description: string; runLabel: string; gateHint: string }> = {
      chunk: {
        title: 'Chunk — split PDFs into page images',
        description: `Every PDF page becomes a single image (a 5-page PDF → 5 images). Uploaded images count as one page each. PDFs over ${clientChunkMaxPages()} pages are processed on the server so you can refresh or close the tab without losing progress.`,
        runLabel: 'chunking',
        gateHint: 'Upload at least one document on the Upload step first.',
      },
      ocr: {
        title: 'OCR — read text from each image',
        description: 'Each page image is transcribed with OpenAI vision OCR, then merged into one text stream per document.',
        runLabel: 'OCR',
        gateHint: 'Run the Chunk stage first.',
      },
    } as const
    const m = meta[step]
    const isOcr = step === 'ocr'
    const preview = isOcr ? { label: 'View result', onClick: () => setViewerOpen(true) } : undefined
    const downloads = isOcr
      ? [
          {
            label: 'Per-page PDFs (.zip)',
            busy: downloadingKey === 'ocr-pdf-zip',
            onClick: () =>
              id && downloadArtifact('ocr-pdf-zip', `/api/clash-gap/analyses/${id}/artifacts/ocr`, `${base}-ocr-pages.zip`, { method: 'GET' }),
          },
          {
            label: 'Merged PDF (.pdf)',
            busy: downloadingKey === 'merged-pdf',
            onClick: () =>
              id && downloadArtifact('merged-pdf', `/api/clash-gap/analyses/${id}/artifacts/merged`, `${base}-merged.pdf`, { method: 'GET' }),
          },
        ]
      : []

    return (
      <StagePanel
        title={m.title}
        description={m.description}
        status={runningStage === stage ? 'running' : stageStatus(stages, stage)}
        detail={state?.detail}
        error={state?.error}
        gateMet={gateMet}
        gateHint={m.gateHint}
        isRunning={runningStage === stage}
        onRun={() => void runStage(stage)}
        runLabel={m.runLabel}
        preview={preview}
        downloads={downloads}
        processed={state?.processed}
        total={state?.total}
        hideRun={step === 'chunk'}
      >
        <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-sm text-[#475569]">
          {step === 'chunk' && (state?.total != null ? `${state.total} page image(s) generated.` : 'Page images generated.')}
          {step === 'ocr' && (state?.total != null ? `OCR completed for ${state.total} page(s).` : 'OCR completed.')}
        </div>
      </StagePanel>
    )
  }

  return (
    <>
      <SessionLoadingOverlay open={isLoadingSession} />
      <DetectionToolShell
        stepper={stepper}
        showGoToList={isSavedSession && !isLoadingSession}
        onGoToList={goToList}
        showDeleteSession={isSavedSession && !isLoadingSession}
        onDeleteSession={() => setDeleteSavedConfirmOpen(true)}
        isDeletingSession={isDeletingSavedSession}
        showSaveAndDone={!isSavedSession && !isLoadingSession}
        onSaveAndDone={() => void saveAndDone()}
        saveAndDoneDisabled={!detectComplete || Boolean(runningStage) || !analysisId}
        isSavingAndDone={isSavingAndDone}
        onRunDetection={() => {}}
        canRunDetection={false}
        isRunning={Boolean(runningStage)}
        showRunDetection={false}
      >
        {!isLoadingSession ? (
          <>
        {activeStep === 'upload' ? (
          <div className="flex flex-col gap-6">
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
                  if (!projectId) {
                    toast.error('Select a project before uploading files')
                    throw new Error('No project selected')
                  }
                  const id = await ensureAnalysis()
                  await uploadRowFile(row, id)
                } catch (e) {
                  setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: 'error' as const } : r)))
                  const msg = e instanceof Error ? e.message : 'Upload failed'
                  if (!msg.includes('No project')) toast.error(msg)
                }
              }}
              onCreateProject={async (input) => {
                const res = await apiFetch<{ project: { id: string; name: string; job_number?: string | null } }>(
                  '/api/projects',
                  { method: 'POST', json: { name: input.name, address: input.address || null, job_number: input.jobNumber || null } },
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
                toast.success('Project created')
              }}
              onRemoveRow={async (row) => {
                try {
                  const aid = analysisIdRef.current
                  if (row.serverFileId && aid) {
                    await apiFetch(`/api/clash-gap/analyses/${aid}/files/${row.serverFileId}`, { method: 'DELETE' })
                  }
                  setRows((prev) => prev.filter((r) => r.id !== row.id))
                } catch (e) {
                  const status = typeof (e as { status?: number })?.status === 'number' ? (e as { status?: number }).status : null
                  if (status === 404) {
                    setRows((prev) => prev.filter((r) => r.id !== row.id))
                    toast.message('File removed')
                    return
                  }
                  toast.error(e instanceof Error ? e.message : 'Could not remove file')
                }
              }}
              onRowTypeChange={async (row) => {
                const aid = analysisIdRef.current
                if (!aid || !row.serverFileId) return
                try {
                  await syncFileRoleToServer(aid, row)
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Could not update document type')
                }
              }}
            />
            <DetectionSettingsStep settings={settings} onSettingsChange={setSettings} />

            <div className="flex flex-col gap-3 border-t border-[#e2e8f0] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-[#64748b]">
                {rows.some((r) => r.status === 'pending')
                  ? 'Waiting for uploads to finish…'
                  : hasUploadsReady
                    ? 'Ready — Start runs Chunk → OCR → Detection automatically through to the final result.'
                    : uploadDocsHint}
              </span>
              <Button
                type="button"
                size="lg"
                className="rounded-xl bg-violet-600 text-white hover:bg-violet-700 sm:min-w-[220px]"
                disabled={
                  !hasUploadsReady || Boolean(runningStage) || rows.some((r) => r.status === 'pending')
                }
                title={!hasUploadsReady && uploadDocsHint ? uploadDocsHint : undefined}
                onClick={() => setActiveStep('chunk')}
              >
                <Play className="mr-2 h-4 w-4 fill-current" aria-hidden />
                Start analysis
              </Button>
            </div>
          </div>
        ) : null}

        {activeStep === 'chunk' ? renderProcessingStage('chunk') : null}
        {activeStep === 'ocr' ? renderProcessingStage('ocr') : null}

        {activeStep === 'detection' ? (
          <StagePanel
            title="Detection — gaps, clashes & mismatches"
            description="Drawings are reviewed against the specifications. Each finding traces back to a specific requirement."
            status={runningStage === 'detect' ? 'running' : stageStatus(stages, 'detect')}
            detail={stages.detect?.detail}
            error={stages.detect?.error}
            gateMet={stageGateMet(stages, 'detect', hasUploadsReady)}
            gateHint="Run the OCR stage first."
            isRunning={runningStage === 'detect'}
            onRun={() => void runStage('detect')}
            runLabel="detection"
            processed={stages.detect?.processed}
            total={stages.detect?.total}
          >
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-900">
              {visibleIssues.length === 0
                ? 'No issues were flagged. Continue to Final result to download the report and finish.'
                : `${visibleIssues.length} issue${visibleIssues.length === 1 ? '' : 's'} found. Continue to Final result to review them, draft RFIs and download the report.`}
            </div>
          </StagePanel>
        ) : null}

        {activeStep === 'result' ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e2e8f0] bg-white px-5 py-4 shadow-sm">
              <div className="text-sm text-[#475569]">
                {visibleIssues.length === 0
                  ? 'No issues were flagged for this analysis.'
                  : `${visibleIssues.length} issue${visibleIssues.length === 1 ? '' : 's'} ready to review.`}
              </div>
              {analysisId ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    disabled={downloadingKey === 'report'}
                    onClick={() =>
                      downloadArtifact('report', `/api/clash-gap/analyses/${analysisId}/report`, `${base}-report.pdf`, { method: 'POST' })
                    }
                  >
                    <Download className="mr-2 h-4 w-4" strokeWidth={2} aria-hidden />
                    Report (.pdf)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    disabled={downloadingKey === 'issues-csv'}
                    onClick={() =>
                      downloadArtifact('issues-csv', `/api/clash-gap/analyses/${analysisId}/artifacts/issues?format=csv`, `${base}-issues.csv`, { method: 'GET' })
                    }
                  >
                    <Download className="mr-2 h-4 w-4" strokeWidth={2} aria-hidden />
                    Issues (.csv)
                  </Button>
                </div>
              ) : null}
            </div>

            <DetectionResultsWorkspace
              issues={visibleIssues}
              onIgnoreIssue={ignoreIssue}
              onAddToRfi={addIssueToRfiDraft}
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
              draft={rfiDraft}
              setDraft={setRfiDraftFromPanel}
              uploadFilenames={uploadFilenames}
              linkedIssue={linkedIssue}
              onClearDraft={clearDraft}
              onSaveDraftLocal={saveDraftLocal}
              onCreateRfi={createRfiNavigate}
              rfiPanelRef={rfiPanelRef}
              onBackToUpload={() => {
                setActiveStep('upload')
                setSheetOpen(false)
                setSheetIssue(null)
              }}
            />
          </div>
        ) : null}
          </>
        ) : null}
      </DetectionToolShell>

      <SourceComparisonSheet open={sheetOpen} onOpenChange={setSheetOpen} issue={sheetIssue} />

      <DetectionResultViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        analysisId={analysisId}
      />

      <Dialog open={deleteSavedConfirmOpen} onOpenChange={(o) => !isDeletingSavedSession && setDeleteSavedConfirmOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this saved session?</DialogTitle>
            <DialogDescription>
              This permanently deletes the analysis, uploaded files, OCR data, and detected issues
              from the server. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeletingSavedSession}
              onClick={() => setDeleteSavedConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeletingSavedSession}
              onClick={() => void deleteSavedSession()}
            >
              {isDeletingSavedSession ? 'Deleting…' : 'Delete session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newSessionConfirmOpen} onOpenChange={(o) => !isStartingNewSession && setNewSessionConfirmOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new session?</DialogTitle>
            <DialogDescription>
              This clears in-progress work in this browser and permanently deletes the current
              unsaved analysis, uploaded files, and results from the server. Saved sessions in your
              list are not affected. Download any reports you need before continuing. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isStartingNewSession}
              onClick={() => setNewSessionConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isStartingNewSession}
              onClick={() => void startNewSession()}
            >
              {isStartingNewSession ? 'Starting…' : 'New Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
