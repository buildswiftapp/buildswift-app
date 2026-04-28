'use client'

import { useState, useRef, useCallback, Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Upload,
  X,
  FileText,
  Save,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Attachment as DocAttachment } from '@/lib/types'
import { uploadPendingAttachments } from '@/lib/supabase/upload-attachments'
import {
  ReviewerManagementSection,
  type ReviewInviteSendPayload,
} from '@/app/components/reviewer-management-section'
import { MissingScopeEditorSection } from '../../../components/missing-scope-editor-section'
import { docTypeToMissingScopeType } from '@/lib/missing-scope-client'
import { apiFetch } from '@/lib/api'

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

const REASON_OPTIONS = [
  { value: 'owner_request', label: 'Owner Request' },
  { value: 'design_change', label: 'Design Change' },
  { value: 'field_conditions', label: 'Field Conditions' },
  { value: 'code_requirement', label: 'Code Requirement' },
  { value: 'value_engineering', label: 'Value Engineering' },
  { value: 'other', label: 'Other' },
] as const

interface LocalAttachment {
  id: string
  name: string
  size: string
  file?: File
  url?: string
}

type CostItemDraft = {
  id: string
  description: string
  quantity: string
  unitPrice: string
}

type ApiProject = {
  id: string
  name: string
  address: string | null
  created_at: string
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

function NewChangeOrderContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectFromUrl = searchParams.get('project')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [projects, setProjects] = useState<ApiProject[]>([])

  const [formData, setFormData] = useState({
    projectId: '',
    changeOrderNumber: '',
    title: '',
    date: '',
    description: '',
    reason: 'owner_request',
    costImpact: '',
    scheduleNoImpact: false,
    scheduleImpactText: '',
    priority: 'normal' as 'low' | 'normal' | 'urgent',
    dueDate: '',
    notes: '',
  })

  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const [costItems, setCostItems] = useState<CostItemDraft[]>([])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reviewConfig, setReviewConfig] = useState<{
    reviewers: string[]
    expires_in_days: 3 | 7 | 14
  }>({
    reviewers: [],
    expires_in_days: 7,
  })

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await apiFetch<{ projects: ApiProject[] }>('/api/projects')
        setProjects(data.projects)
        setFormData((prev) => {
          if (prev.projectId) return prev
          const nextId =
            (projectFromUrl && data.projects.some((p) => p.id === projectFromUrl) ? projectFromUrl : null) ||
            data.projects[0]?.id ||
            ''
          return { ...prev, projectId: nextId }
        })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load projects')
      }
    }
    void loadProjects()
  }, [projectFromUrl])

  const selectedProject = projects.find((p) => p.id === formData.projectId)

  const reasonLabel =
    REASON_OPTIONS.find((r) => r.value === formData.reason)?.label ?? formData.reason
  const scheduleLabel = formData.scheduleNoImpact
    ? 'No Impact'
    : formData.scheduleImpactText.trim() || '—'

  const normalizedCostItems = costItems.map((item) => {
    const qty = Math.max(0, Number.parseFloat(item.quantity || '0') || 0)
    const unit = parseMoneyInput(item.unitPrice)
    return {
      ...item,
      qty,
      unit,
      lineTotal: qty * unit,
    }
  })
  const costBreakdownTotal = normalizedCostItems.reduce((sum, row) => sum + row.lineTotal, 0)

  const hasCostBreakdown =
    normalizedCostItems.some(
      (row) =>
        row.description.trim() ||
        (row.qty !== 0 || row.unit !== 0)
    )

  const costNumeric = hasCostBreakdown ? costBreakdownTotal : parseMoneyInput(formData.costImpact)

  useEffect(() => {
    if (!hasCostBreakdown) return
    const next = costBreakdownTotal ? formatUsd(costBreakdownTotal) : '0'
    setFormData((prev) => (prev.costImpact === next ? prev : { ...prev, costImpact: next }))
  }, [costBreakdownTotal, hasCostBreakdown])

  const addCostItem = () => {
    setCostItems((prev) => [
      ...prev,
      {
        id: `ci-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        description: '',
        quantity: '1',
        unitPrice: '0',
      },
    ])
  }

  const removeCostItem = (id: string) => setCostItems((prev) => prev.filter((i) => i.id !== id))

  const updateCostItem = (id: string, patch: Partial<CostItemDraft>) =>
    setCostItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const next: LocalAttachment[] = Array.from(files).map((file, index) => ({
      id: `new-${Date.now()}-${index}`,
      name: file.name,
      size: formatBytes(file.size),
      file,
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
      file,
    }))
    setAttachments((prev) => [...prev, ...next])
  }, [])

  // New Change Orders should never show placeholder "0 B" rows.
  // Only attachments with an actual File selected in this session are considered valid.
  const pendingUploadAttachments = attachments.filter((a) => Boolean(a.file))

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const handleDownloadAttachment = (attachment: LocalAttachment) => {
    // For files selected in this browser session, create a direct download.
    if (attachment.file) {
      const blobUrl = URL.createObjectURL(attachment.file)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = attachment.name
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 0)
      return
    }

    // For server-backed files, use provided URL when available.
    if (attachment.url && attachment.url !== '#') {
      const link = document.createElement('a')
      link.href = attachment.url
      link.download = attachment.name
      document.body.append(link)
      link.click()
      link.remove()
      return
    }

    toast.error('File content is not available for download yet')
  }

  const validateForm = () => {
    if (!formData.projectId) {
      toast.error('Please select a project')
      return false
    }
    if (!formData.title.trim()) {
      toast.error('Please enter a title')
      return false
    }
    if (!formData.date) {
      toast.error('Please select a date')
      return false
    }
    if (!formData.description.trim()) {
      toast.error('Please enter a description of change')
      return false
    }
    return true
  }

  const createDocument = async (asDraft: boolean) => {
    const uploaded = await uploadPendingAttachments({
      attachments: pendingUploadAttachments,
      accountIdHint: formData.projectId,
    })
    const docAttachments: DocAttachment[] = uploaded.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
      size: a.size,
      type: a.type,
    }))

    const content = buildChangeOrderHtml({
      coNumber: formData.changeOrderNumber,
      date: formData.date,
      projectName: selectedProject?.name ?? '',
      title: formData.title,
      description: formData.description,
      reasonLabel,
      cost: costNumeric,
      scheduleLabel,
      notes: formData.notes,
    })

    const costBreakdownRows = normalizedCostItems
      .filter((r) => r.description.trim() || r.qty !== 0 || r.unit !== 0)
      .map((r) => ({
        description: r.description.trim() || '—',
        quantity: r.qty,
        unitPrice: r.unit,
        total: r.lineTotal,
      }))

    const created = await apiFetch<{ document: { id: string } }>('/api/documents', {
      method: 'POST',
      json: {
        project_id: formData.projectId,
        doc_type: 'change_order',
        doc_number: formData.changeOrderNumber,
        title: formData.title,
        description: content,
        save_as_draft: asDraft,
        metadata: {
          reason: reasonLabel,
          proposedAmount: costNumeric,
          costBreakdownItems: costBreakdownRows.length ? costBreakdownRows : undefined,
          changeOrderNumber: formData.changeOrderNumber,
          changeOrderDate: formData.date,
          scheduleImpact: scheduleLabel,
          priority: formData.priority,
          actionNeededBy: formData.dueDate || undefined,
          notes: formData.notes || undefined,
          attachments: docAttachments,
        },
      },
    })
    return created.document.id
  }

  const handleSubmit = async (asDraft: boolean) => {
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      await createDocument(asDraft)
      toast.success(asDraft ? 'Draft saved successfully' : 'Change order generated successfully')
      router.push('/documents?type=change_order')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save change order')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSendForReview = async (payload: ReviewInviteSendPayload) => {
    if (!validateForm()) return
    if (payload.reviewers.length === 0) {
      toast.error('Add at least one reviewer before sending')
      return
    }

    setIsSubmitting(true)
    try {
      const documentId = await createDocument(false)
      try {
        await apiFetch(`/api/documents/${documentId}/send-for-review`, {
          method: 'POST',
          json: payload,
        })
        toast.success('Change order created and review invitations sent')
        router.push('/documents?type=change_order')
      } catch (sendErr) {
        toast.error(
          sendErr instanceof Error
            ? sendErr.message
            : 'Change order was saved but review emails could not be sent'
        )
        router.push(`/documents/${documentId}`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save change order')
    } finally {
      setIsSubmitting(false)
    }
  }

  const hintClass = 'mt-1.5 text-xs text-[#64748b]'

  return (
    <div
      className="min-h-full w-full px-3 py-6 sm:px-4 sm:py-7 lg:px-6 lg:py-8 xl:px-8 2xl:px-10"
      style={{ backgroundColor: PAGE_BG }}
    >
      <div className="mx-auto w-full max-w-[min(100%,1920px)]">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between lg:mb-10">
          <div className="min-w-0 max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight text-[#0f172a]">
              Create New Change Order
            </h1>
            <p className="mt-2 text-base leading-relaxed text-[#64748b]">
              Organize your change request by section. BuildSwift generates a professional document from your inputs.
            </p>
          </div>
          <Button
            variant="outline"
            className="shrink-0 gap-2 rounded-lg border-[#e2e8f0] bg-white px-4 text-[#0f172a] shadow-sm hover:bg-[#f8fafc]"
            asChild
          >
            <Link href="/documents?type=change_order">
              <ArrowLeft className="h-4 w-4" />
              Back to Change Orders
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6 md:gap-7 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 space-y-6">
            <div className={formCardClassName()}>
              <div className="grid gap-5 sm:grid-cols-3">
                <div className="min-w-0 sm:col-span-1">
                  <label className={capLabel}>
                    Project <span className="text-destructive">*</span>
                  </label>
                  <Select
                    value={formData.projectId}
                    onValueChange={(value) => setFormData((p) => ({ ...p, projectId: value }))}
                  >
                    <SelectTrigger className="w-full min-w-0 text-left">
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedProject?.address ? (
                    <p className="mt-1.5 text-xs text-[#94a3b8]">{selectedProject.address}</p>
                  ) : null}
                </div>
                <div>
                  <label className={capLabel}>
                    Change order number <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={formData.changeOrderNumber}
                    onChange={(e) => setFormData((p) => ({ ...p, changeOrderNumber: e.target.value }))}
                  />
                  <p className={hintClass}>Next number: CO-005</p>
                </div>
                <div>
                  <label className={capLabel}>
                    Document date <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className={formCardClassName()}>
              <div className="mb-6">
                <label className={capLabel}>
                  Title <span className="text-destructive">*</span>
                </label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g., Additional Electrical Outlets - Levels 2 and 3"
                />
              </div>

              <div className="mb-3 flex items-center justify-between gap-3">
                <span className={capLabelRow}>
                  Description of change <span className="text-destructive">*</span>
                </span>
              </div>
              <MissingScopeEditorSection
                variant="document-description"
                documentApiType={docTypeToMissingScopeType('change_order')}
                value={formData.description}
                onChange={(v) => setFormData((prev) => ({ ...prev, description: v }))}
                aiNotes={formData.notes}
                rows={8}
                placeholder="Describe the requested change, affected area, and intended outcome..."
              />
              <p className={hintClass}>{formData.description.length} characters</p>
            </div>

            <div className={formCardClassName()}>
              <h2 className="mb-5 text-lg font-semibold text-[#0f172a]">Change details</h2>
              <div className="grid gap-5 sm:grid-cols-3">
                <div>
                  <label className={capLabel}>Reason for change</label>
                  <Select
                    value={formData.reason}
                    onValueChange={(value) => setFormData((p) => ({ ...p, reason: value }))}
                  >
                    <SelectTrigger className="w-full">
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
                </div>
                <div>
                  <label className={capLabel}>Cost impact</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      $
                    </span>
                    <Input
                      value={formData.costImpact}
                      onChange={(e) => setFormData((p) => ({ ...p, costImpact: e.target.value }))}
                      className="pl-7 pr-14"
                      placeholder="8,750.00"
                      readOnly={hasCostBreakdown}
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
                      htmlFor="new-co-schedule-no-impact"
                      className="flex shrink-0 cursor-pointer items-center gap-2 text-sm whitespace-nowrap text-[#0f172a]"
                    >
                      <Checkbox
                        checked={formData.scheduleNoImpact}
                        onCheckedChange={(checked) =>
                          setFormData((p) => ({ ...p, scheduleNoImpact: checked === true }))
                        }
                        id="new-co-schedule-no-impact"
                      />
                      <span>No Impact</span>
                    </label>
                    <Input
                      className="min-w-0 flex-1"
                      value={formData.scheduleImpactText}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, scheduleImpactText: e.target.value }))
                      }
                      disabled={formData.scheduleNoImpact}
                      placeholder="+ 5 days"
                      aria-label="Schedule impact description"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className={formCardClassName()}>
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#0f172a]">Cost Breakdown</h2>
                  <p className="text-sm text-[#64748b]">Update line items for this change order</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 gap-2 rounded-lg border-[#e2e8f0] bg-white px-4 text-[#0f172a] shadow-sm hover:bg-[#f8fafc]"
                  onClick={addCostItem}
                >
                  <Plus className="h-4 w-4" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-3">
                {normalizedCostItems.map((row) => (
                  <div key={row.id} className="rounded-lg border border-[#e2e8f0] bg-white p-4">
                    <div className="flex items-center gap-3">
                      <Input
                        value={row.description}
                        onChange={(e) => updateCostItem(row.id, { description: e.target.value })}
                        placeholder="Description"
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => removeCostItem(row.id)}
                        className="rounded-md p-2 text-[#ef4444] transition-colors hover:bg-red-50"
                        aria-label="Remove cost item"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className={capLabel}>Quantity</label>
                        <Input
                          inputMode="decimal"
                          value={row.quantity}
                          onChange={(e) => updateCostItem(row.id, { quantity: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className={capLabel}>Unit Price ($)</label>
                        <Input
                          inputMode="decimal"
                          value={row.unitPrice}
                          onChange={(e) => updateCostItem(row.id, { unitPrice: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className={capLabel}>Total</label>
                        <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                          {row.lineTotal ? `$${formatUsd(row.lineTotal)}` : '$0'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {normalizedCostItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-6 text-center text-sm text-[#64748b]">
                    No items yet. Click <span className="font-semibold text-[#0f172a]">Add Item</span> to create your first line item.
                  </div>
                ) : null}
              </div>

              <div className="mt-4 rounded-lg bg-[#f1f5f9] px-4 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#0f172a]">Total Cost</p>
                  <p className="text-lg font-bold text-[#f97316]">
                    {costBreakdownTotal ? `$${formatUsd(costBreakdownTotal)}` : '$0'}
                  </p>
                </div>
              </div>
            </div>

            <div className={formCardClassName()}>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[#0f172a]">Supporting documents</h2>
                <span className="rounded-full bg-[#dbeafe] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#1e40af]">
                  Upload related files
                </span>
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
                  Drag and drop change docs or{' '}
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
                {pendingUploadAttachments.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="h-5 w-5 shrink-0 text-[#64748b]" />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDownloadAttachment(file)
                          }}
                          className="truncate text-left text-sm font-semibold text-[#0f172a] hover:text-[#1e3a8a]"
                        >
                          {file.name}
                        </button>
                        <p className="text-xs text-[#64748b]">{file.size}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeAttachment(file.id)
                      }}
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
                value={formData.notes}
                onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Please review and approve. Work to begin upon approval."
                rows={3}
                className="resize-none"
              />
              <p className={hintClass}>{formData.notes.length} characters</p>
            </div>

            <div className="flex flex-col gap-3 border-t border-[#e2e8f0] pt-6 sm:flex-row sm:items-center sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="gap-2 border-2 border-dashed border-[#60a5fa] bg-white text-[#1e3a8a] shadow-sm hover:bg-[#eff6ff]"
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting}
              >
                <Save className="h-4 w-4" />
                Save as Draft
              </Button>
              <Button
                type="button"
                variant="default"
                className="min-w-[10rem] !bg-[#0b1d3a] text-white shadow-[0_4px_14px_rgba(15,23,42,0.25)] hover:!bg-[#132b4f] hover:brightness-100"
                onClick={() =>
                  void handleSendForReview({
                    reviewers: reviewConfig.reviewers,
                    expires_in_days: reviewConfig.expires_in_days,
                    resend: false,
                  })
                }
                disabled={isSubmitting || reviewConfig.reviewers.length === 0}
              >
                Send for Review
              </Button>
            </div>
          </div>

          <aside className="w-full min-w-0 space-y-6 lg:sticky lg:top-6 lg:self-start">
            <div className={formCardClassName()}>
              <ReviewerManagementSection
                embedded
                layout="create"
                onReviewConfigChange={setReviewConfig}
                onSend={handleSendForReview}
              />
            </div>

            <div className={formCardClassName()}>
              <h3 className="mb-5 text-lg font-semibold text-[#0f172a]">
                Categorization
              </h3>
              <div className="space-y-4">
                <div>
                  <label className={capLabel}>Priority level</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['low', 'normal', 'urgent'] as const).map((level) => {
                      const active = formData.priority === level
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setFormData((p) => ({ ...p, priority: level }))}
                          className={cn(
                            'h-10 rounded-xl border text-sm font-semibold transition-colors',
                            active
                              ? 'border-[#0f172a] bg-[#0f172a] text-white'
                              : 'border-[#e2e8f0] bg-white text-[#334155] hover:bg-[#f8fafc]'
                          )}
                        >
                          {level.charAt(0).toUpperCase() + level.slice(1)}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="border-t border-[#e2e8f0] pt-4">
                  <label className={capLabel}>Due date</label>
                  <Input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData((p) => ({ ...p, dueDate: e.target.value }))}
                  />
                </div>
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

            <div className={formCardClassName()}>
              <h3 className="mb-5 text-lg font-semibold text-[#0f172a]">
                Summary
              </h3>

              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">Project</p>
                  <p className="text-sm font-semibold" style={{ color: NAVY }}>
                    {selectedProject?.name ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">{selectedProject?.address ?? ''}</p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-muted-foreground">Change Order #</p>
                  <p className="text-sm font-semibold" style={{ color: NAVY }}>
                    {formData.changeOrderNumber || '—'}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-muted-foreground">Title</p>
                  <p className="text-sm font-semibold leading-snug" style={{ color: NAVY }}>
                    {formData.title || '—'}
                  </p>
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

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-muted-foreground">Cost Impact</p>
                  <p className="text-2xl font-bold tracking-tight" style={{ color: NAVY }}>
                    {formData.costImpact.trim()
                      ? `$${formatUsd(parseMoneyInput(formData.costImpact))}`
                      : '—'}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-muted-foreground">Schedule Impact</p>
                  <p className="text-2xl font-bold tracking-tight" style={{ color: NAVY }}>
                    {scheduleLabel}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-muted-foreground">Priority</p>
                  <p className="text-sm font-semibold" style={{ color: NAVY }}>
                    {formData.priority.charAt(0).toUpperCase() + formData.priority.slice(1)}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className="text-sm font-semibold" style={{ color: NAVY }}>
                    {formData.dueDate
                      ? new Date(formData.dueDate + 'T12:00:00').toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : '—'}
                  </p>
                </div>
              </div>
            </div>

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
          </aside>
        </div>
      </div>
    </div>
  )
}

export default function NewChangeOrderPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <NewChangeOrderContent />
    </Suspense>
  )
}
