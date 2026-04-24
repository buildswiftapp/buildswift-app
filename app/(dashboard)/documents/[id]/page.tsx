'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Download,
  Eye,
  Save,
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
  scheduleImpactValueToInputText,
} from '@/lib/document-html'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { MissingScopeEditorSection } from '@/app/components/missing-scope-editor-section'
import { docTypeToMissingScopeType, setMissingScopeSeedIfMissing } from '@/lib/missing-scope-client'
import { ReviewerManagementSection } from '@/app/components/reviewer-management-section'
import type { Attachment as DocAttachment } from '@/lib/types'

const PAGE_BG = '#f1f5f9'
const NAVY = '#0f172a'
const capLabel = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]'
const capLabelRow = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]'

function formCardClassName(extra?: string) {
  return cn(
    'rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:p-6 lg:p-7 xl:p-8',
    extra
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
  internal_status: string
  external_status: string
  doc_number: string | null
  title: string
  description: string
  document_versions: ApiDocVersion[]
  attachments?: Array<{ id: string; file_name: string; size_bytes: number | null }>
}
type AiGenerateResponse = { generatedContent: string }

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
    description: '',
    notes: '',
  })
  const [sub, setSub] = useState({
    number: '',
    title: '',
    date: '',
    specSection: '',
    manufacturer: '',
    productName: '',
    description: '',
    notes: '',
  })
  const [co, setCo] = useState({
    changeOrderNumber: '',
    date: '',
    title: '',
    description: '',
    reason: 'owner_request',
    costImpact: '0',
    scheduleNoImpact: true,
    scheduleImpactText: '',
    notes: '',
  })
  const [attachments, setAttachments] = useState<LocalAttachment[]>([])

  const [isSaving, setIsSaving] = useState(false)
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false)
  const [openingPdfDetails, setOpeningPdfDetails] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

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
            costImpact: s.costImpact,
            scheduleNoImpact: s.scheduleImpact === 'none',
            scheduleImpactText: scheduleImpactValueToInputText(s.scheduleImpact),
            notes: s.notes,
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
  const scheduleLabel = co.scheduleNoImpact
    ? 'No Impact'
    : co.scheduleImpactText.trim() || '—'
  const costNumeric = parseMoneyInput(co.costImpact)

  const hintClass = 'mt-1.5 text-xs text-[#64748b]'
  const normalizedStatus =
    doc?.internal_status === 'in_review' || doc?.internal_status === 'pending_reviewer'
      ? 'pending_review'
      : doc?.internal_status === 'revising'
        ? 'revision_requested'
        : doc?.internal_status ?? 'draft'
  const finalStatusLabel =
    normalizedStatus === 'approved'
      ? docType === 'rfi'
        ? 'Answered'
        : docType === 'change_order'
          ? 'Approved as Noted'
          : 'Approved'
      : normalizedStatus === 'rejected'
        ? docType === 'submittal' || docType === 'change_order'
          ? 'Revise and Resubmit'
          : 'Rejected'
        : null

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
        specSection: sub.specSection || undefined,
        manufacturer: sub.manufacturer || undefined,
        productName: sub.productName || undefined,
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
    const html = buildChangeOrderHtml({
      coNumber: co.changeOrderNumber,
      date: co.date,
      projectName: selectedProject?.name ?? '',
      title: co.title,
      description: co.description,
      reasonLabel,
      cost: costNumeric,
      scheduleLabel,
      notes: co.notes,
    })
    await savePatch({
      title: co.title,
      doc_number: co.changeOrderNumber,
      description: html,
      metadata: {
        reason: reasonLabel,
        proposedAmount: costNumeric,
        changeOrderNumber: co.changeOrderNumber,
        changeOrderDate: co.date,
        scheduleImpact: scheduleLabel,
        notes: co.notes || undefined,
        attachments: toDocAttachments(attachments),
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

  const handleGenerateDescription = async () => {
    const currentDescription =
      docType === 'rfi' ? rfi.description : docType === 'submittal' ? sub.description : co.description
    const trimmedDescription = currentDescription.trim()
    if (!trimmedDescription) {
      toast.error('Enter an initial description before generating with AI')
      return
    }
    setMissingScopeSeedIfMissing(docTypeToMissingScopeType(docType), trimmedDescription)

    setIsGeneratingDescription(true)
    try {
      const data = await apiFetch<AiGenerateResponse>('/api/ai/generate', {
        method: 'POST',
        json: {
          documentType: docType === 'rfi' ? 'RFI' : docType === 'submittal' ? 'Submittal' : 'ChangeOrder',
          description: trimmedDescription,
        },
      })
      const generated = data.generatedContent?.trim()
      if (!generated) {
        toast.error('AI generation temporarily unavailable. Please try again.')
        return
      }

      if (docType === 'rfi') setRfi((p) => ({ ...p, description: generated }))
      else if (docType === 'submittal') setSub((p) => ({ ...p, description: generated }))
      else setCo((p) => ({ ...p, description: generated }))
      toast.success('Description generated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI generation temporarily unavailable. Please try again.')
    } finally {
      setIsGeneratingDescription(false)
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
    if (exportingPdf || normalizedStatus !== 'approved') return
    setExportingPdf(true)
    const opened = window.open(`/api/documents/${id}/pdf?download=1`, '_blank', 'noopener,noreferrer')
    if (!opened) toast.error('Popup blocked. Please allow popups to export PDF.')
    window.setTimeout(() => setExportingPdf(false), 600)
  }

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
    <div
      className="min-h-full w-full px-3 py-6 sm:px-4 sm:py-7 lg:px-6 lg:py-8 xl:px-8 2xl:px-10"
      style={{ backgroundColor: PAGE_BG }}
    >
      <div className="mx-auto w-full max-w-[min(100%,1920px)]">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between lg:mb-10">
          <div className="min-w-0 max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight text-[#0f172a]">{pageTitle}</h1>
            <p className="mt-2 text-base leading-relaxed text-[#64748b]">
              Update your document using the same structured workflow as document creation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {finalStatusLabel ? (
              <span
                className={cn(
                  'inline-flex items-center rounded-md px-3 py-1 text-xs font-semibold',
                  normalizedStatus === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                )}
              >
                {finalStatusLabel}
              </span>
            ) : null}
            <Button
              variant="outline"
              className="shrink-0 gap-2 rounded-lg border-[#e2e8f0] bg-white px-4 text-[#0f172a] shadow-sm hover:bg-[#f8fafc]"
              asChild
            >
              <Link href={`/documents?type=${doc.doc_type}`}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:gap-7 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 space-y-6">
            <div className={formCardClassName()}>
              <div className="grid gap-5 sm:grid-cols-3">
                <div className="min-w-0 sm:col-span-1">
                  <label className={capLabel}>Project</label>
                  <div className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-sm text-[#0f172a]">
                    {selectedProject?.name ?? '—'}
                  </div>
                  {selectedProject?.address ? (
                    <p className="mt-1.5 text-xs text-[#94a3b8]">{selectedProject.address}</p>
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
              <div className="mb-6">
                <label className={capLabel}>
                  {docType === 'change_order' ? 'Change order title' : docType === 'rfi' ? 'RFI title' : 'Submittal title'}{' '}
                  <span className="text-destructive">*</span>
                </label>
                <Input
                  value={docType === 'rfi' ? rfi.title : docType === 'submittal' ? sub.title : co.title}
                  onChange={(e) => {
                    if (docType === 'rfi') setRfi((p) => ({ ...p, title: e.target.value }))
                    else if (docType === 'submittal') setSub((p) => ({ ...p, title: e.target.value }))
                    else setCo((p) => ({ ...p, title: e.target.value }))
                  }}
                />
              </div>

              <div className="mb-3 flex items-center justify-between gap-3">
                <span className={capLabelRow}>
                  {docType === 'rfi'
                    ? 'Description / Question'
                    : docType === 'change_order'
                      ? 'Description of Change'
                      : 'Description'}
                </span>
                <button
                  type="button"
                  onClick={() => void handleGenerateDescription()}
                  disabled={isGeneratingDescription}
                  className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[#0f172a] transition-colors hover:text-[#334155] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/25 focus-visible:ring-offset-2"
                >
                  <span className="text-[#ca8a04]" aria-hidden>
                    ✨
                  </span>
                  AI Generate Description
                </button>
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
                isGeneratingDescription={isGeneratingDescription}
                rows={8}
              />
              <p className={hintClass}>
                {(docType === 'rfi' ? rfi.description : docType === 'submittal' ? sub.description : co.description).length}{' '}
                characters
              </p>
            </div>

            {docType === 'submittal' ? (
              <div className={formCardClassName()}>
                <h2 className="mb-5 text-lg font-semibold text-[#0f172a]">Submittal details</h2>
                <div className="grid gap-5 sm:grid-cols-3">
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
                </div>
              </div>
            ) : null}

            {docType === 'change_order' ? (
              <div className={formCardClassName()}>
                <h2 className="mb-5 text-lg font-semibold text-[#0f172a]">Change details</h2>
                <div className="grid gap-5 sm:grid-cols-3">
                  <div>
                    <label className={capLabel}>Reason for change</label>
                    <Select value={co.reason} onValueChange={(v) => setCo((p) => ({ ...p, reason: v }))}>
                      <SelectTrigger>
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
                  <div>
                    <label className={capLabel}>Cost impact</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                      <Input
                        value={co.costImpact}
                        onChange={(e) => setCo((p) => ({ ...p, costImpact: e.target.value }))}
                        className="pl-7 pr-14"
                        placeholder="8,750.00"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        USD
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className={capLabel}>Schedule impact</label>
                    <div className="flex min-h-10 items-center gap-3">
                      <label
                        htmlFor="co-schedule-no-impact"
                        className="flex shrink-0 cursor-pointer items-center gap-2 text-sm whitespace-nowrap text-[#0f172a]"
                      >
                        <Checkbox
                          checked={co.scheduleNoImpact}
                          onCheckedChange={(checked) =>
                            setCo((p) => ({ ...p, scheduleNoImpact: checked === true }))
                          }
                          id="co-schedule-no-impact"
                        />
                        <span>No Impact</span>
                      </label>
                      <Input
                        className="min-w-0 flex-1"
                        value={co.scheduleImpactText}
                        onChange={(e) => setCo((p) => ({ ...p, scheduleImpactText: e.target.value }))}
                        disabled={co.scheduleNoImpact}
                        placeholder="+ 5 days"
                        aria-label="Schedule impact description"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className={formCardClassName()}>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[#0f172a]">Supporting documents</h2>
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
                  'mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#cbd5e1] bg-[#f8fafc] p-10 transition-colors hover:border-[#94a3b8] hover:bg-[#f1f5f9]'
                )}
              >
                <Upload className="mb-3 h-10 w-10 text-[#94a3b8]" strokeWidth={1.25} />
                <p className="text-center text-sm font-medium text-[#334155]">
                  Drag and drop files or{' '}
                  <span className="font-semibold text-[#0f172a] underline decoration-[#cbd5e1] underline-offset-2">
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
                    className="flex items-center justify-between rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#0f172a]">{file.name}</p>
                      <p className="text-xs text-[#64748b]">{file.size}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(file.id)}
                      className="rounded-md p-1.5 text-[#ef4444] transition-colors hover:bg-red-50"
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

            <div className="flex flex-col gap-3 border-t border-[#e2e8f0] pt-6 sm:flex-row sm:items-center sm:justify-end">
              <Button variant="outline" onClick={handleDelete} className="gap-2 text-red-700 hover:bg-red-50">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>

          <aside className="w-full min-w-0 space-y-6 lg:sticky lg:top-6 lg:self-start">
            {docType === 'change_order' ? (
              <>
                <div className={formCardClassName()}>
                  <ReviewerManagementSection
                    embedded
                    layout="create"
                    onSend={async ({ reviewers, expires_in_days, resend }) => {
                      await apiFetch('/api/documents/' + id + '/send-for-review', {
                        method: 'POST',
                        json: { reviewers, expires_in_days, resend },
                      })
                      toast.success('Review invitations sent')
                    }}
                  />
                </div>

                <div className={formCardClassName()}>
                  <h3 className="mb-5 text-lg font-semibold text-[#0f172a]">Categorization</h3>
                  <div className="space-y-4">
                    <div>
                      <label className={capLabel}>Reason</label>
                      <p className="text-sm font-medium text-[#0f172a]">{reasonLabel}</p>
                    </div>
                    <div className="border-t border-[#e2e8f0] pt-4">
                      <label className={capLabel}>Schedule impact</label>
                      <p className="text-sm font-medium text-[#0f172a]">{scheduleLabel}</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className={formCardClassName()}>
                <ReviewerManagementSection
                  onSend={async ({ reviewers, expires_in_days, resend }) => {
                    await apiFetch('/api/documents/' + id + '/send-for-review', {
                      method: 'POST',
                      json: { reviewers, expires_in_days, resend },
                    })
                    toast.success('Review invitations sent')
                  }}
                />
              </div>
            )}

            <div className={formCardClassName()}>
              <h3 className="mb-5 text-lg font-semibold text-[#0f172a]">Summary</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">Review status</p>
                  <p className="text-sm font-semibold text-[#0f172a]">
                    {finalStatusLabel ??
                      (normalizedStatus === 'pending_review'
                        ? 'Sent'
                        : normalizedStatus === 'revision_requested'
                          ? 'Revision Requested'
                          : 'Draft')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Project</p>
                  <p className="text-sm font-semibold text-[#0f172a]">{selectedProject?.name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{selectedProject?.address ?? ''}</p>
                </div>
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-muted-foreground">
                    {docType === 'change_order' ? 'Change Order #' : docType === 'rfi' ? 'RFI #' : 'Submittal #'}
                  </p>
                  <p className="text-sm font-semibold text-[#0f172a]">
                    {docType === 'change_order' ? co.changeOrderNumber : docType === 'rfi' ? rfi.number : sub.number}
                  </p>
                </div>
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-muted-foreground">Title</p>
                  <p className="text-sm font-semibold text-[#0f172a]">
                    {docType === 'change_order'
                      ? co.title || '—'
                      : docType === 'rfi'
                        ? rfi.title || '—'
                        : sub.title || '—'}
                  </p>
                </div>
                <div className="border-t border-slate-100 pt-4">
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
                    {normalizedStatus === 'approved' ? (
                      <Button
                        type="button"
                        onClick={handleExportPdf}
                        disabled={exportingPdf}
                        className="w-full justify-start gap-2"
                      >
                        <Download className="h-4 w-4" />
                        {exportingPdf ? 'Exporting...' : 'Export to PDF'}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {docType === 'change_order' ? (
                  <>
                    <div className="border-t border-slate-100 pt-4">
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p className="text-sm font-semibold text-[#0f172a]">
                        {co.date
                          ? new Date(co.date + 'T12:00:00').toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </p>
                    </div>
                    <div className="border-t border-slate-100 pt-4">
                      <p className="text-xs text-muted-foreground">Cost Impact</p>
                      <p className="text-sm font-semibold text-[#0f172a]">
                        {co.costImpact.trim() ? `$${formatUsd(parseMoneyInput(co.costImpact))}` : '—'}
                      </p>
                    </div>
                    <div className="border-t border-slate-100 pt-4">
                      <p className="text-xs text-muted-foreground">Schedule Impact</p>
                      <p className="text-sm font-semibold text-[#0f172a]">{scheduleLabel}</p>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className={formCardClassName()}>
              <h3 className="mb-3 text-lg font-semibold text-[#0f172a]">Linked Documents</h3>
              <p className="mb-4 text-sm text-[#64748b]">
                Create downstream change orders from this review outcome when needed.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/change-orders/new?source_document_id=${id}`}>Create Change Order</Link>
              </Button>
            </div>

            {docType === 'change_order' ? (
              <div className="relative overflow-hidden rounded-xl border border-[#e2e8f0] shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
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
