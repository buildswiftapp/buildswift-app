'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { downloadAndSaveBlob, uploadClashGapFile } from '@/lib/api-upload'
import {
  mapApiIssueToClashGapIssue,
  type ApiClashGapAnalysisDetail,
} from '@/lib/clash-gap-api'
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
import { DetectionStepFooter } from './detection-step-footer'
import { DetectionStepper, type StepDisplayStatus, type StepperItem } from './detection-stepper'
import { DetectionToolShell } from './detection-tool-shell'
import { SourceComparisonSheet } from './source-comparison-sheet'
import { StagePanel } from './stage-panel'
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
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
      const maxMs = 12 * 60 * 1000
      try {
        for (;;) {
          const data = await apiFetch<ApiClashGapAnalysisDetail>(`/api/clash-gap/analyses/${id}`)
          const nextStages = applyAnalysis(data)
          const status = stageStatus(nextStages, stage)
          if (status === 'completed') return
          if (status === 'failed') {
            throw new Error(nextStages[stage]?.error || `${STAGE_RUN_LABEL[stage]} failed`)
          }
          if (Date.now() - started > maxMs) {
            throw new Error('This stage is taking longer than expected. Try again in a few minutes.')
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
                  type: sanitizeClashGapDocumentType(r.type),
                })) as DocumentUploadRow[],
              )
            }
          }
        } catch {
        }
      }
    }

    if (analysisParam && analysisParam !== analysisId) {
      void (async () => {
        try {
          const data = await loadAnalysis(analysisParam)
          const loaded = parseStages(data.analysis.stages)
          setActiveStep(firstIncompleteStep(loaded, Boolean(data.files?.length)))
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
            router.replace('/clash-gap-detection')
            return
          }
          toast.error(e instanceof Error ? e.message : 'Failed to load analysis')
        }
      })()
    }
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
      setClientUploadLabel(`Uploading ${row.filename}…`)
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: 'pending' as const } : r)))
      try {
        const uploaded = await uploadClashGapFile({
          analysisId: targetAnalysisId,
          file: row.file,
          fileRole: fileRoleFromDocType(row.type),
        })
        const updated: DocumentUploadRow = {
          ...row,
          serverFileId: uploaded.id,
          status: 'ready',
          pages: displayPageCount(uploaded.page_count),
          file: undefined,
        }
        setRows((prev) => {
          if (!prev.some((r) => r.id === row.id)) return prev
          return prev.map((r) => (r.id === row.id ? updated : r))
        })
        return updated
      } finally {
        setClientUploadLabel(null)
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
        router.replace(`/clash-gap-detection?analysis=${id}`)
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

  const runStage = useCallback(
    async (stage: ClashGapStage) => {
      if (runningStage) return
      setRunningStage(stage)
      try {
        const id = await ensureAnalysis()

        if (stage === 'chunk') {
          await ensureUploadsReady(id)
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
    [runningStage, ensureAnalysis, ensureUploadsReady, pollStage, settings, selectedTrades, rows],
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

  const finishAndCleanup = useCallback(async () => {
    const id = analysisIdRef.current
    if (!id) return
    setIsFinishing(true)
    try {
      await downloadAndSaveBlob(
        `/api/clash-gap/analyses/${id}/report`,
        `clash-gap-report-${id.slice(0, 8)}.pdf`,
        { method: 'POST' },
      )
      await apiFetch(`/api/clash-gap/analyses/${id}`, { method: 'DELETE' })
      try {
        localStorage.removeItem(CLASH_GAP_SESSION_STORAGE_KEY)
      } catch {
      }
      setAnalysisId(null)
      analysisIdRef.current = null
      setStages({})
      setIssues([])
      setRows([])
      setSelectedIssueId(null)
      setBookmarkedIds(new Set())
      setActiveStep('upload')
      setConfirmOpen(false)
      router.replace('/clash-gap-detection')
      toast.success('Report saved. All uploaded files and analysis data were deleted.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not finish and clean up')
    } finally {
      setIsFinishing(false)
    }
  }, [router])

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
      issues: [],
      ignoredIds: [],
      bookmarkedIds: [...bookmarkedIds],
      selectedIssueId,
      phase: allStagesComplete(stages) ? 'results' : 'prepare',
      activeStep,
    }),
    [analysisId, projectId, settings, rows, bookmarkedIds, selectedIssueId, stages, activeStep],
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

  const saveSession = useCallback(() => persistSession(), [persistSession])

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
      toast.success('Added to RFI draft')
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
        description: 'Every PDF page becomes a single image (a 5-page PDF → 5 images). Uploaded images count as one page each.',
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
          {
            label: '.json',
            busy: downloadingKey === 'ocr-json',
            onClick: () =>
              id && downloadArtifact('ocr-json', `/api/clash-gap/analyses/${id}/artifacts/ocr?format=json`, `${base}-ocr.json`, { method: 'GET' }),
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
      <DetectionToolShell
        stepper={stepper}
        onSaveSession={saveSession}
        onRunDetection={() => {}}
        canRunDetection={false}
        isRunning={Boolean(runningStage)}
        showRunDetection={false}
      >
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

        <DetectionStepFooter
          activeStep={activeStep}
          onStepChange={setActiveStep}
          canGoNext={canGoNext}
          nextHint={
            activeStep === 'upload'
              ? uploadDocsHint
              : canGoNext
                ? null
                : 'Finish the current stage to continue.'
          }
          showNext={activeStep !== 'chunk' && activeStep !== 'detection'}
          onDone={() => setConfirmOpen(true)}
          doneReady={detectComplete && !runningStage}
          isFinishing={isFinishing}
        />
      </DetectionToolShell>

      <SourceComparisonSheet open={sheetOpen} onOpenChange={setSheetOpen} issue={sheetIssue} />

      <DetectionResultViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        analysisId={analysisId}
      />

      <Dialog open={confirmOpen} onOpenChange={(o) => !isFinishing && setConfirmOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Download report & delete everything?</DialogTitle>
            <DialogDescription>
              Your PDF report will be downloaded to this device, then all uploaded files, page
              images, OCR/merged text, and detected issues for this analysis are permanently
              deleted from the server. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isFinishing} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={isFinishing}
              onClick={() => void finishAndCleanup()}
            >
              {isFinishing ? 'Saving & clearing…' : 'Download & delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
