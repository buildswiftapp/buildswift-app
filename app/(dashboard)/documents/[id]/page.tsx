'use client'

import { use, useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  Eye,
  FileText,
  Lightbulb,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { mockTeamMembers } from '@/lib/mock-data'
import type { Attachment as DocAttachment } from '@/lib/types'
import { MissingScopeCallout } from '@/app/components/missing-scope-callout'
import { ReviewerManagementSection } from '@/app/components/reviewer-management-section'

const NAVY = '#0f172a'
const PREVIEW_BLUE = '#2563eb'

const REASON_OPTIONS = [
  { value: 'owner_request', label: 'Owner Request' },
  { value: 'design_change', label: 'Design Change' },
  { value: 'field_conditions', label: 'Field Conditions' },
  { value: 'code_requirement', label: 'Code Requirement' },
  { value: 'value_engineering', label: 'Value Engineering' },
  { value: 'other', label: 'Other' },
] as const

const SCHEDULE_OPTIONS = [
  { value: 'none', label: 'No Impact' },
  { value: '+1', label: '+ 1 day' },
  { value: '+2', label: '+ 2 days' },
  { value: '+3', label: '+ 3 days' },
  { value: '+5', label: '+ 5 days' },
  { value: '+7', label: '+ 7 days' },
  { value: '+14', label: '+ 14 days' },
  { value: '+30', label: '+ 30 days' },
  { value: 'tbd', label: 'TBD' },
] as const

interface LocalAttachment {
  id: string
  name: string
  size: string
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractNumberFromHtml(content: string, type: 'rfi' | 'submittal'): string {
  const pattern =
    type === 'rfi'
      ? /RFI Number:<\/strong>\s*([^<]+)/i
      : /Submittal Number:<\/strong>\s*([^<]+)/i
  const match = content.match(pattern)
  return match?.[1]?.trim() || (type === 'rfi' ? 'RFI-001' : 'SUB-001')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function parseMoneyInput(raw: string): number {
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function formatUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function buildRfiHtml(values: {
  number: string
  title: string
  date: string
  projectName: string
  question: string
  description: string
  notes: string
}): string {
  const dateLong = values.date
    ? new Date(values.date + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : ''
  return `<h2>Request for Information</h2>
<p><strong>RFI Number:</strong> ${values.number}</p>
<p><strong>Date:</strong> ${dateLong}</p>
<p><strong>Project:</strong> ${values.projectName}</p>
<p><strong>Title:</strong> ${values.title}</p>
<h3>Question</h3>
<p>${values.question || values.description}</p>
<h3>Description / Context</h3>
<p>${values.description}</p>
${values.notes ? `<h3>Notes</h3><p>${values.notes}</p>` : ''}`
}

function buildSubmittalHtml(values: {
  number: string
  title: string
  date: string
  projectName: string
  specSection: string
  manufacturer: string
  productName: string
  description: string
  notes: string
}): string {
  const dateLong = values.date
    ? new Date(values.date + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : ''
  return `<h2>Product Submittal</h2>
<p><strong>Submittal Number:</strong> ${values.number}</p>
<p><strong>Date:</strong> ${dateLong}</p>
<p><strong>Project:</strong> ${values.projectName}</p>
<p><strong>Title:</strong> ${values.title}</p>
<p><strong>Specification Section:</strong> ${values.specSection || 'N/A'}</p>
<h3>Product Information</h3>
<p><strong>Manufacturer:</strong> ${values.manufacturer || 'TBD'}</p>
<p><strong>Product:</strong> ${values.productName || 'TBD'}</p>
<h3>Description</h3>
<p>${values.description}</p>
${values.notes ? `<h3>Notes</h3><p>${values.notes}</p>` : ''}`
}

function buildChangeOrderHtml(values: {
  coNumber: string
  date: string
  projectName: string
  title: string
  description: string
  reasonLabel: string
  cost: number
  scheduleLabel: string
  notes: string
}): string {
  const dateLong = values.date
    ? new Date(values.date + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : ''
  const desc = values.description.split('\n').join('</p><p>')
  return `<h2>Change Order Request</h2>
<p><strong>Change Order Number:</strong> ${values.coNumber}</p>
<p><strong>Date:</strong> ${dateLong}</p>
<p><strong>Project:</strong> ${values.projectName}</p>
<p><strong>Title:</strong> ${values.title}</p>
<h3>Description of Change</h3>
<p>${desc}</p>
<h3>Reason for Change</h3>
<p>${values.reasonLabel}</p>
<h3>Cost Impact</h3>
<p>$${formatUsd(values.cost)}</p>
<h3>Schedule Impact</h3>
<p>${values.scheduleLabel}</p>
${values.notes ? `<h3>Notes</h3><p>${values.notes}</p>` : ''}`
}

export default function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { documents, projects, deleteDocument, updateDocument } = useApp()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const document = documents.find((d) => d.id === id)
  if (!document) {
    return (
      <div className="flex flex-col">
        <div className="flex-1 p-6">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Document not found</EmptyTitle>
              <EmptyDescription>
                The document you are looking for does not exist.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link href="/documents">Back to Documents</Link>
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      </div>
    )
  }

  const isSubmittal = document.type === 'submittal'
  const isChangeOrder = document.type === 'change_order'
  const attachmentsFromDoc = document.metadata.attachments || []
  const [attachments, setAttachments] = useState<LocalAttachment[]>(
    attachmentsFromDoc.map((a) => ({
      id: a.id,
      name: a.name,
      size: a.size ? formatBytes(a.size) : 'Attached file',
    }))
  )
  const [formData, setFormData] = useState(() => {
    const reasonValue =
      REASON_OPTIONS.find((r) => r.label === document.metadata.reason)?.value || 'other'
    const scheduleValue =
      SCHEDULE_OPTIONS.find((s) => s.label === document.metadata.scheduleImpact)?.value || 'none'
    return {
      projectId: document.projectId,
      number: extractNumberFromHtml(document.content, isSubmittal ? 'submittal' : 'rfi'),
      title: document.title,
      date: (document.metadata.changeOrderDate || document.createdAt).slice(0, 10),
      question: document.metadata.question || '',
      description: stripHtml(document.content),
      specSection: document.metadata.specSection || '',
      manufacturer: document.metadata.manufacturer || '',
      productName: document.metadata.productName || '',
      notes: document.metadata.notes || '',
      reason: reasonValue,
      costImpact: document.metadata.proposedAmount ? `${document.metadata.proposedAmount}` : '0',
      scheduleImpact: scheduleValue,
      changeOrderNumber: document.metadata.changeOrderNumber || 'CO-001',
    }
  })

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === formData.projectId),
    [projects, formData.projectId]
  )

  const getCreatorName = (userId: string) => {
    const user = mockTeamMembers.find((m) => m.id === userId)
    return user?.name || 'Unknown User'
  }

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

  const reasonLabel =
    REASON_OPTIONS.find((r) => r.value === formData.reason)?.label ?? 'Other'
  const scheduleLabel =
    SCHEDULE_OPTIONS.find((s) => s.value === formData.scheduleImpact)?.label ?? 'No Impact'
  const costNumeric = parseMoneyInput(formData.costImpact)
  const labelClass = 'mb-1.5 block text-sm font-medium'

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const next: LocalAttachment[] = Array.from(files).map((file, index) => ({
      id: `upload-${Date.now()}-${index}`,
      name: file.name,
      size: formatBytes(file.size),
    }))
    setAttachments((prev) => [...prev, ...next])
    e.target.value = ''
  }

  const removeAttachment = (idToRemove: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== idToRemove))
  }

  const handleAIGenerate = async () => {
    if (!formData.title.trim() && !formData.description.trim()) {
      toast.error('Add a title or description first')
      return
    }

    setIsGenerating(true)
    try {
      const res = await fetch('/api/ai/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: formData.title || formData.description }),
      })
      const data = await res.json()
      setFormData((prev) => ({ ...prev, description: data.description || prev.description }))
      toast.success('AI draft generated')
    } catch {
      toast.error('Failed to generate with AI')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!formData.projectId) return toast.error('Project is required')
    if (!formData.title.trim()) return toast.error('Title is required')
    if (!formData.description.trim()) return toast.error('Description is required')
    if (!isSubmittal && !isChangeOrder && !formData.question.trim()) {
      return toast.error('Question is required for RFI')
    }

    const docAttachments: DocAttachment[] = attachments.map((a) => ({
      id: a.id,
      name: a.name,
      url: '#',
      size: 0,
      type: a.name.split('.').pop() || 'file',
    }))

    const content = isChangeOrder
      ? buildChangeOrderHtml({
          coNumber: formData.changeOrderNumber,
          date: formData.date,
          projectName: selectedProject?.name || '',
          title: formData.title,
          description: formData.description,
          reasonLabel,
          cost: costNumeric,
          scheduleLabel,
          notes: formData.notes,
        })
      : isSubmittal
      ? buildSubmittalHtml({
          number: formData.number,
          title: formData.title,
          date: formData.date,
          projectName: selectedProject?.name || '',
          specSection: formData.specSection,
          manufacturer: formData.manufacturer,
          productName: formData.productName,
          description: formData.description,
          notes: formData.notes,
        })
      : buildRfiHtml({
          number: formData.number,
          title: formData.title,
          date: formData.date,
          projectName: selectedProject?.name || '',
          question: formData.question,
          description: formData.description,
          notes: formData.notes,
        })

    setIsSaving(true)
    try {
      updateDocument(id, {
        projectId: formData.projectId,
        title: formData.title,
        content,
        metadata: {
          ...document.metadata,
          question: isSubmittal || isChangeOrder ? undefined : formData.question || undefined,
          specSection: isSubmittal ? formData.specSection : undefined,
          manufacturer: isSubmittal ? formData.manufacturer : undefined,
          productName: isSubmittal ? formData.productName : undefined,
          reason: isChangeOrder ? reasonLabel : undefined,
          proposedAmount: isChangeOrder ? costNumeric : undefined,
          changeOrderNumber: isChangeOrder ? formData.changeOrderNumber : undefined,
          changeOrderDate: isChangeOrder ? formData.date : undefined,
          scheduleImpact: isChangeOrder ? scheduleLabel : undefined,
          attachments: docAttachments,
          notes: formData.notes || undefined,
        },
      })
      toast.success('Document updated')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = () => {
    deleteDocument(id)
    router.push('/documents')
    toast.success('Document deleted')
  }

  return (
    <div className="min-h-full bg-[#f8f9fb] px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: NAVY }}>
              {isChangeOrder ? 'Change Order Details' : isSubmittal ? 'Submittal Details' : 'RFI Details'}
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              {isChangeOrder
                ? 'Same layout as new change order, prefilled from this document.'
                : 'Same builder layout as create page, prefilled from the selected document.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-2 rounded-lg border-slate-200 bg-white px-4 shadow-sm hover:bg-slate-50"
              style={{ color: NAVY }}
              asChild
            >
              <Link href={`/documents?type=${document.type}`}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button className="gap-2 rounded-lg px-4 shadow-sm" onClick={handleSave} disabled={isSaving}>
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              variant="outline"
              className="gap-2 rounded-lg border-red-200 bg-white px-4 text-destructive shadow-sm hover:bg-red-50"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className={`min-w-0 flex-1 ${isChangeOrder ? 'lg:max-w-[calc(100%-20rem)]' : 'lg:max-w-[calc(100%-22rem)]'}`}>
            <Card className="border border-slate-200/80 bg-white shadow-sm">
              <CardContent className="space-y-10 p-6 sm:p-8">
                <section>
                  {sectionTitle(1, isChangeOrder ? 'Project & Change Order Info' : isSubmittal ? 'Project & Submittal Info' : 'Project & RFI Info')}
                  <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <div className="min-w-0">
                      <label className={labelClass} style={{ color: NAVY }}>
                        Project <span className="text-destructive">*</span>
                      </label>
                      <Select
                        value={formData.projectId}
                        onValueChange={(value) => setFormData((prev) => ({ ...prev, projectId: value }))}
                      >
                        <SelectTrigger className="h-9 w-full min-w-0 rounded-lg border-slate-200 text-left shadow-xs">
                          <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedProject ? (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {selectedProject.projectNumber} • {selectedProject.address}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label className={labelClass} style={{ color: NAVY }}>
                        {isChangeOrder ? 'Change Order Number' : isSubmittal ? 'Submittal Number' : 'RFI Number'} <span className="text-destructive">*</span>
                      </label>
                      <Input
                        value={isChangeOrder ? formData.changeOrderNumber : formData.number}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            ...(isChangeOrder
                              ? { changeOrderNumber: e.target.value }
                              : { number: e.target.value }),
                          }))
                        }
                        className="rounded-lg border-slate-200 shadow-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass} style={{ color: NAVY }}>
                        Title <span className="text-destructive">*</span>
                      </label>
                      <Input
                        value={formData.title}
                        onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                        className="rounded-lg border-slate-200 shadow-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass} style={{ color: NAVY }}>
                        Date <span className="text-destructive">*</span>
                      </label>
                      <div className="relative max-w-xs">
                        <Input
                          type="date"
                          value={formData.date}
                          onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                          className="rounded-lg border-slate-200 pr-10 shadow-xs"
                        />
                        <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  {sectionTitle(2, isChangeOrder ? 'Description of Change' : isSubmittal ? 'Description of Submittal' : 'Question & Description', true)}
                  {!isSubmittal && !isChangeOrder ? (
                    <>
                      <label className={labelClass} style={{ color: NAVY }}>
                        Question <span className="text-destructive">*</span>
                      </label>
                      <Textarea
                        value={formData.question}
                        onChange={(e) => setFormData((prev) => ({ ...prev, question: e.target.value }))}
                        rows={3}
                        className="mb-4 resize-none rounded-lg border-slate-200 text-[15px] leading-relaxed shadow-xs"
                      />
                    </>
                  ) : null}
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className={labelClass} style={{ color: NAVY }}>
                      Description <span className="text-destructive">*</span>
                    </label>
                    <Button type="button" variant="outline" size="sm" onClick={handleAIGenerate} disabled={isGenerating}>
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
                      {isGenerating ? 'Generating...' : 'AI Generate'}
                    </Button>
                  </div>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    rows={5}
                    className="resize-none rounded-lg border-slate-200 text-[15px] leading-relaxed shadow-xs"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">{formData.description.length} characters</p>
                </section>

                <MissingScopeCallout />

                {isSubmittal ? (
                  <section>
                    {sectionTitle(3, 'Submittal Details')}
                    <div className="grid gap-5 sm:grid-cols-3">
                      <div>
                        <label className={labelClass} style={{ color: NAVY }}>Spec Section</label>
                        <Input value={formData.specSection} onChange={(e) => setFormData((prev) => ({ ...prev, specSection: e.target.value }))} className="rounded-lg border-slate-200 shadow-xs" />
                      </div>
                      <div>
                        <label className={labelClass} style={{ color: NAVY }}>Manufacturer</label>
                        <Input value={formData.manufacturer} onChange={(e) => setFormData((prev) => ({ ...prev, manufacturer: e.target.value }))} className="rounded-lg border-slate-200 shadow-xs" />
                      </div>
                      <div>
                        <label className={labelClass} style={{ color: NAVY }}>Product Name</label>
                        <Input value={formData.productName} onChange={(e) => setFormData((prev) => ({ ...prev, productName: e.target.value }))} className="rounded-lg border-slate-200 shadow-xs" />
                      </div>
                    </div>
                  </section>
                ) : null}

                {isChangeOrder ? (
                  <>
                    <section>
                      {sectionTitle(3, 'Reason for Change')}
                      <Select value={formData.reason} onValueChange={(value) => setFormData((prev) => ({ ...prev, reason: value as (typeof REASON_OPTIONS)[number]['value'] }))}>
                        <SelectTrigger className="w-full max-w-md rounded-lg border-slate-200 shadow-xs sm:w-72">
                          <SelectValue placeholder="Select reason" />
                        </SelectTrigger>
                        <SelectContent>
                          {REASON_OPTIONS.map((o) => (
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
                          <label className={labelClass} style={{ color: NAVY }}>Cost Impact</label>
                          <div className="relative max-w-md">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                            <Input
                              value={formData.costImpact}
                              onChange={(e) => setFormData((prev) => ({ ...prev, costImpact: e.target.value }))}
                              className="rounded-lg border-slate-200 pl-7 pr-14 shadow-xs"
                              placeholder="0.00"
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">USD</span>
                          </div>
                        </div>
                        <div>
                          <label className={labelClass} style={{ color: NAVY }}>Schedule Impact</label>
                          <Select value={formData.scheduleImpact} onValueChange={(value) => setFormData((prev) => ({ ...prev, scheduleImpact: value as (typeof SCHEDULE_OPTIONS)[number]['value'] }))}>
                            <SelectTrigger className="max-w-md rounded-lg border-slate-200 shadow-xs">
                              <SelectValue placeholder="Select impact" />
                            </SelectTrigger>
                            <SelectContent>
                              {SCHEDULE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </section>
                  </>
                ) : null}

                <section>
                  {sectionTitle(isChangeOrder ? 5 : isSubmittal ? 4 : 3, isChangeOrder ? 'Attachments (Optional)' : 'Attachments')}
                  {isChangeOrder ? (
                    <>
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
                          Drag & drop files here, or <span className="text-primary underline underline-offset-2">click to browse</span>
                        </p>
                        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />
                      </div>
                      {attachments.length > 0 ? (
                        <div className="space-y-2">
                          {attachments.map((file) => (
                            <div key={file.id} className="flex items-center justify-between rounded-lg border border-sky-100 bg-sky-50/90 px-4 py-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <FileText className="h-5 w-5 shrink-0 text-sky-700/70" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-sky-950 underline decoration-sky-300">{file.name}</p>
                                  <p className="text-xs text-muted-foreground">{file.size}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeAttachment(file.id)
                                }}
                                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/80 hover:text-foreground"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No attachments</p>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2">
                      {attachments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No attachments</p>
                      ) : (
                        attachments.map((attachment) => (
                          <div key={attachment.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                            <p className="truncate text-sm font-medium" style={{ color: NAVY }}>{attachment.name}</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </section>

                <section>
                  {sectionTitle(isChangeOrder ? 6 : isSubmittal ? 5 : 4, 'Notes (Optional)')}
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    className="resize-none rounded-lg border-slate-200 shadow-xs"
                  />
                </section>

                <div className="border-t border-slate-200 pt-5">
                  <Button className="gap-2 rounded-lg px-4 shadow-sm" onClick={handleSave} disabled={isSaving}>
                    <Save className="h-4 w-4" />
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className={`w-full shrink-0 space-y-4 ${isChangeOrder ? 'lg:w-88' : 'lg:w-88 lg:sticky lg:top-8'}`}>
            <Card className="border border-slate-200/80 bg-white shadow-sm">
              <CardContent className="p-5">
                <h3 className="mb-5 text-base font-semibold" style={{ color: NAVY }}>
                  Summary
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Project</p>
                    <p className="text-sm font-semibold" style={{ color: NAVY }}>{selectedProject?.name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{selectedProject?.projectNumber || '—'}</p>
                  </div>
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-xs text-muted-foreground">
                      {isChangeOrder ? 'Change Order #' : isSubmittal ? 'Submittal #' : 'RFI #'}
                    </p>
                    <p className="text-sm font-semibold" style={{ color: NAVY }}>
                      {isChangeOrder ? formData.changeOrderNumber : formData.number || '—'}
                    </p>
                  </div>
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-xs text-muted-foreground">Title</p>
                    <p className="text-sm font-semibold leading-snug" style={{ color: NAVY }}>{formData.title || '—'}</p>
                  </div>
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="text-sm font-semibold" style={{ color: NAVY }}>
                      {formData.date
                        ? new Date(formData.date + 'T12:00:00').toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—'}
                    </p>
                  </div>
                  {isChangeOrder ? (
                    <>
                      <div className="border-t border-slate-100 pt-4">
                        <p className="text-xs text-muted-foreground">Cost Impact</p>
                        <p className="text-2xl font-bold tracking-tight" style={{ color: NAVY }}>
                          ${formatUsd(costNumeric)}
                        </p>
                      </div>
                      <div className="border-t border-slate-100 pt-4">
                        <p className="text-xs text-muted-foreground">Schedule Impact</p>
                        <p className="text-2xl font-bold tracking-tight" style={{ color: NAVY }}>
                          {scheduleLabel}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="border-t border-slate-100 pt-4">
                      <p className="text-xs text-muted-foreground">Created By</p>
                      <p className="text-sm font-semibold" style={{ color: NAVY }}>{getCreatorName(document.createdBy)}</p>
                    </div>
                  )}
                  <Button className="w-full" variant="default" style={{ backgroundColor: PREVIEW_BLUE }}>
                    <Eye className="mr-2 h-4 w-4" />
                    Preview Document
                  </Button>
                </div>
              </CardContent>
            </Card>

            {isChangeOrder ? (
              <>
                <Card className="border-0 bg-sky-50/90 shadow-sm ring-1 ring-sky-100">
                  <CardContent className="p-5">
                    <div className="flex gap-3">
                      <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-sky-800/70" />
                      <div>
                        <h4 className="text-sm font-semibold" style={{ color: NAVY }}>Need Help?</h4>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          Be specific and detailed for better results. You can always edit before generating.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <ReviewerManagementSection />
              </>
            ) : (
              <ReviewerManagementSection />
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
