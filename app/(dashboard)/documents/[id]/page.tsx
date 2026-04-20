'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  Eye,
  Lightbulb,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import {
  buildChangeOrderHtml,
  buildRfiHtml,
  buildSubmittalHtml,
  CO_REASON_OPTIONS,
  CO_SCHEDULE_OPTIONS,
  formatUsd,
  getLatestVersion,
  initialChangeOrderState,
  initialRfiState,
  initialSubmittalState,
  parseMoneyInput,
} from '@/lib/document-html'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

const PREVIEW_BLUE = '#2563eb'
const NAVY = '#0f172a'

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
    scheduleImpact: 'none',
    notes: '',
  })
  const [attachments, setAttachments] = useState<LocalAttachment[]>([])

  const [isSaving, setIsSaving] = useState(false)
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false)

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
            scheduleImpact: s.scheduleImpact,
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
  const scheduleLabel =
    CO_SCHEDULE_OPTIONS.find((s) => s.value === co.scheduleImpact)?.label ?? '—'
  const costNumeric = parseMoneyInput(co.costImpact)

  const sectionTitle = (n: number, title: string, required?: boolean) => (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm">
        {n}
      </div>
      <h2 className="text-lg font-semibold leading-tight" style={{ color: NAVY }}>
        {title}
        {required ? <span className="text-destructive"> *</span> : null}
      </h2>
    </div>
  )

  const labelClass = 'mb-1.5 block text-sm font-medium'
  const hintClass = 'mt-1.5 text-xs text-muted-foreground'

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
    if (!rfi.question.trim()) {
      toast.error('Question is required')
      return
    }
    const html = buildRfiHtml({
      number: rfi.number,
      title: rfi.title,
      date: rfi.date,
      projectName: selectedProject?.name ?? '',
      question: rfi.question,
      description: rfi.description,
      notes: rfi.notes,
    })
    await savePatch({
      title: rfi.title,
      doc_number: rfi.number,
      description: html,
      metadata: {
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
    const html = buildSubmittalHtml({
      number: sub.number,
      title: sub.title,
      date: sub.date,
      projectName: selectedProject?.name ?? '',
      specSection: sub.specSection,
      manufacturer: sub.manufacturer,
      productName: sub.productName,
      description: sub.description,
      notes: sub.notes,
    })
    await savePatch({
      title: sub.title,
      doc_number: sub.number,
      description: html,
      metadata: {
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
      router.push('/documents')
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
    <div className="min-h-full bg-[#f8f9fb] px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: NAVY }}>
              {pageTitle}
            </h1>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted-foreground">
              Update fields below. Saved content regenerates the professional document HTML for this record.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="shrink-0 gap-2 rounded-lg border-slate-200 bg-white px-4 shadow-sm"
              style={{ color: NAVY }}
              asChild
            >
              <Link href={`/documents?type=${doc.doc_type}`}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button variant="outline" onClick={handleDelete} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 lg:max-w-[calc(100%-22rem)]">
            <Card className="border border-slate-200/80 bg-white shadow-sm">
              <CardContent className="space-y-10 p-6 sm:p-8">
                {docType === 'rfi' && (
                  <>
                    <section>
                      {sectionTitle(1, 'Project & RFI Info')}
                      <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                        <div className="min-w-0">
                          <label className={labelClass} style={{ color: NAVY }}>
                            Project
                          </label>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                            {selectedProject?.name ?? '—'}
                          </div>
                          {selectedProject?.address ? (
                            <p className="mt-1.5 text-xs text-muted-foreground">{selectedProject.address}</p>
                          ) : null}
                        </div>
                        <div>
                          <label className={labelClass} style={{ color: NAVY }}>
                            RFI Number <span className="text-destructive">*</span>
                          </label>
                          <Input
                            value={rfi.number}
                            onChange={(e) => setRfi((p) => ({ ...p, number: e.target.value }))}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelClass} style={{ color: NAVY }}>
                            Title <span className="text-destructive">*</span>
                          </label>
                          <Input
                            value={rfi.title}
                            onChange={(e) => setRfi((p) => ({ ...p, title: e.target.value }))}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelClass} style={{ color: NAVY }}>
                            Date <span className="text-destructive">*</span>
                          </label>
                          <div className="relative max-w-xs">
                            <Input
                              type="date"
                              value={rfi.date}
                              onChange={(e) => setRfi((p) => ({ ...p, date: e.target.value }))}
                              className="pr-10"
                            />
                            <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    </section>
                    <section>
                      {sectionTitle(2, 'Question & Description', true)}
                      <label className={labelClass} style={{ color: NAVY }}>
                        Question <span className="text-destructive">*</span>
                      </label>
                      <Textarea
                        value={rfi.question}
                        onChange={(e) => setRfi((p) => ({ ...p, question: e.target.value }))}
                        rows={3}
                        className="mb-4 resize-none"
                      />
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <label className={labelClass} style={{ color: NAVY }}>
                          Description <span className="text-destructive">*</span>
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void handleGenerateDescription()}
                          disabled={isGeneratingDescription}
                        >
                          <span className="mr-1.5" aria-hidden>
                            ✨
                          </span>
                          Generate with AI
                        </Button>
                      </div>
                      <MissingScopeEditorSection
                        documentApiType={docTypeToMissingScopeType('rfi')}
                        value={rfi.description}
                        onChange={(v) => setRfi((p) => ({ ...p, description: v }))}
                        isGeneratingDescription={isGeneratingDescription}
                        rows={5}
                      />
                      <p className={hintClass}>{rfi.description.length} characters</p>
                    </section>
                    <section>
                      {sectionTitle(3, 'Attachments (Optional)')}
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
                          'mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors',
                          'border-primary/35 bg-primary/5 hover:border-primary/55 hover:bg-primary/10'
                        )}
                      >
                        <Upload className="mb-2 h-8 w-8 text-primary" />
                        <p className="text-center text-sm font-medium" style={{ color: NAVY }}>
                          Drag & drop files here, or{' '}
                          <span className="text-primary underline underline-offset-2">click to browse</span>
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={handleFileUpload}
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        />
                      </div>
                      {attachments.length > 0 && (
                        <div className="space-y-2">
                          {attachments.map((file) => (
                            <div
                              key={file.id}
                              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium" style={{ color: NAVY }}>
                                  {file.name}
                                </p>
                                <p className="text-xs text-muted-foreground">{file.size}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeAttachment(file.id)}
                                className="rounded p-1 text-muted-foreground hover:bg-slate-200"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                    <section>
                      {sectionTitle(4, 'Notes (Optional)')}
                      <Textarea
                        value={rfi.notes}
                        onChange={(e) => setRfi((p) => ({ ...p, notes: e.target.value }))}
                        rows={3}
                        className="resize-none"
                      />
                    </section>
                  </>
                )}

                {docType === 'submittal' && (
                  <>
                    <section>
                      {sectionTitle(1, 'Project & Submittal Info')}
                      <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                        <div className="min-w-0">
                          <label className={labelClass} style={{ color: NAVY }}>
                            Project
                          </label>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                            {selectedProject?.name ?? '—'}
                          </div>
                          {selectedProject?.address ? (
                            <p className="mt-1.5 text-xs text-muted-foreground">{selectedProject.address}</p>
                          ) : null}
                        </div>
                        <div>
                          <label className={labelClass} style={{ color: NAVY }}>
                            Submittal Number <span className="text-destructive">*</span>
                          </label>
                          <Input
                            value={sub.number}
                            onChange={(e) => setSub((p) => ({ ...p, number: e.target.value }))}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelClass} style={{ color: NAVY }}>
                            Title <span className="text-destructive">*</span>
                          </label>
                          <Input
                            value={sub.title}
                            onChange={(e) => setSub((p) => ({ ...p, title: e.target.value }))}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelClass} style={{ color: NAVY }}>
                            Date <span className="text-destructive">*</span>
                          </label>
                          <div className="relative max-w-xs">
                            <Input
                              type="date"
                              value={sub.date}
                              onChange={(e) => setSub((p) => ({ ...p, date: e.target.value }))}
                              className="pr-10"
                            />
                            <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    </section>
                    <section>
                      {sectionTitle(2, 'Product details')}
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                          <label className={labelClass} style={{ color: NAVY }}>
                            Spec section
                          </label>
                          <Input
                            value={sub.specSection}
                            onChange={(e) => setSub((p) => ({ ...p, specSection: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className={labelClass} style={{ color: NAVY }}>
                            Manufacturer
                          </label>
                          <Input
                            value={sub.manufacturer}
                            onChange={(e) => setSub((p) => ({ ...p, manufacturer: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className={labelClass} style={{ color: NAVY }}>
                            Product name
                          </label>
                          <Input
                            value={sub.productName}
                            onChange={(e) => setSub((p) => ({ ...p, productName: e.target.value }))}
                          />
                        </div>
                      </div>
                    </section>
                    <section>
                      {sectionTitle(3, 'Description', true)}
                      <div className="mb-2 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void handleGenerateDescription()}
                          disabled={isGeneratingDescription}
                        >
                          <span className="mr-1.5" aria-hidden>
                            ✨
                          </span>
                          Generate with AI
                        </Button>
                      </div>
                      <MissingScopeEditorSection
                        documentApiType={docTypeToMissingScopeType('submittal')}
                        value={sub.description}
                        onChange={(v) => setSub((p) => ({ ...p, description: v }))}
                        isGeneratingDescription={isGeneratingDescription}
                        rows={5}
                      />
                    </section>
                    <section>
                      {sectionTitle(4, 'Attachments (Optional)')}
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
                          'mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors',
                          'border-primary/35 bg-primary/5 hover:border-primary/55 hover:bg-primary/10'
                        )}
                      >
                        <Upload className="mb-2 h-8 w-8 text-primary" />
                        <p className="text-center text-sm font-medium" style={{ color: NAVY }}>
                          Drag & drop files here, or{' '}
                          <span className="text-primary underline underline-offset-2">click to browse</span>
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={handleFileUpload}
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        />
                      </div>
                      {attachments.length > 0 && (
                        <div className="space-y-2">
                          {attachments.map((file) => (
                            <div
                              key={file.id}
                              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium" style={{ color: NAVY }}>
                                  {file.name}
                                </p>
                                <p className="text-xs text-muted-foreground">{file.size}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeAttachment(file.id)}
                                className="rounded p-1 text-muted-foreground hover:bg-slate-200"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                    <section>
                      {sectionTitle(5, 'Notes (Optional)')}
                      <Textarea
                        value={sub.notes}
                        onChange={(e) => setSub((p) => ({ ...p, notes: e.target.value }))}
                        rows={3}
                        className="resize-none"
                      />
                    </section>
                  </>
                )}

                {docType === 'change_order' && (
                  <>
                    <section>
                      {sectionTitle(1, 'Project & Change Order Info')}
                      <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                        <div className="min-w-0">
                          <label className={labelClass} style={{ color: NAVY }}>
                            Project
                          </label>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                            {selectedProject?.name ?? '—'}
                          </div>
                          {selectedProject?.address ? (
                            <p className="mt-1.5 text-xs text-muted-foreground">{selectedProject.address}</p>
                          ) : null}
                        </div>
                        <div>
                          <label className={labelClass} style={{ color: NAVY }}>
                            Change Order Number <span className="text-destructive">*</span>
                          </label>
                          <Input
                            value={co.changeOrderNumber}
                            onChange={(e) => setCo((p) => ({ ...p, changeOrderNumber: e.target.value }))}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelClass} style={{ color: NAVY }}>
                            Title <span className="text-destructive">*</span>
                          </label>
                          <Input
                            value={co.title}
                            onChange={(e) => setCo((p) => ({ ...p, title: e.target.value }))}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelClass} style={{ color: NAVY }}>
                            Date <span className="text-destructive">*</span>
                          </label>
                          <div className="relative max-w-xs">
                            <Input
                              type="date"
                              value={co.date}
                              onChange={(e) => setCo((p) => ({ ...p, date: e.target.value }))}
                              className="pr-10"
                            />
                            <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    </section>
                    <section>
                      {sectionTitle(2, 'Description of Change', true)}
                      <div className="mb-2 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void handleGenerateDescription()}
                          disabled={isGeneratingDescription}
                        >
                          <span className="mr-1.5" aria-hidden>
                            ✨
                          </span>
                          Generate with AI
                        </Button>
                      </div>
                      <MissingScopeEditorSection
                        documentApiType={docTypeToMissingScopeType('change_order')}
                        value={co.description}
                        onChange={(v) => setCo((p) => ({ ...p, description: v }))}
                        isGeneratingDescription={isGeneratingDescription}
                        rows={5}
                      />
                      <p className={hintClass}>{co.description.length} characters</p>
                    </section>
                    <section>
                      {sectionTitle(3, 'Reason for Change')}
                      <Select value={co.reason} onValueChange={(v) => setCo((p) => ({ ...p, reason: v }))}>
                        <SelectTrigger className="max-w-md">
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
                    </section>
                    <section>
                      {sectionTitle(4, 'Cost & Schedule Impact')}
                      <div className="grid gap-5 sm:grid-cols-2">
                        <div>
                          <label className={labelClass} style={{ color: NAVY }}>
                            Cost Impact
                          </label>
                          <div className="relative max-w-md">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                              $
                            </span>
                            <Input
                              value={co.costImpact}
                              onChange={(e) => setCo((p) => ({ ...p, costImpact: e.target.value }))}
                              className="pl-7 pr-14"
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                              USD
                            </span>
                          </div>
                        </div>
                        <div>
                          <label className={labelClass} style={{ color: NAVY }}>
                            Schedule Impact
                          </label>
                          <Select
                            value={co.scheduleImpact}
                            onValueChange={(v) => setCo((p) => ({ ...p, scheduleImpact: v }))}
                          >
                            <SelectTrigger className="max-w-md">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CO_SCHEDULE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </section>
                    <section>
                      {sectionTitle(5, 'Attachments (Optional)')}
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
                          'mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors',
                          'border-primary/35 bg-primary/5 hover:border-primary/55 hover:bg-primary/10'
                        )}
                      >
                        <Upload className="mb-2 h-8 w-8 text-primary" />
                        <p className="text-center text-sm font-medium" style={{ color: NAVY }}>
                          Drag & drop files here, or{' '}
                          <span className="text-primary underline underline-offset-2">click to browse</span>
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={handleFileUpload}
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        />
                      </div>
                      {attachments.length > 0 && (
                        <div className="space-y-2">
                          {attachments.map((file) => (
                            <div
                              key={file.id}
                              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium" style={{ color: NAVY }}>
                                  {file.name}
                                </p>
                                <p className="text-xs text-muted-foreground">{file.size}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeAttachment(file.id)}
                                className="rounded p-1 text-muted-foreground hover:bg-slate-200"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                    <section>
                      {sectionTitle(6, 'Notes (Optional)')}
                      <Textarea
                        value={co.notes}
                        onChange={(e) => setCo((p) => ({ ...p, notes: e.target.value }))}
                        rows={3}
                        className="resize-none"
                      />
                    </section>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="w-full shrink-0 space-y-4 lg:sticky lg:top-8 lg:w-88">
            <Card className="border border-slate-200/80 bg-white shadow-sm">
              <CardContent className="space-y-3 p-5">
                <h3 className="text-base font-semibold" style={{ color: NAVY }}>
                  Summary
                </h3>
                <div>
                  <p className="text-xs text-muted-foreground">Project</p>
                  <p className="font-medium" style={{ color: NAVY }}>
                    {selectedProject?.name || '—'}
                  </p>
                  {selectedProject?.address ? (
                    <p className="text-xs text-muted-foreground">{selectedProject.address}</p>
                  ) : null}
                </div>
                <div className="h-px bg-slate-200" />
                {docType === 'change_order' ? (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground">Change Order #</p>
                      <p className="font-semibold" style={{ color: NAVY }}>
                        {co.changeOrderNumber || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Title</p>
                      <p className="font-semibold leading-snug" style={{ color: NAVY }}>
                        {co.title || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p className="text-sm font-semibold" style={{ color: NAVY }}>
                        {co.date
                          ? new Date(co.date + 'T12:00:00').toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Cost Impact</p>
                      <p className="text-2xl font-bold" style={{ color: NAVY }}>
                        {co.costImpact.trim() ? `$${formatUsd(parseMoneyInput(co.costImpact))}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Schedule Impact</p>
                      <p className="text-xl font-bold" style={{ color: NAVY }}>
                        {scheduleLabel}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {docType === 'rfi' ? 'RFI #' : 'Submittal #'}
                      </p>
                      <p className="font-semibold" style={{ color: NAVY }}>
                        {docType === 'rfi' ? rfi.number : sub.number}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Title</p>
                      <p className="font-semibold" style={{ color: NAVY }}>
                        {docType === 'rfi' ? rfi.title || 'Untitled' : sub.title || 'Untitled'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p className="text-sm font-semibold" style={{ color: NAVY }}>
                        {(docType === 'rfi' ? rfi.date : sub.date)
                          ? new Date((docType === 'rfi' ? rfi.date : sub.date) + 'T12:00:00').toLocaleDateString(
                              'en-US',
                              { month: 'long', day: 'numeric', year: 'numeric' }
                            )
                          : '—'}
                      </p>
                    </div>
                  </>
                )}
                <Button
                  type="button"
                  className="w-full gap-2"
                  style={{ backgroundColor: PREVIEW_BLUE }}
                  onClick={() =>
                    toast.message('Preview', { description: 'Open print preview from the browser after save.' })
                  }
                >
                  <Eye className="h-4 w-4" />
                  Preview Document
                </Button>
              </CardContent>
            </Card>

            <Card className="border border-sky-200/80 bg-sky-50/70 shadow-sm">
              <CardContent className="p-5">
                <p className="mb-1 flex items-center gap-2 text-sm font-semibold" style={{ color: NAVY }}>
                  <Lightbulb className="h-4 w-4 text-sky-500" />
                  Need Help?
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Fields are filled from your saved document and latest version metadata. Edit and save to create a new
                  version.
                </p>
              </CardContent>
            </Card>

            <ReviewerManagementSection
              onSend={async (emails) => {
                await apiFetch('/api/documents/' + id + '/send-for-review', {
                  method: 'POST',
                  json: { reviewers: emails },
                })
              }}
            />
          </aside>
        </div>
      </div>
    </div>
  )
}
