'use client'

import type { ReactNode } from 'react'
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle,
  CircleDollarSign,
  Download,
  Eye,
  Send,
  Save,
  Timer,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import {
  buildChangeOrderHtml,
  buildRfiDescriptionBody,
  buildSubmittalDescriptionBody,
  CO_REASON_OPTIONS,
  formatUsd,
  getLatestVersion,
  initialChangeOrderState,
  initialRfiState,
  initialSubmittalState,
  parseMoneyInput,
} from '@/lib/document-html'
import {
  computeBaseline,
  computeDerived,
  computeSchedule,
  formatScheduleLabel,
  formatSignedUsd,
  serializeChangeOrderImpactToMetadata,
  validateChangeOrderImpact,
  type ChangeOrderBaselineState,
  type ChangeOrderCostState,
  type ChangeOrderImpactValidationErrors,
  type ChangeOrderScheduleState,
} from '@/lib/co-impact'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  backfillFromLegacy,
  canClose,
  isFinal,
  isLocked,
  statusBadge,
  statusBadgeClasses,
  type DocType,
} from '@/lib/status'
import { MissingScopeEditorSection } from '../../../components/missing-scope-editor-section'
import { docTypeToMissingScopeType } from '@/lib/missing-scope-client'
import { DocumentActivityPanel } from '@/app/components/document-activity-panel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Attachment as DocAttachment } from '@/lib/types'

const NAVY = '#0f172a'
const capLabel = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground'
const capLabelRow = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground'

function formCardClassName(extra?: string) {
  return cn(
    'app-surface rounded-2xl bg-white p-5 sm:p-6 lg:p-7 xl:p-8',
    extra
  )
}

function CoImpactCardShell(args: {
  accentBorder: string
  iconBg: string
  iconClass: string
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-2xl border border-border bg-background p-5 shadow-sm ring-1 ring-border/50',
        args.accentBorder
      )}
    >
      <div className="mb-4 flex gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl [&>svg]:h-5 [&>svg]:w-5',
            args.iconBg,
            args.iconClass
          )}
        >
          {args.icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug tracking-tight text-foreground">{args.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{args.description}</p>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1">{args.children}</div>
      {args.footer ? <div className="mt-4 border-t border-border pt-4">{args.footer}</div> : null}
    </div>
  )
}

type ApiProject = { id: string; name: string; address?: string | null }

type ApiDocVersion = {
  version_no: number
  title: string
  description: string
  metadata: Record<string, unknown> | null
}

type ApiDocument = {
  id: string
  project_id: string
  doc_type: 'rfi' | 'submittal' | 'change_order'
  /** Canonical lifecycle status (per `lib/status.ts`). */
  status: string
  /** Legacy: kept for back-compat fallback during Phase 1 dual-write. */
  internal_status: string
  /** Legacy: kept for back-compat fallback during Phase 1 dual-write. */
  external_status: string
  doc_number: string | null
  title: string
  description: string
  document_versions: ApiDocVersion[]
  attachments?: Array<{ id: string; file_name: string; size_bytes: number | null }>
}

interface LocalAttachment {
  id: string
  name: string
  size: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function attachmentsFromMeta(raw: unknown): LocalAttachment[] {
  if (!Array.isArray(raw)) return []
  return raw.map((a: Record<string, unknown>, i: number) => ({
    id: String(a.id ?? `att-${i}`),
    name: String(a.name ?? 'file'),
    size:
      typeof a.size === 'number'
        ? formatBytes(a.size)
        : String(a.size ?? ''),
  }))
}

function attachmentsFromRows(
  rows: Array<{ id: string; file_name: string; size_bytes: number | null }> | undefined
): LocalAttachment[] {
  if (!rows?.length) return []
  return rows.map((row) => ({
    id: row.id,
    name: row.file_name,
    size: typeof row.size_bytes === 'number' ? formatBytes(row.size_bytes) : '',
  }))
}

function toDocAttachments(items: LocalAttachment[]): DocAttachment[] {
  return items.map((a) => ({
    id: a.id,
    name: a.name,
    url: '#',
    size: 0,
    type: a.name.split('.').pop() || 'file',
  }))
}

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<ApiProject[]>([])
  const [doc, setDoc] = useState<ApiDocument | null>(null)

  const [rfi, setRfi] = useState({
    number: '',
    title: '',
    date: '',
    question: '',
    reasonForRequest: '',
    description: '',
    notes: '',
  })
  const [sub, setSub] = useState({
    number: '',
    title: '',
    date: '',
    submittalType: '',
    specSection: '',
    manufacturer: '',
    productName: '',
    quantity: '',
    modelNumber: '',
    detailReferences: '',
    drawingSheetNumbers: '',
    relatedRfiNumbers: '',
    description: '',
    notes: '',
  })
  type ChangeOrderFormState = {
    changeOrderNumber: string
    date: string
    title: string
    description: string
    reason: string
    originalContractAmount: string
    notes: string
    schedule: ChangeOrderScheduleState
    baseline: ChangeOrderBaselineState
    cost: ChangeOrderCostState
  }

  const [co, setCo] = useState<ChangeOrderFormState>({
    changeOrderNumber: '',
    date: '',
    title: '',
    description: '',
    reason: 'owner_request',
    originalContractAmount: '',
    notes: '',
    schedule: { enabled: false, duration: '', unit: 'days', dayType: '' },
    baseline: { value: '', unit: 'days', dayType: '' },
    cost: {
      type: 'increase',
      labor: '',
      materials: '',
      equipment: '',
      subcontractor: '',
      other: '',
      markupPercent: '',
      justificationNote: '',
    },
  })
  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const [impactErrors, setImpactErrors] = useState<ChangeOrderImpactValidationErrors>({})

  const [isSaving, setIsSaving] = useState(false)
  const [openingPdfDetails, setOpeningPdfDetails] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [mainTab, setMainTab] = useState<'details' | 'activity'>('details')
  const [closing, setClosing] = useState(false)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [docRes, projRes] = await Promise.all([
          apiFetch<{ document: ApiDocument }>('/api/documents/' + id),
          apiFetch<{ projects: ApiProject[] }>('/api/projects'),
        ])
        const d = docRes.document
        setDoc(d)
        setProjects(projRes.projects)

        const latest = getLatestVersion(d.document_versions)
        const meta = (latest?.metadata as Record<string, unknown>) ?? {}
        const html = d.description || ''

        const metaAttachments = attachmentsFromMeta(meta.attachments)
        const rowAttachments = attachmentsFromRows(d.attachments)
        const initialAttachments = metaAttachments.length > 0 ? metaAttachments : rowAttachments

        if (d.doc_type === 'rfi') {
          const s = initialRfiState({ doc: d, latestMeta: meta, html })
          setRfi(s)
          setAttachments(initialAttachments)
        } else if (d.doc_type === 'submittal') {
          const s = initialSubmittalState({ doc: d, latestMeta: meta, html })
          setSub(s)
          setAttachments(initialAttachments)
        } else {
          const s = initialChangeOrderState({ doc: d, latestMeta: meta, html })
          setCo({
            changeOrderNumber: s.changeOrderNumber,
            date: s.date,
            title: s.title,
            description: s.description,
            reason: s.reason,
            originalContractAmount: s.originalContractAmount,
            notes: s.notes,
            schedule: s.schedule,
            baseline: s.baseline,
            cost: s.cost,
          })
          setAttachments(initialAttachments)
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load document')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [id])

  const projectId = doc?.project_id ?? ''
  const selectedProject = projects.find((p) => p.id === projectId)
  const docType = doc?.doc_type ?? 'rfi'

  const reasonLabel =
    CO_REASON_OPTIONS.find((r) => r.value === co.reason)?.label ?? co.reason
  const scheduleLabel = formatScheduleLabel(co.schedule)

  const derived = useMemo(
    () =>
      computeDerived({
        schedule: co.schedule,
        baseline: co.baseline,
        cost: co.cost,
        originalContractAmountRaw: co.originalContractAmount,
      }),
    [co.schedule, co.baseline, co.cost, co.originalContractAmount]
  )

  const scheduleComputed = useMemo(() => computeSchedule(co.schedule), [co.schedule])
  const baselineComputed = useMemo(() => computeBaseline(co.baseline), [co.baseline])

  const hintClass = 'mt-1.5 text-xs text-muted-foreground'

  // Canonical status read with legacy-fallback derivation so older rows that
  // haven't been backfilled yet still produce sensible badges.
  const canonicalStatus: string = doc
    ? typeof doc.status === 'string' && doc.status.length
      ? doc.status
      : backfillFromLegacy(
          doc.doc_type as DocType,
          doc.internal_status,
          doc.external_status,
          null
        )
    : 'draft'
  const canonicalDocType: DocType = (doc?.doc_type as DocType) ?? 'rfi'
  const headerBadge = doc ? statusBadge(canonicalDocType, canonicalStatus) : null
  const isDocFinal = doc ? isFinal(canonicalDocType, canonicalStatus) : false
  const isDocLocked = doc ? isLocked(canonicalDocType, canonicalStatus) : false
  const showCloseButton = doc ? canClose(canonicalDocType, canonicalStatus) : false

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const next: LocalAttachment[] = Array.from(files).map((file, index) => ({
      id: `up-${Date.now()}-${index}`,
      name: file.name,
      size: formatBytes(file.size),
    }))
    setAttachments((prev) => [...prev, ...next])
    e.target.value = ''
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files || [])
    if (!files.length) return
    const next: LocalAttachment[] = files.map((file, index) => ({
      id: `drop-${Date.now()}-${index}`,
      name: file.name,
      size: formatBytes(file.size),
    }))
    setAttachments((prev) => [...prev, ...next])
  }, [])

  const removeAttachment = (aid: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== aid))
  }

  const savePatch = async (body: {
    title: string
    description: string
    doc_number?: string | null
    metadata: Record<string, unknown>
  }) => {
    if (!doc) return
    setIsSaving(true)
    try {
      await apiFetch('/api/documents/' + id, {
        method: 'PATCH',
        json: {
          ...body,
          increment_version: true,
        },
      })
      const refreshed = await apiFetch<{ document: ApiDocument }>(
        '/api/documents/' + id
      )
      setDoc(refreshed.document)
      toast.success('Document updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveRfi = async () => {
    if (!doc || !rfi.title.trim() || !rfi.description.trim()) {
      toast.error('Title and description are required')
      return
    }
    const latest = getLatestVersion(doc.document_versions)
    const prevMeta = (latest?.metadata as Record<string, unknown>) ?? {}
    const descriptionBody = buildRfiDescriptionBody({
      reasonForRequest: rfi.reasonForRequest.trim(),
      question: rfi.question.trim(),
      description: rfi.description,
      notes: rfi.notes,
    })
    await savePatch({
      title: rfi.title,
      doc_number: rfi.number,
      description: descriptionBody,
      metadata: {
        ...prevMeta,
        rfiDate: rfi.date || undefined,
        question: rfi.question.trim() || undefined,
        reasonForRequest: rfi.reasonForRequest.trim() || undefined,
        notes: rfi.notes || undefined,
        attachments: toDocAttachments(attachments),
      },
    })
  }

  const handleSaveSubmittal = async () => {
    if (!doc || !sub.title.trim() || !sub.description.trim()) {
      toast.error('Title and description are required')
      return
    }
    const latest = getLatestVersion(doc.document_versions)
    const prevMeta = (latest?.metadata as Record<string, unknown>) ?? {}
    const descriptionBody = buildSubmittalDescriptionBody({
      description: sub.description,
      notes: sub.notes,
    })
    await savePatch({
      title: sub.title,
      doc_number: sub.number,
      description: descriptionBody,
      metadata: {
        ...prevMeta,
        submittalDate: sub.date || undefined,
        submittalType: sub.submittalType.trim() || undefined,
        specSection: sub.specSection || undefined,
        manufacturer: sub.manufacturer || undefined,
        productName: sub.productName || undefined,
        quantity: sub.quantity || undefined,
        modelNumber: sub.modelNumber.trim() || undefined,
        detailReferences: sub.detailReferences.trim() || undefined,
        drawingSheetNumbers: sub.drawingSheetNumbers.trim() || undefined,
        relatedRfiNumbers: sub.relatedRfiNumbers.trim() || undefined,
        notes: sub.notes || undefined,
        attachments: toDocAttachments(attachments),
      },
    })
  }

  const handleSaveCo = async () => {
    if (!doc || !co.title.trim() || !co.description.trim()) {
      toast.error('Title and description are required')
      return
    }

    setImpactErrors({})
    const impactValidation = validateChangeOrderImpact({
      schedule: co.schedule,
      baseline: co.baseline,
      cost: co.cost,
    })
    if (!impactValidation.ok) {
      setImpactErrors(impactValidation.errors)
      toast.error('Please review the schedule/cost impact fields.')
      const firstKey =
        (Object.keys(impactValidation.errors)[0] as keyof ChangeOrderImpactValidationErrors | undefined) ?? null
      const focusId =
        firstKey === 'scheduleDuration'
          ? 'co-schedule-duration'
          : firstKey === 'scheduleDayType'
            ? 'co-schedule-day-type'
            : firstKey === 'baselineDuration'
              ? 'co-baseline-duration'
              : firstKey === 'baselineDayType'
                ? 'co-baseline-day-type'
                : firstKey === 'costJustification'
                  ? 'co-cost-justification'
                  : firstKey === 'costAtLeastOne'
                    ? 'co-cost-labor'
                    : null
      if (focusId) {
        setTimeout(() => {
          const el = document.getElementById(focusId) as HTMLElement | null
          el?.focus?.()
        }, 0)
      }
      return
    }

    const html = buildChangeOrderHtml({
      coNumber: co.changeOrderNumber,
      date: co.date,
      projectName: selectedProject?.name ?? '',
      title: co.title,
      description: co.description,
      reasonLabel,
      cost: derived.costTotal,
      scheduleLabel,
      notes: co.notes,
    })

    await savePatch({
      title: co.title,
      doc_number: co.changeOrderNumber,
      description: html,
      metadata: {
        reason: reasonLabel,
        changeOrderNumber: co.changeOrderNumber,
        changeOrderDate: co.date,
        notes: co.notes || undefined,
        attachments: toDocAttachments(attachments),
        ...serializeChangeOrderImpactToMetadata({
          schedule: co.schedule,
          baseline: co.baseline,
          cost: co.cost,
          derived,
          originalContractAmount: co.originalContractAmount,
        }),
      },
    })
  }

  const handleSave = () => {
    if (docType === 'rfi') void handleSaveRfi()
    else if (docType === 'submittal') void handleSaveSubmittal()
    else void handleSaveCo()
  }

  const handleDelete = async () => {
    try {
      await apiFetch('/api/documents/' + id, { method: 'DELETE' })
      toast.success('Document deleted')
      router.push(`/documents?type=${docType}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  const handleViewPdfDetails = () => {
    if (openingPdfDetails) return
    setOpeningPdfDetails(true)
    const opened = window.open(`/api/documents/${id}/pdf`, '_blank', 'noopener,noreferrer')
    if (!opened) toast.error('Popup blocked. Please allow popups to view PDF details.')
    window.setTimeout(() => setOpeningPdfDetails(false), 600)
  }

  const handleExportPdf = () => {
    if (exportingPdf || !isDocFinal) return
    setExportingPdf(true)
    const opened = window.open(`/api/documents/${id}/pdf?download=1`, '_blank', 'noopener,noreferrer')
    if (!opened) toast.error('Popup blocked. Please allow popups to export PDF.')
    window.setTimeout(() => setExportingPdf(false), 600)
  }

  const handleGoSendForReview = useCallback(() => {
    router.push(`/documents/${id}/send-for-review`)
  }, [router, id])

  const handleCloseDocument = useCallback(async () => {
    if (closing) return
    if (!doc) return
    if (!canClose(canonicalDocType, canonicalStatus)) {
      toast.error('Document is already closed.')
      return
    }
    setClosing(true)
    try {
      const res = await apiFetch<{ document: ApiDocument }>(`/api/documents/${id}/close`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (res.document) setDoc(res.document)
      toast.success('Document closed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to close document')
    } finally {
      setClosing(false)
      setCloseDialogOpen(false)
    }
  }, [closing, doc, canonicalDocType, canonicalStatus, id])

  const pageTitle = useMemo(() => {
    if (!doc) return 'Document'
    if (doc.doc_type === 'rfi') return 'Edit RFI'
    if (doc.doc_type === 'submittal') return 'Edit Submittal'
    return 'Edit Change Order'
  }, [doc])

  if (loading || !doc) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Spinner className="size-8" />
        <p className="text-sm">Loading document...</p>
      </div>
    )
  }

  return (
    <div className="app-page">
      <div className="w-full">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between lg:mb-10">
          <div className="min-w-0 max-w-3xl">
            <h1 className="app-section-title">{pageTitle}</h1>
            <p className="app-section-subtitle text-base leading-relaxed">
              Update your document using the same structured workflow as document creation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {headerBadge ? (
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
                  statusBadgeClasses(headerBadge.tone)
                )}
              >
                {headerBadge.label}
              </span>
            ) : null}
            {isDocFinal ? (
              <Button onClick={handleExportPdf} disabled={exportingPdf} className="shrink-0 gap-2 rounded-xl px-4">
                <Download className="h-4 w-4" />
                {exportingPdf ? 'Exporting...' : 'Export to PDF'}
              </Button>
            ) : null}
            {isDocLocked ? null : (
              <Button
                type="button"
                onClick={handleGoSendForReview}
                className="shrink-0 gap-2 rounded-xl px-4"
                disabled={isSaving}
              >
                <Send className="h-4 w-4" />
                Send for Review
              </Button>
            )}
            {showCloseButton ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setCloseDialogOpen(true)}
                disabled={closing}
                className="shrink-0 gap-2 rounded-xl bg-white px-4 text-foreground hover:bg-muted"
              >
                <CheckCircle className="h-4 w-4" />
                {closing ? 'Closing...' : 'Close'}
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="shrink-0 gap-2 rounded-xl bg-white px-4 text-foreground hover:bg-muted"
              asChild
            >
              <Link href={`/documents?type=${doc.doc_type}`}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
          </div>
        </div>

        <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
          <AlertDialogContent className="max-w-lg rounded-2xl border border-slate-200 bg-white p-0 shadow-xl">
            <AlertDialogHeader className="space-y-0">
              <div className="rounded-t-2xl bg-slate-900 px-6 py-5 text-white">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <AlertDialogTitle className="text-lg font-semibold text-white">
                      Close this document?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="mt-1 text-sm text-slate-200">
                      Closing will mark this document as{' '}
                      <span className="font-semibold text-white">Closed</span> for everyone. Reviewers
                      will no longer be able to respond using their links.
                    </AlertDialogDescription>
                  </div>
                </div>
              </div>
            </AlertDialogHeader>

            <div className="px-6 py-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm text-slate-700">
                  You can still export the PDF and view activity history after closing.
                </p>
              </div>
            </div>

            <AlertDialogFooter className="gap-2 border-t border-slate-100 px-6 py-4">
              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  void handleCloseDocument()
                }}
                className="rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                disabled={closing}
              >
                {closing ? 'Closing…' : 'Close document'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="grid grid-cols-1 gap-6 md:gap-7 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 space-y-6">
            <Tabs
              value={mainTab}
              onValueChange={(v) => setMainTab(v as 'details' | 'activity')}
              className="w-full min-w-0"
            >
              <TabsList className="mb-1 flex h-auto min-h-11 w-full flex-wrap gap-1 rounded-xl bg-muted p-1.5 text-foreground shadow-none">
                <TabsTrigger
                  value="details"
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold text-foreground shadow-none transition-all data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground"
                >
                  Details
                </TabsTrigger>
                <TabsTrigger
                  value="activity"
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold text-foreground shadow-none transition-all data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground"
                >
                  Activity
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-5 space-y-6 outline-none">
            <div className={formCardClassName()}>
              <div className="grid gap-5 sm:grid-cols-3">
                <div className="min-w-0 sm:col-span-1">
                  <label className={capLabel}>Project</label>
                  <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
                    {selectedProject?.name ?? '—'}
                  </div>
                  {selectedProject?.address ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">{selectedProject.address}</p>
                  ) : null}
                </div>
                <div>
                  <label className={capLabel}>
                    {docType === 'rfi'
                      ? 'RFI number'
                      : docType === 'submittal'
                        ? 'Submittal number'
                        : 'Change order number'}{' '}
                    <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={
                      docType === 'rfi'
                        ? rfi.number
                        : docType === 'submittal'
                          ? sub.number
                          : co.changeOrderNumber
                    }
                    onChange={(e) => {
                      if (docType === 'rfi') setRfi((p) => ({ ...p, number: e.target.value }))
                      else if (docType === 'submittal') setSub((p) => ({ ...p, number: e.target.value }))
                      else setCo((p) => ({ ...p, changeOrderNumber: e.target.value }))
                    }}
                  />
                </div>
                <div>
                  <label className={capLabel}>
                    Document date <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="date"
                    value={docType === 'rfi' ? rfi.date : docType === 'submittal' ? sub.date : co.date}
                    onChange={(e) => {
                      if (docType === 'rfi') setRfi((p) => ({ ...p, date: e.target.value }))
                      else if (docType === 'submittal') setSub((p) => ({ ...p, date: e.target.value }))
                      else setCo((p) => ({ ...p, date: e.target.value }))
                    }}
                  />
                </div>
              </div>
            </div>

            <div className={formCardClassName()}>
              {docType === 'rfi' ? (
                <div className="mb-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <label className={capLabel}>
                        RFI title <span className="text-destructive">*</span>
                      </label>
                      <Input
                        value={rfi.title}
                        onChange={(e) => setRfi((p) => ({ ...p, title: e.target.value }))}
                      />
                    </div>
                    <div className="w-full shrink-0 space-y-2 sm:w-[min(22rem,40%)] sm:max-w-md">
                      <label className={capLabel}>Reason for request</label>
                      <Input
                        value={rfi.reasonForRequest}
                        onChange={(e) => setRfi((p) => ({ ...p, reasonForRequest: e.target.value }))}
                        placeholder="e.g., Drawing conflict, omitted scope..."
                        className="h-8 w-full text-xs"
                      />
                    </div>
                  </div>
                  <p className={cn(hintClass, 'mt-2')}>Shown in the RFI PDF summary alongside the title.</p>
                </div>
              ) : docType === 'submittal' ? (
                <div className="mb-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <label className={capLabel}>
                        Submittal title <span className="text-destructive">*</span>
                      </label>
                      <Input
                        value={sub.title}
                        onChange={(e) => setSub((p) => ({ ...p, title: e.target.value }))}
                        placeholder="e.g., Hollow Metal Doors — Series 4500 Submittal Package"
                      />
                    </div>
                    <div className="w-full shrink-0 space-y-2 sm:w-[min(22rem,40%)] sm:max-w-md">
                      <label className={capLabel}>Submittal type</label>
                      <Input
                        value={sub.submittalType}
                        onChange={(e) => setSub((p) => ({ ...p, submittalType: e.target.value }))}
                        placeholder="e.g., Shop Drawing, Product Data"
                        className="h-8 w-full text-xs"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-6">
                  <label className={capLabel}>
                    Change order title <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={co.title}
                    onChange={(e) => setCo((p) => ({ ...p, title: e.target.value }))}
                  />
                </div>
              )}

              <div className="mb-3 flex items-center justify-between gap-3">
                <span className={capLabelRow}>
                  {docType === 'rfi'
                    ? 'Description / Question'
                    : docType === 'change_order'
                      ? 'Description of Change'
                      : 'Description'}
                  <span className="text-destructive"> *</span>
                </span>
              </div>
              <MissingScopeEditorSection
                variant="document-description"
                documentApiType={docTypeToMissingScopeType(docType)}
                value={docType === 'rfi' ? rfi.description : docType === 'submittal' ? sub.description : co.description}
                onChange={(v) => {
                  if (docType === 'rfi') setRfi((p) => ({ ...p, description: v }))
                  else if (docType === 'submittal') setSub((p) => ({ ...p, description: v }))
                  else setCo((p) => ({ ...p, description: v }))
                }}
                aiNotes={docType === 'rfi' ? rfi.notes : docType === 'submittal' ? sub.notes : co.notes}
                rows={8}
              />
              <p className={hintClass}>
                {(docType === 'rfi' ? rfi.description : docType === 'submittal' ? sub.description : co.description).length}{' '}
                characters
              </p>
            </div>

            {docType === 'submittal' ? (
              <div className={formCardClassName()}>
                <h2 className="mb-5 text-lg font-semibold text-foreground">Submittal details</h2>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className={capLabel}>Spec section</label>
                    <Input
                      value={sub.specSection}
                      onChange={(e) => setSub((p) => ({ ...p, specSection: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={capLabel}>Manufacturer</label>
                    <Input
                      value={sub.manufacturer}
                      onChange={(e) => setSub((p) => ({ ...p, manufacturer: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={capLabel}>Product name</label>
                    <Input
                      value={sub.productName}
                      onChange={(e) => setSub((p) => ({ ...p, productName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={capLabel}>Quantity</label>
                    <Input
                      value={sub.quantity}
                      onChange={(e) => setSub((p) => ({ ...p, quantity: e.target.value }))}
                      placeholder="e.g., 4"
                    />
                  </div>
                  <div>
                    <label className={capLabel}>Model number(s)</label>
                    <Input
                      value={sub.modelNumber}
                      onChange={(e) => setSub((p) => ({ ...p, modelNumber: e.target.value }))}
                      placeholder="e.g., 601T"
                    />
                  </div>
                  <div>
                    <label className={capLabel}>Detail reference(s)</label>
                    <Input
                      value={sub.detailReferences}
                      onChange={(e) => setSub((p) => ({ ...p, detailReferences: e.target.value }))}
                      placeholder="e.g., A/S-502"
                    />
                  </div>
                  <div>
                    <label className={capLabel}>Drawing/sheet number(s)</label>
                    <Input
                      value={sub.drawingSheetNumbers}
                      onChange={(e) => setSub((p) => ({ ...p, drawingSheetNumbers: e.target.value }))}
                      placeholder="e.g., A-101"
                    />
                  </div>
                  <div>
                    <label className={capLabel}>Related RFI number(s)</label>
                    <Input
                      value={sub.relatedRfiNumbers}
                      onChange={(e) => setSub((p) => ({ ...p, relatedRfiNumbers: e.target.value }))}
                      placeholder="e.g., RFI-014"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {docType === 'change_order' ? (
              <div className={formCardClassName()}>
                <div className="border-b border-border pb-6">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">Change details</h2>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Set the reason, then capture schedule extension, project baseline length, and cost categories. Totals
                    below update automatically.
                  </p>
                </div>

                <div className="mt-6 max-w-xl">
                  <label className={capLabel}>Reason for change</label>
                  <Select value={co.reason} onValueChange={(v) => setCo((p) => ({ ...p, reason: v }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CO_REASON_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-8">
                  <p className={capLabel}>Impacts</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Three independent blocks — validate and save separately.
                  </p>
                  <div className="mt-5 grid gap-5 lg:grid-cols-3 lg:items-stretch">
                    <CoImpactCardShell
                      accentBorder="border-t-[3px] border-t-sky-500"
                      iconBg="bg-sky-500/10"
                      iconClass="text-sky-700 dark:text-sky-400"
                      icon={<CalendarClock aria-hidden />}
                      title="Schedule impact"
                      description="Extension to the schedule from this change order (optional)."
                      footer={
                        <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">
                          {!co.schedule.enabled ? (
                            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-foreground">
                              No schedule extension
                            </span>
                          ) : scheduleComputed.valid ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-800 dark:text-emerald-300">
                              Equivalent · {derived.scheduleDaysTotal} calendar day
                              {derived.scheduleDaysTotal === 1 ? '' : 's'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-900 dark:text-amber-200">
                              Enter duration
                              {co.schedule.unit === 'days' ? ' and day type' : ''} to see equivalent days
                            </span>
                          )}
                        </p>
                      }
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setCo((p) => ({ ...p, schedule: { ...p.schedule, enabled: true } }))}
                          className={cn(
                            'h-10 rounded-lg border text-sm font-semibold transition-colors',
                            co.schedule.enabled
                              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                              : 'border-border bg-background text-foreground hover:bg-muted'
                          )}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCo((p) => ({
                              ...p,
                              schedule: { enabled: false, duration: '', unit: 'days', dayType: '' },
                            }))
                          }
                          className={cn(
                            'h-10 rounded-lg border text-sm font-semibold transition-colors',
                            !co.schedule.enabled
                              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                              : 'border-border bg-background text-foreground hover:bg-muted'
                          )}
                        >
                          No
                        </button>
                      </div>

                      {co.schedule.enabled ? (
                        <div className="mt-4 space-y-3">
                          <div>
                            <label className={capLabel}>Duration</label>
                            <Input
                              id="co-schedule-duration"
                              inputMode="numeric"
                              value={co.schedule.duration}
                              onChange={(e) => {
                                setImpactErrors((p) => ({ ...p, scheduleDuration: undefined }))
                                setCo((p) => ({ ...p, schedule: { ...p.schedule, duration: e.target.value } }))
                              }}
                              placeholder="Whole number, e.g. 5"
                            />
                            {impactErrors.scheduleDuration ? (
                              <p className="mt-1 text-xs text-destructive">{impactErrors.scheduleDuration}</p>
                            ) : null}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={capLabel}>Unit</label>
                              <Select
                                value={co.schedule.unit}
                                onValueChange={(v) =>
                                  setCo((p) => ({
                                    ...p,
                                    schedule: {
                                      ...p.schedule,
                                      unit: v === 'weeks' ? 'weeks' : 'days',
                                      dayType: v === 'weeks' ? '' : p.schedule.dayType,
                                    },
                                  }))
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="days">Days</SelectItem>
                                  <SelectItem value="weeks">Weeks</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {co.schedule.unit === 'days' ? (
                              <div>
                                <label className={capLabel}>Day type</label>
                                <Select
                                  value={co.schedule.dayType}
                                  onValueChange={(v) => {
                                    setImpactErrors((p) => ({ ...p, scheduleDayType: undefined }))
                                    setCo((p) => ({
                                      ...p,
                                      schedule: {
                                        ...p.schedule,
                                        dayType: v === 'business' ? 'business' : v === 'calendar' ? 'calendar' : '',
                                      },
                                    }))
                                  }}
                                >
                                  <SelectTrigger className="w-full" id="co-schedule-day-type">
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="calendar">Calendar</SelectItem>
                                    <SelectItem value="business">Business</SelectItem>
                                  </SelectContent>
                                </Select>
                                {impactErrors.scheduleDayType ? (
                                  <p className="mt-1 text-xs text-destructive">{impactErrors.scheduleDayType}</p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </CoImpactCardShell>

                    <CoImpactCardShell
                      accentBorder="border-t-[3px] border-t-muted-foreground"
                      iconBg="bg-muted"
                      iconClass="text-foreground"
                      icon={<Timer aria-hidden />}
                      title="Original project duration"
                      description="Baseline length before this change order. Used with schedule impact for revised duration."
                      footer={
                        <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">
                          {baselineComputed.valid ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-800 dark:text-emerald-300">
                              Baseline · {derived.baselineDaysTotal} calendar day
                              {derived.baselineDaysTotal === 1 ? '' : 's'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-900 dark:text-amber-200">
                              Enter a numeric duration
                              {co.baseline.unit === 'days' ? ' and day type' : ''}
                            </span>
                          )}
                        </p>
                      }
                    >
                      <div className="space-y-3">
                        <div>
                          <label className={capLabel}>Duration</label>
                          <Input
                            id="co-baseline-duration"
                            inputMode="numeric"
                            value={co.baseline.value}
                            onChange={(e) => {
                              setImpactErrors((p) => ({ ...p, baselineDuration: undefined }))
                              setCo((p) => ({ ...p, baseline: { ...p.baseline, value: e.target.value } }))
                            }}
                            placeholder="Whole number, e.g. 240"
                          />
                          {impactErrors.baselineDuration ? (
                            <p className="mt-1 text-xs text-destructive">{impactErrors.baselineDuration}</p>
                          ) : null}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={capLabel}>Unit</label>
                            <Select
                              value={co.baseline.unit}
                              onValueChange={(v) =>
                                setCo((p) => ({
                                  ...p,
                                  baseline: {
                                    ...p.baseline,
                                    unit: v === 'weeks' ? 'weeks' : 'days',
                                    dayType: v === 'weeks' ? '' : p.baseline.dayType,
                                  },
                                }))
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="days">Days</SelectItem>
                                <SelectItem value="weeks">Weeks</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {co.baseline.unit === 'days' ? (
                            <div>
                              <label className={capLabel}>Day type</label>
                              <Select
                                value={co.baseline.dayType}
                                onValueChange={(v) => {
                                  setImpactErrors((p) => ({ ...p, baselineDayType: undefined }))
                                  setCo((p) => ({
                                    ...p,
                                    baseline: {
                                      ...p.baseline,
                                      dayType:
                                        v === 'business' ? 'business' : v === 'calendar' ? 'calendar' : '',
                                    },
                                  }))
                                }}
                              >
                                <SelectTrigger className="w-full" id="co-baseline-day-type">
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="calendar">Calendar</SelectItem>
                                  <SelectItem value="business">Business</SelectItem>
                                </SelectContent>
                              </Select>
                              {impactErrors.baselineDayType ? (
                                <p className="mt-1 text-xs text-destructive">{impactErrors.baselineDayType}</p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </CoImpactCardShell>

                    <CoImpactCardShell
                      accentBorder="border-t-[3px] border-t-[#f97316]"
                      iconBg="bg-orange-500/10"
                      iconClass="text-orange-700 dark:text-orange-400"
                      icon={<CircleDollarSign aria-hidden />}
                      title="Cost impact"
                      description="Category amounts and optional markup. Credits show as totals in parentheses."
                    >
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {(
                          [
                            { value: 'increase', label: 'Increase' },
                            { value: 'decrease', label: 'Decrease' },
                            { value: 'none', label: 'No cost' },
                          ] as const
                        ).map((opt) => {
                          const active = co.cost.type === opt.value
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() =>
                                setCo((p) => ({
                                  ...p,
                                  cost: {
                                    ...p.cost,
                                    type: opt.value,
                                    ...(opt.value === 'none'
                                      ? {
                                          labor: '',
                                          materials: '',
                                          equipment: '',
                                          subcontractor: '',
                                          other: '',
                                          markupPercent: '',
                                        }
                                      : { justificationNote: '' }),
                                  },
                                }))
                              }
                              className={cn(
                                'min-h-[2.75rem] rounded-lg border px-2 py-2 text-center text-[11px] font-semibold leading-tight transition-colors sm:text-xs',
                                active
                                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                                  : 'border-border bg-background text-foreground hover:bg-muted'
                              )}
                            >
                              {opt.value === 'decrease' ? (
                                <>
                                  Decrease
                                  <span className="mt-0.5 block text-[10px] font-normal opacity-90">
                                    (credit)
                                  </span>
                                </>
                              ) : (
                                opt.label
                              )}
                            </button>
                          )
                        })}
                      </div>

                      {co.cost.type === 'none' ? (
                        <div className="mt-4">
                          <label className={capLabel}>
                            Justification <span className="text-destructive">*</span>
                          </label>
                          <Textarea
                            id="co-cost-justification"
                            value={co.cost.justificationNote}
                            onChange={(e) => {
                              setImpactErrors((p) => ({ ...p, costJustification: undefined }))
                              setCo((p) => ({ ...p, cost: { ...p.cost, justificationNote: e.target.value } }))
                            }}
                            rows={4}
                            className="resize-none"
                            placeholder="Explain why there is no cost impact..."
                          />
                          {impactErrors.costJustification ? (
                            <p className="mt-1 text-xs text-destructive">{impactErrors.costJustification}</p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-4 space-y-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            {(
                              [
                                { key: 'labor', label: 'Labor' },
                                { key: 'materials', label: 'Materials' },
                                { key: 'equipment', label: 'Equipment' },
                                { key: 'subcontractor', label: 'Subcontractors' },
                                { key: 'other', label: 'Other' },
                              ] as const
                            ).map((row, idx) => (
                              <div key={row.key}>
                                <label className={capLabel}>{row.label}</label>
                                <div className="relative">
                                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                    $
                                  </span>
                                  <Input
                                    id={idx === 0 ? 'co-cost-labor' : undefined}
                                    inputMode="decimal"
                                    value={co.cost[row.key]}
                                    onChange={(e) => {
                                      setImpactErrors((p) => ({ ...p, costAtLeastOne: undefined }))
                                      setCo((p) => ({
                                        ...p,
                                        cost: { ...p.cost, [row.key]: e.target.value } as any,
                                      }))
                                    }}
                                    className="pl-7 pr-14"
                                    placeholder="0.00"
                                  />
                                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                    USD
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div>
                            <label className={capLabel}>Markup % (optional)</label>
                            <Input
                              inputMode="decimal"
                              value={co.cost.markupPercent}
                              onChange={(e) =>
                                setCo((p) => ({ ...p, cost: { ...p.cost, markupPercent: e.target.value } }))
                              }
                              placeholder="e.g. 10"
                            />
                          </div>

                          {impactErrors.costAtLeastOne ? (
                            <p className="text-xs text-destructive">{impactErrors.costAtLeastOne}</p>
                          ) : null}

                          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3.5">
                            <div className="flex items-baseline justify-between gap-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                Subtotal
                              </p>
                              <p className="font-mono text-sm font-bold tabular-nums text-foreground">
                                ${formatUsd(derived.costSubtotal)}
                              </p>
                            </div>
                            <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                Total impact
                              </p>
                              <p className="font-mono text-base font-bold tabular-nums text-[#f97316]">
                                {formatSignedUsd(derived.costTotal, co.cost.type)}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </CoImpactCardShell>
                  </div>
                </div>

                <div className="mt-10 rounded-2xl border border-border bg-gradient-to-b from-muted/50 to-muted/30 p-6">
                  <p className={capLabel}>Contract & duration snapshot</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Read-only totals derived from contract amount and impacts above — useful for PDFs and reviewers.
                  </p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
                      <label className={capLabel}>Original contract amount</label>
                      <div className="relative mt-2">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          $
                        </span>
                        <Input
                          value={co.originalContractAmount}
                          onChange={(e) =>
                            setCo((p) => ({ ...p, originalContractAmount: e.target.value }))
                          }
                          className="pl-7 pr-14"
                          placeholder="0.00"
                          inputMode="decimal"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          USD
                        </span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
                      <label className={capLabel}>Revised contract amount</label>
                      <div className="mt-2 flex min-h-[2.75rem] items-center rounded-lg border border-border bg-muted/50 px-3 font-mono text-sm font-semibold tabular-nums text-foreground">
                        {derived.revisedContractAmount === null
                          ? '—'
                          : `$${formatUsd(derived.revisedContractAmount)}`}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
                      <label className={capLabel}>Original duration (normalized)</label>
                      <div className="mt-2 flex min-h-[2.75rem] items-center rounded-lg border border-border bg-muted/50 px-3 text-sm font-medium tabular-nums text-foreground">
                        {derived.baselineDaysTotal
                          ? `${derived.baselineDaysTotal} calendar days`
                          : '—'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
                      <label className={capLabel}>Revised duration (normalized)</label>
                      <div className="mt-2 flex min-h-[2.75rem] items-center rounded-lg border border-border bg-muted/50 px-3 text-sm font-medium tabular-nums text-foreground">
                        {derived.revisedDaysTotal === null
                          ? '—'
                          : `${derived.revisedDaysTotal} calendar days`}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className={formCardClassName()}>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">Supporting documents</h2>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'copy'
                }}
                onDrop={onDrop}
                className={cn(
                  'mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/55 p-10 transition-colors hover:border-muted-foreground/60 hover:bg-muted'
                )}
              >
                <Upload className="mb-3 h-10 w-10 text-muted-foreground" strokeWidth={1.25} />
                <p className="text-center text-sm font-medium text-foreground/80">
                  Drag and drop files or{' '}
                  <span className="font-semibold text-foreground underline decoration-border underline-offset-2">
                    browse files
                  </span>{' '}
                  from your computer
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileUpload}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              />
              <div className="space-y-2">
                {attachments.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{file.size}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(file.id)}
                      className="rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive/10"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className={formCardClassName()}>
              <label className={capLabel}>Additional notes (optional)</label>
              <Textarea
                value={docType === 'rfi' ? rfi.notes : docType === 'submittal' ? sub.notes : co.notes}
                onChange={(e) => {
                  if (docType === 'rfi') setRfi((p) => ({ ...p, notes: e.target.value }))
                  else if (docType === 'submittal') setSub((p) => ({ ...p, notes: e.target.value }))
                  else setCo((p) => ({ ...p, notes: e.target.value }))
                }}
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-end">
              <Button variant="outline" onClick={handleDelete} className="gap-2 text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
              </TabsContent>

              <TabsContent value="activity" className="mt-4 outline-none">
                <DocumentActivityPanel documentId={id} />
              </TabsContent>
            </Tabs>
          </div>

          <aside className="w-full min-w-0 space-y-6 lg:sticky lg:top-6 lg:self-start">
            {docType === 'change_order' ? (
              <div className={formCardClassName()}>
                <h3 className="mb-5 text-lg font-semibold text-foreground">Categorization</h3>
                <div className="space-y-4">
                  <div>
                    <label className={capLabel}>Reason</label>
                    <p className="text-sm font-medium text-foreground">{reasonLabel}</p>
                  </div>
                  <div className="border-t border-border pt-4">
                    <label className={capLabel}>Schedule impact</label>
                    <p className="text-sm font-medium text-foreground">{scheduleLabel}</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className={formCardClassName()}>
              <h3 className="mb-5 text-lg font-semibold text-foreground">Summary</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  {headerBadge ? (
                    <span
                      className={cn(
                        'mt-1 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
                        statusBadgeClasses(headerBadge.tone)
                      )}
                    >
                      {headerBadge.label}
                    </span>
                  ) : (
                    <p className="text-sm font-semibold text-foreground">—</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Project</p>
                  <p className="text-sm font-semibold text-foreground">{selectedProject?.name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{selectedProject?.address ?? ''}</p>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">
                    {docType === 'change_order' ? 'Change Order #' : docType === 'rfi' ? 'RFI #' : 'Submittal #'}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {docType === 'change_order' ? co.changeOrderNumber : docType === 'rfi' ? rfi.number : sub.number}
                  </p>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">Title</p>
                  <p className="text-sm font-semibold text-foreground">
                    {docType === 'change_order'
                      ? co.title || '—'
                      : docType === 'rfi'
                        ? rfi.title || '—'
                        : sub.title || '—'}
                  </p>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">PDF</p>
                  <div className="mt-2 flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleViewPdfDetails}
                      disabled={openingPdfDetails}
                      className="w-full justify-start gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      {openingPdfDetails ? 'Opening PDF...' : 'View PDF Details'}
                    </Button>
                  </div>
                </div>
                {docType === 'change_order' ? (
                  <>
                    <div className="border-t border-border pt-4">
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p className="text-sm font-semibold text-foreground">
                        {co.date
                          ? new Date(co.date + 'T12:00:00').toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </p>
                    </div>
                    <div className="border-t border-border pt-4">
                      <p className="text-xs text-muted-foreground">Cost Impact</p>
                      <p className="text-sm font-semibold text-foreground">
                        {co.cost.type === 'none' ? '—' : formatSignedUsd(derived.costTotal, co.cost.type)}
                      </p>
                    </div>
                    <div className="border-t border-border pt-4">
                      <p className="text-xs text-muted-foreground">Schedule Impact</p>
                      <p className="text-sm font-semibold text-foreground">{scheduleLabel}</p>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {docType === 'change_order' ? (
              <div className="app-surface relative overflow-hidden rounded-xl">
                <div
                  className="aspect-[4/3] bg-cover bg-center bg-no-repeat"
                  style={{
                    backgroundImage:
                      "url('https://lh3.googleusercontent.com/aida-public/AB6AXuD7_4vd9OR1EKDJrX4T4pU1yOiptI0UoYbbOj4vqoVlL2cp6BJs173PepMwegslSa7ee1TNhCyjvXkiUUuL_PuNaxYgDwpRZ0TxEEn4NB7oKeW8ql6vx0K1FXp1eLA9iAI3P4R2b_HoBBmqCRTbBkmL2XsW7HHZWjryVmWG9mrQfD1c4WuCt-r2kwYqSfqc77yaaGEQSiKQhbm5-5c1i_P2TL-OpAedYi3Bw-VvmEauxJOLSm2bPWzsD5_bDiT-1yojYmMWyNu58d4')",
                  }}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">
                    Reference context
                  </p>
                  <p className="mt-1 text-xl font-bold tracking-tight">Coordination Zone</p>
                  <p className="mt-1 text-xs text-white/70">
                    Attach sketches and photos to speed up reviewer approval.
                  </p>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  )
}
