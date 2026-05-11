'use client'

import type { ReactNode } from 'react'
import { useState, useRef, useCallback, Suspense, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  CalendarClock,
  CircleDollarSign,
  Save,
  Upload,
  X,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  type ReviewInviteSendPayload,
} from '@/app/components/reviewer-management-section'
import { MissingScopeEditorSection } from '../../../components/missing-scope-editor-section'
import { docTypeToMissingScopeType } from '@/lib/missing-scope-client'
import { apiFetch } from '@/lib/api'
import {
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

/** Impact pillar cards — accent is a top border color (Tailwind). */
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
        'flex h-full flex-col rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm ring-1 ring-[#f1f5f9]',
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
          <p className="text-sm font-semibold leading-snug tracking-tight text-[#0f172a]">{args.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#64748b]">{args.description}</p>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1">{args.children}</div>
      {args.footer ? <div className="mt-4 border-t border-[#f1f5f9] pt-4">{args.footer}</div> : null}
    </div>
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
    originalContractAmount: '',
    priority: 'normal' as 'low' | 'normal' | 'urgent',
    dueDate: '',
    notes: '',
  })

  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const [schedule, setSchedule] = useState<ChangeOrderScheduleState>({
    enabled: false,
    duration: '',
    unit: 'days',
    dayType: '',
  })
  const [baseline, setBaseline] = useState<ChangeOrderBaselineState>({
    value: '',
    unit: 'days',
    dayType: 'calendar',
  })
  const [cost, setCost] = useState<ChangeOrderCostState>({
    type: 'increase',
    labor: '',
    materials: '',
    equipment: '',
    subcontractor: '',
    other: '',
    markupPercent: '',
    justificationNote: '',
  })
  const [impactErrors, setImpactErrors] = useState<ChangeOrderImpactValidationErrors>({})

  const [isSubmitting, setIsSubmitting] = useState(false)

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
  const scheduleLabel = formatScheduleLabel(schedule)

  const derived = useMemo(
    () =>
      computeDerived({
        schedule,
        baseline,
        cost,
        originalContractAmountRaw: formData.originalContractAmount,
      }),
    [schedule, baseline, cost, formData.originalContractAmount]
  )

  const scheduleComputed = useMemo(() => computeSchedule(schedule), [schedule])

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
    setImpactErrors({})
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

    const impactValidation = validateChangeOrderImpact({ schedule, baseline, cost })
    if (!impactValidation.ok) {
      setImpactErrors(impactValidation.errors)
      const firstKey =
        (Object.keys(impactValidation.errors)[0] as keyof ChangeOrderImpactValidationErrors | undefined) ??
        null
      toast.error('Please review the schedule/cost impact fields.')
      const focusId =
        firstKey === 'scheduleDuration'
          ? 'co-schedule-duration'
          : firstKey === 'scheduleDayType'
            ? 'co-schedule-day-type'
            : firstKey === 'baselineDuration'
              ? 'co-original-duration-normalized'
              : firstKey === 'baselineDayType'
                ? 'co-original-duration-normalized'
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
      cost: derived.costTotal,
      scheduleLabel,
      notes: formData.notes,
    })

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
          changeOrderNumber: formData.changeOrderNumber,
          changeOrderDate: formData.date,
          priority: formData.priority,
          actionNeededBy: formData.dueDate || undefined,
          notes: formData.notes || undefined,
          attachments: docAttachments,
          ...serializeChangeOrderImpactToMetadata({
            schedule,
            baseline,
            cost,
            derived,
            originalContractAmount: formData.originalContractAmount,
          }),
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

  const handleSendForReview = async (_payload: ReviewInviteSendPayload) => {
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      // Create as draft first; reviewer details are collected on the next screen.
      const documentId = await createDocument(true)
      router.push(`/documents/${documentId}/send-for-review`)
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
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 lg:mb-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 max-w-3xl">
              <h1 className="text-3xl font-bold tracking-tight text-[#0f172a]">
                Create New Change Order
              </h1>
              <p className="mt-2 text-base leading-relaxed text-[#64748b]">
                Organize your change request by section. BuildSwift generates a professional document from your inputs.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
              <Button
                type="button"
                variant="outline"
                className="gap-2 sm:shrink-0"
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting}
              >
                <Save className="h-4 w-4" />
                Save as Draft
              </Button>
              <Button
                type="button"
                variant="default"
                className="min-w-[10rem] sm:shrink-0"
                onClick={() =>
                  void handleSendForReview({
                    reviewers: [],
                    expires_in_days: 7,
                    resend: false,
                  })
                }
                disabled={isSubmitting}
              >
                Send for Review
              </Button>
              <Button
                variant="outline"
                className="shrink-0 gap-2 rounded-lg border-[#e2e8f0] bg-white px-4 text-[#0f172a] shadow-sm hover:bg-[#f8fafc] sm:shrink-0"
                asChild
              >
                <Link href="/documents?type=change_order">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Change Orders
                </Link>
              </Button>
            </div>
          </div>
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
            </div>

            <div className={formCardClassName()}>
              <div className="border-b border-[#f1f5f9] pb-6">
                <h2 className="text-lg font-semibold tracking-tight text-[#0f172a]">Change details</h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[#64748b]">
                  Capture schedule extension and cost categories. Enter normalized original duration alongside contract
                  values in the snapshot below.
                </p>
              </div>

              <div className="mt-8 space-y-8">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:gap-x-6 lg:gap-x-8">
                  <label htmlFor="co-change-reason" className={cn(capLabel, '!mb-0')}>
                    Reason for change
                  </label>
                  <label htmlFor="co-due-date" className={cn(capLabel, '!mb-0')}>
                    Due date
                  </label>
                  <div className="min-w-0">
                    <Select
                      value={formData.reason}
                      onValueChange={(value) => setFormData((p) => ({ ...p, reason: value }))}
                    >
                      <SelectTrigger id="co-change-reason" className="w-full bg-white">
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
                  <div className="min-w-0">
                    <Input
                      id="co-due-date"
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData((p) => ({ ...p, dueDate: e.target.value }))}
                      className="bg-white [color-scheme:light]"
                    />
                  </div>
                </div>

                <div>
                  <label className={capLabel}>Priority level</label>
                  <div className="mt-2 grid max-w-xl grid-cols-3 gap-3">
                    {(
                      [
                        { level: 'low', dot: 'bg-[#10B981]' },
                        { level: 'normal', dot: 'bg-[#6366F1]' },
                        { level: 'urgent', dot: 'bg-[#EF4444]' },
                      ] as const
                    ).map(({ level, dot }) => {
                      const active = formData.priority === level
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setFormData((p) => ({ ...p, priority: level }))}
                          className={cn(
                            'flex h-10 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition-colors',
                            active
                              ? 'border-[#6366F1] bg-white text-[#6366F1]'
                              : 'border-[#e2e8f0] bg-white text-[#334155] hover:bg-[#f8fafc]'
                          )}
                        >
                          <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
                          {level.charAt(0).toUpperCase() + level.slice(1)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-10">
                <p className={capLabel}>Impacts</p>
                <p className="mt-1 text-sm text-[#64748b]">
                  Schedule and cost sections — revise duration totals from the Contract & duration snapshot.
                </p>
                <div className="mt-5 grid grid-cols-1 gap-5">
                  <CoImpactCardShell
                    accentBorder="border-t-[3px] border-t-sky-500"
                    iconBg="bg-sky-50"
                    iconClass="text-sky-700"
                    icon={<CalendarClock aria-hidden />}
                    title="Schedule impact"
                    description="Extension to the schedule from this change order (optional)."
                    footer={
                      <p className="text-[11px] font-medium leading-relaxed text-[#64748b]">
                        {!schedule.enabled ? (
                          <span className="inline-flex items-center rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[#475569]">
                            No schedule extension
                          </span>
                        ) : scheduleComputed.valid ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">
                            Equivalent · {derived.scheduleDaysTotal} calendar day
                            {derived.scheduleDaysTotal === 1 ? '' : 's'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-amber-900">
                            Enter duration
                            {schedule.unit === 'days' ? ' and day type' : ''} to see equivalent days
                          </span>
                        )}
                      </p>
                    }
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSchedule((p) => ({ ...p, enabled: true }))}
                        className={cn(
                          'h-10 rounded-lg border text-sm font-semibold transition-colors',
                          schedule.enabled
                            ? 'border-[#6366F1] bg-[#6366F1] text-white shadow-sm'
                            : 'border-[#e2e8f0] bg-white text-[#334155] hover:bg-[#f8fafc]'
                        )}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setSchedule({ enabled: false, duration: '', unit: 'days', dayType: '' })}
                        className={cn(
                          'h-10 rounded-lg border text-sm font-semibold transition-colors',
                          !schedule.enabled
                            ? 'border-[#6366F1] bg-[#6366F1] text-white shadow-sm'
                            : 'border-[#e2e8f0] bg-white text-[#334155] hover:bg-[#f8fafc]'
                        )}
                      >
                        No
                      </button>
                    </div>

                    {schedule.enabled ? (
                      <div className="mt-4 space-y-3">
                        <div>
                          <label className={capLabel}>Duration</label>
                          <Input
                            id="co-schedule-duration"
                            inputMode="numeric"
                            value={schedule.duration}
                            onChange={(e) => {
                              setImpactErrors((p) => ({ ...p, scheduleDuration: undefined }))
                              setSchedule((p) => ({ ...p, duration: e.target.value }))
                            }}
                            placeholder="Whole number, e.g. 5"
                            className="bg-white"
                          />
                          {impactErrors.scheduleDuration ? (
                            <p className="mt-1 text-xs text-destructive">{impactErrors.scheduleDuration}</p>
                          ) : null}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={capLabel}>Unit</label>
                            <Select
                              value={schedule.unit}
                              onValueChange={(v) =>
                                setSchedule((p) => ({
                                  ...p,
                                  unit: v === 'weeks' ? 'weeks' : 'days',
                                  dayType: v === 'weeks' ? '' : p.dayType,
                                }))
                              }
                            >
                              <SelectTrigger className="w-full bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="days">Days</SelectItem>
                                <SelectItem value="weeks">Weeks</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {schedule.unit === 'days' ? (
                            <div>
                              <label className={capLabel}>Day type</label>
                              <Select
                                value={schedule.dayType}
                                onValueChange={(v) => {
                                  setImpactErrors((p) => ({ ...p, scheduleDayType: undefined }))
                                  setSchedule((p) => ({
                                    ...p,
                                    dayType: v === 'business' ? 'business' : v === 'calendar' ? 'calendar' : '',
                                  }))
                                }}
                              >
                                <SelectTrigger className="w-full bg-white" id="co-schedule-day-type">
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
                    accentBorder="border-t-[3px] border-t-[#f97316]"
                    iconBg="bg-orange-50"
                    iconClass="text-[#c2410c]"
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
                        const active = cost.type === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              setCost((p) => ({
                                ...p,
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
                              }))
                            }
                            className={cn(
                              'min-h-[2.75rem] rounded-lg border px-2 py-2 text-center text-[11px] font-semibold leading-tight transition-colors sm:text-xs',
                              active
                                ? 'border-[#6366F1] bg-[#6366F1] text-white shadow-sm'
                                : 'border-[#e2e8f0] bg-white text-[#334155] hover:bg-[#f8fafc]'
                            )}
                          >
                            {opt.value === 'decrease' ? (
                              <>
                                Decrease
                                <span className="mt-0.5 block text-[10px] font-normal opacity-90">(credit)</span>
                              </>
                            ) : (
                              opt.label
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {cost.type === 'none' ? (
                      <div className="mt-4">
                        <label className={capLabel}>
                          Justification <span className="text-destructive">*</span>
                        </label>
                        <Textarea
                          id="co-cost-justification"
                          value={cost.justificationNote}
                          onChange={(e) => {
                            setImpactErrors((p) => ({ ...p, costJustification: undefined }))
                            setCost((p) => ({ ...p, justificationNote: e.target.value }))
                          }}
                          rows={4}
                          className="resize-none bg-white"
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
                            ] as const
                          ).map((row, idx) => (
                            <div key={row.key}>
                              <label className={capLabel}>{row.label}</label>
                              <div className="relative">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]">
                                  $
                                </span>
                                <Input
                                  id={idx === 0 ? 'co-cost-labor' : undefined}
                                  inputMode="decimal"
                                  value={cost[row.key]}
                                  onChange={(e) => {
                                    setImpactErrors((p) => ({ ...p, costAtLeastOne: undefined }))
                                    setCost((p) => ({ ...p, [row.key]: e.target.value } as any))
                                  }}
                                  className="bg-white pl-7 pr-14"
                                  placeholder="0.00"
                                />
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#94a3b8]">
                                  USD
                                </span>
                              </div>
                            </div>
                          ))}
                          <div>
                            <label className={capLabel}>Other</label>
                            <div className="relative">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]">
                                $
                              </span>
                              <Input
                                inputMode="decimal"
                                value={cost.other}
                                onChange={(e) => {
                                  setImpactErrors((p) => ({ ...p, costAtLeastOne: undefined }))
                                  setCost((p) => ({ ...p, other: e.target.value }))
                                }}
                                className="bg-white pl-7 pr-14"
                                placeholder="0.00"
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#94a3b8]">
                                USD
                              </span>
                            </div>
                          </div>
                          <div>
                            <label className={capLabel}>Markup % (optional)</label>
                            <Input
                              inputMode="decimal"
                              value={cost.markupPercent}
                              onChange={(e) => setCost((p) => ({ ...p, markupPercent: e.target.value }))}
                              placeholder="e.g. 10"
                              className="bg-white"
                            />
                          </div>
                        </div>

                        {impactErrors.costAtLeastOne ? (
                          <p className="text-xs text-destructive">{impactErrors.costAtLeastOne}</p>
                        ) : null}

                        <div className="rounded-xl border border-[#e2e8f0] bg-[#fafafa] px-4 py-3.5">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">
                              Subtotal
                            </p>
                            <p className="font-mono text-sm font-bold tabular-nums text-[#0f172a]">
                              ${formatUsd(derived.costSubtotal)}
                            </p>
                          </div>
                          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-[#e2e8f0] pt-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">
                              Total impact
                            </p>
                            <p className="font-mono text-base font-bold tabular-nums text-[#f97316]">
                              {formatSignedUsd(derived.costTotal, cost.type)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </CoImpactCardShell>
                </div>
              </div>

              <div className="mt-10 rounded-2xl border border-[#e2e8f0] bg-gradient-to-b from-[#f8fafc] to-[#f1f5f9]/80 p-6">
                <p className={capLabel}>Contract & duration snapshot</p>
                <p className="mt-1 text-sm leading-relaxed text-[#64748b]">
                  Enter original contract amount and normalized duration below; revised values reflect cost and schedule
                  impacts for PDFs and reviewers.
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="space-y-4">
                    <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-sm">
                      <label className={capLabel}>Original contract amount</label>
                      <div className="relative mt-2">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]">
                          $
                        </span>
                        <Input
                          value={formData.originalContractAmount}
                          onChange={(e) =>
                            setFormData((p) => ({ ...p, originalContractAmount: e.target.value }))
                          }
                          className="pl-7 pr-14"
                          placeholder="0.00"
                          inputMode="decimal"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#94a3b8]">
                          USD
                        </span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-sm">
                      <label className={capLabel}>Revised contract amount</label>
                      <div className="mt-2 flex min-h-[2.75rem] items-center rounded-lg border border-[#e2e8f0] bg-[#fafafa] px-3 font-mono text-sm font-semibold tabular-nums text-[#0f172a]">
                        {derived.revisedContractAmount === null ? '—' : `$${formatUsd(derived.revisedContractAmount)}`}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-sm">
                      <label className={capLabel}>
                        Original duration (normalized) <span className="text-destructive">*</span>
                      </label>
                      <Input
                        id="co-original-duration-normalized"
                        inputMode="numeric"
                        value={baseline.value}
                        onChange={(e) => {
                          setImpactErrors((p) => ({ ...p, baselineDuration: undefined, baselineDayType: undefined }))
                          setBaseline((p) => ({
                            ...p,
                            value: e.target.value,
                            unit: 'days',
                            dayType: 'calendar',
                          }))
                        }}
                        className="mt-2 bg-white"
                        placeholder="Whole calendar days, e.g., 240"
                      />
                      {impactErrors.baselineDuration ? (
                        <p className="mt-1 text-xs text-destructive">{impactErrors.baselineDuration}</p>
                      ) : null}
                    </div>
                    <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-sm">
                      <label className={capLabel}>Revised duration (normalized)</label>
                      <div className="mt-2 flex min-h-[2.75rem] items-center rounded-lg border border-[#e2e8f0] bg-[#fafafa] px-3 text-sm font-medium tabular-nums text-[#334155]">
                        {derived.revisedDaysTotal === null ? '—' : `${derived.revisedDaysTotal} calendar days`}
                      </div>
                    </div>
                  </div>
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
          </div>

          <aside className="w-full min-w-0 space-y-6 lg:sticky lg:top-6 lg:self-start">
            <div className={formCardClassName()}>
              <h3 className="mb-5 text-lg font-semibold text-[#0f172a]">Summary</h3>

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
                  <p className="text-xs text-muted-foreground">Document Date</p>
                  <p className="text-sm font-semibold" style={{ color: NAVY }}>
                    {formData.date
                      ? new Date(formData.date + 'T12:00:00').toLocaleDateString('en-US', {
                          month: '2-digit',
                          day: '2-digit',
                          year: 'numeric',
                        })
                      : '—'}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-muted-foreground">Cost Impact</p>
                  <p className="text-2xl font-bold tracking-tight" style={{ color: NAVY }}>
                    {cost.type === 'none' ? '—' : formatSignedUsd(derived.costTotal, cost.type)}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-muted-foreground">Schedule Impact</p>
                  <p className="text-2xl font-bold tracking-tight" style={{ color: NAVY }}>
                    {scheduleLabel}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-muted-foreground">Reason for change</p>
                  <p className="text-sm font-semibold" style={{ color: NAVY }}>
                    {reasonLabel}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-muted-foreground">Priority level</p>
                  <p className="text-sm font-semibold" style={{ color: NAVY }}>
                    {formData.priority.charAt(0).toUpperCase() + formData.priority.slice(1)}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-muted-foreground">Due date</p>
                  <p className="text-sm font-semibold" style={{ color: NAVY }}>
                    {formData.dueDate
                      ? new Date(formData.dueDate + 'T12:00:00').toLocaleDateString('en-US', {
                          month: '2-digit',
                          day: '2-digit',
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
