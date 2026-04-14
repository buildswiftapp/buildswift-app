'use client'

import { useState, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Sparkles,
  Upload,
  X,
  FileText,
  Eye,
  Lightbulb,
  Save,
  CalendarDays,
} from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
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
import { ReviewerManagementSection } from '@/app/components/reviewer-management-section'
import { MissingScopeCallout } from '@/app/components/missing-scope-callout'

const NAVY = '#0f172a'

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
  const { projects, addDocument, user } = useApp()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const defaultProjectId =
    (projectFromUrl && projects.some((p) => p.id === projectFromUrl) ? projectFromUrl : null) ||
    projects[0]?.id ||
    ''

  const [formData, setFormData] = useState({
    projectId: defaultProjectId,
    changeOrderNumber: 'CO-005',
    title: 'Additional Electrical Outlets – Levels 2 & 3',
    date: '2025-04-24',
    description:
      "Per client request, add (12) duplex electrical outlets to Levels 2 and 3. Locations to be coordinated on-site with owner's representative. Includes materials, labor, and testing.",
    reason: 'owner_request',
    costImpact: '8750.00',
    scheduleImpact: '+5',
    notes: 'Please review and approve. Work to begin upon approval.',
  })

  const [attachments, setAttachments] = useState<LocalAttachment[]>([
    { id: '1', name: 'Electrical_Layout_Level2.pdf', size: '245 KB' },
    { id: '2', name: 'Electrical_Layout_Level3.pdf', size: '198 KB' },
    { id: '3', name: 'Site_Photo_Outlet_Location.jpg', size: '1.2 MB' },
  ])

  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedProject = projects.find((p) => p.id === formData.projectId)

  const reasonLabel =
    REASON_OPTIONS.find((r) => r.value === formData.reason)?.label ?? formData.reason
  const scheduleLabel =
    SCHEDULE_OPTIONS.find((s) => s.value === formData.scheduleImpact)?.label ?? '—'

  const costNumeric = parseMoneyInput(formData.costImpact)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const next: LocalAttachment[] = Array.from(files).map((file, index) => ({
      id: `new-${Date.now()}-${index}`,
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

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const docAttachments: DocAttachment[] = attachments.map((a) => ({
    id: a.id,
    name: a.name,
    url: '#',
    size: 0,
    type: a.name.split('.').pop() || 'file',
  }))

  const handleSubmit = async (asDraft: boolean) => {
    if (!formData.projectId) {
      toast.error('Please select a project')
      return
    }
    if (!formData.title.trim()) {
      toast.error('Please enter a title')
      return
    }
    if (!formData.date) {
      toast.error('Please select a date')
      return
    }
    if (!formData.description.trim()) {
      toast.error('Please enter a description of change')
      return
    }

    setIsSubmitting(true)
    try {
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

      addDocument({
        projectId: formData.projectId,
        type: 'change_order',
        title: formData.title,
        content,
        status: asDraft ? 'draft' : 'pending_review',
        createdBy: user?.id || 'user-1',
        dueDate: formData.date,
        metadata: {
          reason: reasonLabel,
          proposedAmount: costNumeric,
          changeOrderNumber: formData.changeOrderNumber,
          changeOrderDate: formData.date,
          scheduleImpact: scheduleLabel,
          notes: formData.notes || undefined,
          attachments: docAttachments,
        },
      })

      toast.success(asDraft ? 'Draft saved successfully' : 'Change order generated successfully')
      router.push('/documents?type=change_order')
    } catch {
      toast.error('Failed to save change order')
    } finally {
      setIsSubmitting(false)
    }
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

  const labelClass = 'mb-1.5 block text-sm font-medium'
  const hintClass = 'mt-1.5 text-xs text-muted-foreground'

  return (
    <div className="min-h-full bg-[#f8f9fb] px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: NAVY }}>
              Create New Change Order
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Enter the details below. BuildSwift will generate a professional change order document
              based on your input.
            </p>
          </div>
          <Button
            variant="outline"
            className="shrink-0 gap-2 rounded-lg border-slate-200 bg-white px-4 shadow-sm hover:bg-slate-50"
            style={{ color: NAVY }}
            asChild
          >
            <Link href="/documents?type=change_order">
              <ArrowLeft className="h-4 w-4" />
              Back to Change Orders
            </Link>
          </Button>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 lg:max-w-[calc(100%-20rem)]">
            <Card className="border border-slate-200/80 bg-white shadow-sm">
              <CardContent className="space-y-10 p-6 sm:p-8">
                <section>
                  {sectionTitle(1, 'Project & Change Order Info')}
                  <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <div className="min-w-0">
                      <label className={labelClass} style={{ color: NAVY }}>
                        Project <span className="text-destructive">*</span>
                      </label>
                      <Select
                        value={formData.projectId}
                        onValueChange={(value) => setFormData({ ...formData, projectId: value })}
                      >
                        <SelectTrigger className="h-9 w-full min-w-0 rounded-lg border-slate-200 text-left shadow-xs">
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
                      {selectedProject ? (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {selectedProject.projectNumber} • {selectedProject.address}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <label className={labelClass} style={{ color: NAVY }}>
                        Change Order Number <span className="text-destructive">*</span>
                      </label>
                      <Input
                        value={formData.changeOrderNumber}
                        onChange={(e) =>
                          setFormData({ ...formData, changeOrderNumber: e.target.value })
                        }
                        className="rounded-lg border-slate-200 shadow-xs"
                      />
                      <p className={hintClass}>Next number: CO-005</p>
                    </div>

                    <div className="sm:col-span-2">
                      <label className={labelClass} style={{ color: NAVY }}>
                        Title <span className="text-destructive">*</span>
                      </label>
                      <Input
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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
                          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                          className="rounded-lg border-slate-200 pr-10 shadow-xs"
                        />
                        <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  {sectionTitle(2, 'Description of Change', true)}
                  <p className="mb-3 text-sm text-muted-foreground">
                    Provide a clear description of the work change.
                  </p>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={5}
                    className="resize-none rounded-lg border-slate-200 text-[15px] leading-relaxed shadow-xs"
                  />
                  <p className={hintClass}>{formData.description.length} characters</p>
                </section>

                <MissingScopeCallout />

                <section>
                  {sectionTitle(3, 'Reason for Change')}
                  <Select
                    value={formData.reason}
                    onValueChange={(value) => setFormData({ ...formData, reason: value })}
                  >
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
                  <p className={hintClass}>Why is this change necessary?</p>
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
                          value={formData.costImpact}
                          onChange={(e) =>
                            setFormData({ ...formData, costImpact: e.target.value })
                          }
                          className="rounded-lg border-slate-200 pl-7 pr-14 shadow-xs"
                          placeholder="8,750.00"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          USD
                        </span>
                      </div>
                      <p className={hintClass}>Enter 0 if no cost impact</p>
                    </div>

                    <div>
                      <label className={labelClass} style={{ color: NAVY }}>
                        Schedule Impact
                      </label>
                      <Select
                        value={formData.scheduleImpact}
                        onValueChange={(value) =>
                          setFormData({ ...formData, scheduleImpact: value })
                        }
                      >
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
                      <p className={hintClass}>How many days will this add to the schedule?</p>
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
                      <span className="text-primary underline underline-offset-2">
                        click to browse
                      </span>
                    </p>
                    <p className="mt-1 text-center text-xs text-muted-foreground">
                      Drawings, photos, specifications, etc. (PDF, JPG, PNG, DOC)
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
                          className="flex items-center justify-between rounded-lg border border-sky-100 bg-sky-50/90 px-4 py-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <FileText className="h-5 w-5 shrink-0 text-sky-700/70" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-sky-950 underline decoration-sky-300">
                                {file.name}
                              </p>
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
                            aria-label={`Remove ${file.name}`}
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
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Please review and approve. Work to begin upon approval."
                    rows={3}
                    className="resize-none rounded-lg border-slate-200 shadow-xs"
                  />
                  <p className={hintClass}>{formData.notes.length} characters</p>
                </section>

                <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    onClick={() => handleSubmit(false)}
                    disabled={isSubmitting}
                    className="gap-2 rounded-lg px-5 shadow-sm"
                  >
                    <Sparkles className="h-4 w-4" />
                    Generate Change Order
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSubmit(true)}
                    disabled={isSubmitting}
                    className="gap-2 rounded-lg border-slate-200 bg-white px-5 shadow-xs"
                    style={{ color: NAVY }}
                  >
                    <Save className="h-4 w-4" />
                    Save Draft
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="w-full shrink-0 space-y-4 lg:w-88">
            <Card className="border border-slate-200/80 bg-white shadow-sm">
              <CardContent className="p-6">
                <h3 className="mb-5 text-base font-semibold" style={{ color: NAVY }}>
                  Summary
                </h3>

                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Project</p>
                    <p className="text-sm font-semibold" style={{ color: NAVY }}>
                      {selectedProject?.name ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedProject?.projectNumber ?? ''}
                    </p>
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

                  <Button
                    type="button"
                    className="mt-2 w-full gap-2 rounded-lg shadow-sm"
                    onClick={() =>
                      toast.message('Preview', {
                        description: 'Document preview will open here.',
                      })
                    }
                  >
                    <Eye className="h-4 w-4" />
                    Preview Document
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 bg-sky-50/90 shadow-sm ring-1 ring-sky-100">
              <CardContent className="p-5">
                <div className="flex gap-3">
                  <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-sky-800/70" />
                  <div>
                    <h4 className="text-sm font-semibold" style={{ color: NAVY }}>
                      Need Help?
                    </h4>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Be specific and detailed for better results. You can always edit before
                      generating.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <ReviewerManagementSection />
          </div>
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
