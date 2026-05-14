'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import {
  CLASH_GAP_RFI_PREFILL_STORAGE_KEY,
  type ClashGapRfiPrefillPayload,
} from '@/lib/clash-gap-rfi-prefill'
import {
  CLASH_GAP_SESSION_STORAGE_KEY,
  type ClashGapSessionV1,
} from '@/lib/clash-gap-session'
import { generateMockIssues } from '@/lib/clash-gap-mock-detection'
import type {
  ClashGapIssue,
  DetectionSettings,
  DocumentUploadRow,
  IssueType,
  RfiDraftState,
} from '@/lib/clash-gap-types'
import type { Project } from '@/lib/types'
import { toast } from 'sonner'
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

/** RFI title like reference: “Slab Thickness Clarification” */
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

function buildRfiDraftFromIssue(
  issue: ClashGapIssue,
  settings: DetectionSettings,
  trades: string[],
): RfiDraftState {
  const related = issue.sources.map((s) => `${s.documentLabel} — p. ${s.page}`).join('\n')
  const rawSubject = (issue.summary.split('.')[0] ?? issue.summary).trim()
  const subject = rawSubject.slice(0, SUBJECT_MAX)

  const shortBody = `Contract documents require coordination on: ${issue.title.toLowerCase()}. ${issue.summary} Please confirm the governing requirement.`

  const detailedBody = [
    `Context: ${issue.summary}`,
    '',
    'Referenced locations:',
    ...issue.sources.map(
      (s, i) =>
        `${i + 1}. ${s.documentLabel} (page ${s.page}) — “${s.excerpt.slice(0, 120)}${s.excerpt.length > 120 ? '…' : ''}”`,
    ),
    '',
    'Requested action: Please confirm the correct, coordinated requirement and direct any drawing or spec updates as needed.',
  ].join('\n')

  const rawDescription = settings.rfiFormat === 'short' ? shortBody : detailedBody
  const description = rawDescription.slice(0, DESC_MAX)

  const drawingLike = issue.sources
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
  const drawingSheetNumbers = issue.sources
    .map((s) => s.page)
    .filter((p): p is string => typeof p === 'string')
    .join(', ')

  const detailReferences = issue.sources
    .map((s) => `${s.documentLabel} (p. ${s.page})`)
    .join('; ')

  return { drawingSheetNumbers, detailReferences }
}

export function ClashGapDetectionPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const rfiPanelRef = useRef<HTMLDivElement>(null)

  const [phase, setPhase] = useState<'prepare' | 'results'>('prepare')
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [rows, setRows] = useState<DocumentUploadRow[]>([])
  const [settings, setSettings] = useState<DetectionSettings>(defaultSettings)
  const [selectedTrades, setSelectedTrades] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [issues, setIssues] = useState<ClashGapIssue[]>([])
  const [ignoredIds, setIgnoredIds] = useState(() => new Set<string>())
  const [bookmarkedIds, setBookmarkedIds] = useState(() => new Set<string>())
  const [disciplineFilter, setDisciplineFilter] = useState('all')
  const [filter, setFilter] = useState<IssueType | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [sheetIssue, setSheetIssue] = useState<ClashGapIssue | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [rfiDraft, setRfiDraft] = useState<RfiDraftState | null>(null)

  const sessionRestored = useRef(false)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiFetch<{
          projects: Array<{
            id: string
            name: string
            address: string | null
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
    if (typeof window === 'undefined' || sessionRestored.current) return
    try {
      const rawLocal = localStorage.getItem(CLASH_GAP_SESSION_STORAGE_KEY)
      if (!rawLocal) {
        sessionRestored.current = true
        return
      }
      const s = JSON.parse(rawLocal) as ClashGapSessionV1
      if (s.version !== 1) {
        sessionRestored.current = true
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
      setIssues(s.issues ?? [])
      setIgnoredIds(new Set(s.ignoredIds ?? []))
      setBookmarkedIds(new Set(s.bookmarkedIds ?? []))
      setSelectedIssueId(s.selectedIssueId ?? null)
      setPhase(s.phase === 'results' ? 'results' : 'prepare')
      sessionRestored.current = true
      toast.message('Saved session restored. Re-upload files if you need full analysis again.')
    } catch {
      sessionRestored.current = true
    }
  }, [])

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
    let draft = buildRfiDraftFromIssue(linkedIssue, settings, selectedTrades)
    if (key && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(key)
        if (raw) {
          const parsed = JSON.parse(raw) as RfiDraftState
          if (parsed && typeof parsed === 'object' && typeof parsed.description === 'string') {
            draft = { ...draft, ...parsed }
          }
        }
      } catch {
        /* keep generated draft */
      }
    }
    setRfiDraft(draft)
  }, [linkedIssue?.id, projectId, settings, selectedTrades])

  const runDetection = useCallback(() => {
    if (!projectId) return toast.error('Select a project')
    if (!rows.length) return toast.error('Add at least one document')
    setIsRunning(true)
    window.setTimeout(() => {
      const next = generateMockIssues(rows, settings)
      setIssues(next)
      setIgnoredIds(new Set())
      setBookmarkedIds(new Set())
      setDisciplineFilter('all')
      setFilter('all')
      setSearch('')
      setSelectedIssueId(next[0]?.id ?? null)
      setPhase('results')
      setIsRunning(false)
      toast.success('Detection finished (demo data).')
    }, 650)
  }, [projectId, rows, settings])

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
      projectId,
      settings,
      rows: rows.map(({ file: _file, ...rest }) => ({ ...rest })),
      issues,
      ignoredIds: [...ignoredIds],
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
  }, [projectId, settings, rows, issues, ignoredIds, bookmarkedIds, selectedIssueId, phase])

  const clearDraft = useCallback(() => {
    if (!linkedIssue) return
    setRfiDraft(buildRfiDraftFromIssue(linkedIssue, settings, selectedTrades))
    toast.message('Draft reset from current issue.')
  }, [linkedIssue, settings, selectedTrades])

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
    }

    try {
      sessionStorage.setItem(CLASH_GAP_RFI_PREFILL_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      toast.error('Could not prepare RFI draft for handoff.')
      return
    }
    router.push(`/documents/new?type=rfi&project=${encodeURIComponent(projectId)}`)
  }, [rfiDraft, linkedIssue, projectId, router])

  const scrollToRfi = useCallback(() => {
    rfiPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])

  const uploadFilenames = useMemo(() => rows.map((r) => r.filename), [rows])

  const stepper = (
    <DetectionStepper
      phase={phase}
      uploadComplete={rows.length > 0}
      uploadLabel={`${rows.length} file${rows.length === 1 ? '' : 's'} uploaded`}
      settingsLabel={formatSettingsSummary(settings)}
      resultsLabel={phase === 'results' ? `${issues.length} issues found` : 'Run detection to see results'}
    />
  )

  return (
    <>
      <DetectionToolShell
        stepper={stepper}
        onSaveSession={saveSession}
        onRunDetection={runDetection}
        canRunDetection={Boolean(projectId) && rows.length > 0 && !isRunning}
        isRunning={isRunning}
        showRunDetection
      >
        {phase === 'prepare' ? (
          <UploadSetupStep
            projects={projects}
            projectId={projectId}
            onProjectIdChange={setProjectId}
            rows={rows}
            onRowsChange={setRows}
            settings={settings}
            onSettingsChange={setSettings}
            selectedTrades={selectedTrades}
            onSelectedTradesChange={setSelectedTrades}
            fileInputRef={fileInputRef}
          />
        ) : (
          <DetectionResultsWorkspace
            issues={issues}
            ignoredIds={ignoredIds}
            onIgnore={(id) => {
              setIgnoredIds((prev) => {
                const next = new Set([...prev, id])
                setSelectedIssueId((sel) => {
                  if (sel !== id) return sel
                  const visible = issues.filter((i) => !next.has(i.id))
                  return visible[0]?.id ?? null
                })
                return next
              })
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
            setDraft={(updater) => {
              setRfiDraft((prev) => {
                if (prev === null) return null
                return typeof updater === 'function'
                  ? (updater as (p: RfiDraftState) => RfiDraftState)(prev)
                  : updater
              })
            }}
            uploadFilenames={uploadFilenames}
            linkedIssue={linkedIssue}
            onClearDraft={clearDraft}
            onSaveDraftLocal={saveDraftLocal}
            onCreateRfi={createRfiNavigate}
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
    </>
  )
}