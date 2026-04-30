'use client'

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Upload,
  X,
  Eye,
  Save,
  FileImage,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
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
import type { Attachment as DocAttachment, DocumentType, Project } from '@/lib/types'
import { uploadPendingAttachments } from '@/lib/supabase/upload-attachments'
import { MissingScopeEditorSection } from '../../../components/missing-scope-editor-section'
import { docTypeToMissingScopeType } from '@/lib/missing-scope-client'
import { buildRfiDescriptionBody, buildSubmittalDescriptionBody } from '@/lib/document-html'

const PAGE_BG = '#f1f5f9'
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

const capLabel = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]'
const capLabelRow = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]'

function formCardClassName(extra?: string) {
  return cn(
    'rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:p-6 lg:p-7 xl:p-8',
    extra
  )
}

type BuilderType = 'rfi' | 'submittal'

interface LocalAttachment {
  id: string
  name: string
  size: string
  file?: File
  url?: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function NewDocumentContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const typeParam = searchParams.get('type')
  const projectParam = searchParams.get('project')

  const [projects, setProjects] = useState<Project[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeParam === 'change_order') {
      const q = projectParam ? `?project=${encodeURIComponent(projectParam)}` : ''
      router.replace(`/change-orders/new${q}`)
    }
  }, [typeParam, projectParam, router])

  const resolvedType: BuilderType = typeParam === 'submittal' ? 'submittal' : 'rfi'

  const defaultProjectId = (projectParam && projects.some((p) => p.id === projectParam) ? projectParam : null) || projects[0]?.id || ''

  const [formData, setFormData] = useState({
    type: resolvedType,
    projectId: defaultProjectId,
    number: resolvedType === 'rfi' ? 'RFI-001' : 'SUB-001',
    title: '',
    date: new Date().toISOString().slice(0, 10),
    dueDate: '',
    description: '',
    specSection: '',
    manufacturer: '',
    productName: '',
    quantity: '',
    notes: '',
    priority: 'normal' as 'low' | 'normal' | 'urgent',
  })

  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await apiFetch<{
          projects: Array<{ id: string; name: string; address: string | null; created_at: string; updated_at: string }>
        }>('/api/projects')
        setProjects(
          data.projects.map((p) => ({
            id: p.id,
            name: p.name,
            description: '',
            companyId: '',
            status: 'active',
            address: p.address ?? undefined,
            clientName: undefined,
            startDate: p.created_at,
            documentsCount: 0,
            teamMembers: [],
            createdAt: p.created_at,
            updatedAt: p.updated_at,
          }))
        )
        if (!formData.projectId && data.projects[0]?.id) {
          setFormData((prev) => ({ ...prev, projectId: data.projects[0].id }))
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load projects')
      }
    }
    void loadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === formData.projectId),
    [projects, formData.projectId]
  )

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files || [])
    if (!files.length) return
    const accepted: LocalAttachment[] = []
    for (let index = 0; index < files.length; index++) {
      const file = files[index]
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${file.name} exceeds the 25 MB per-file limit.`)
        continue
      }
      accepted.push({
        id: `drop-${Date.now()}-${index}`,
        name: file.name,
        size: formatBytes(file.size),
        file,
      })
    }
    if (accepted.length) setAttachments((prev) => [...prev, ...accepted])
  }, [])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const next: LocalAttachment[] = []
    Array.from(files).forEach((file, index) => {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${file.name} exceeds the 25 MB per-file limit.`)
        return
      }
      next.push({
        id: `upload-${Date.now()}-${index}`,
        name: file.name,
        size: formatBytes(file.size),
        file,
      })
    })
    if (next.length) setAttachments((prev) => [...prev, ...next])
    e.target.value = ''
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const handleSubmit = async (asDraft: boolean) => {
    if (!formData.projectId) return toast.error('Please select a project')
    if (!formData.title.trim()) return toast.error('Please enter a title')
    if (!formData.description.trim()) return toast.error('Please add description')

    setIsSubmitting(true)
    try {
      const uploaded = await uploadPendingAttachments({
        attachments,
        accountIdHint: formData.projectId,
      })
      const docAttachments: DocAttachment[] = uploaded.map((a) => ({
        id: a.id,
        name: a.name,
        url: a.url,
        size: a.size,
        type: a.type,
      }))

      const descriptionBody =
        formData.type === 'rfi'
          ? buildRfiDescriptionBody({
              question: '',
              description: formData.description,
              notes: formData.notes,
            })
          : buildSubmittalDescriptionBody({
              description: formData.description,
              notes: formData.notes,
            })

      const { document } = await apiFetch<{ document: { id: string } }>('/api/documents', {
        method: 'POST',
        json: {
          project_id: formData.projectId,
          doc_type: formData.type as DocumentType,
          doc_number: formData.number,
          title: formData.title,
          description: descriptionBody,
          due_date: formData.dueDate || null,
          // For send-for-review, we create the document then collect reviewer details on the next screen.
          save_as_draft: true,
          metadata: {
            rfiDate: formData.type === 'rfi' ? formData.date : undefined,
            submittalDate: formData.type === 'submittal' ? formData.date : undefined,
            actionNeededBy: formData.dueDate ? formData.dueDate : undefined,
            specSection: formData.type === 'submittal' ? formData.specSection : undefined,
            manufacturer: formData.type === 'submittal' ? formData.manufacturer : undefined,
            productName: formData.type === 'submittal' ? formData.productName : undefined,
            quantity: formData.type === 'submittal' ? formData.quantity : undefined,
            notes: formData.notes || undefined,
            attachments: docAttachments,
            priority: formData.priority,
          },
        },
      })

      if (asDraft) {
        toast.success('Draft saved successfully')
        router.push(`/documents?type=${formData.type}`)
        return
      }

      router.push(`/documents/${document.id}/send-for-review`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save document')
    } finally {
      setIsSubmitting(false)
    }
  }

  const hintClass = 'mt-1.5 text-xs text-[#64748b]'

  const priorityBtn = (key: 'low' | 'normal' | 'urgent', label: string) => {
    const on = formData.priority === key
    return (
      <button
        key={key}
        type="button"
        onClick={() => setFormData((p) => ({ ...p, priority: key }))}
        className={cn(
          'h-12 flex-1 rounded-lg border text-sm font-semibold transition-colors',
          on
            ? 'border-[#0f172a] bg-[#0f172a] text-white shadow-none'
            : 'border-[#e2e8f0] bg-white text-[#475569] hover:border-[#cbd5e1] hover:bg-[#f8fafc]'
        )}
      >
        {label}
      </button>
    )
  }

  const dueDisplay = formData.dueDate
    ? new Date(formData.dueDate + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : ''
  const descriptionLabel = formData.type === 'rfi' ? 'Description / Question' : 'Description'

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
                {formData.type === 'rfi' ? 'Create New RFI' : 'Create New Submittal'}
              </h1>
              <p className="mt-2 text-base leading-relaxed text-[#64748b]">
                Organize your request by section. BuildSwift generates a professional document from your inputs.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
              <Button
                type="button"
                variant="outline"
                className="gap-2 border-2 border-dashed border-[#60a5fa] bg-white text-[#1e3a8a] shadow-sm hover:bg-[#eff6ff] sm:shrink-0"
                onClick={() => void handleSubmit(true)}
                disabled={isSubmitting}
              >
                <Save className="h-4 w-4" />
                Save as Draft
              </Button>
              <Button
                type="button"
                variant="default"
                className="min-w-[10rem] !bg-[#0b1d3a] text-white shadow-[0_4px_14px_rgba(15,23,42,0.25)] hover:!bg-[#132b4f] hover:brightness-100 sm:shrink-0"
                onClick={() => void handleSubmit(false)}
                disabled={isSubmitting}
              >
                Send for Review
              </Button>
              <Button
                variant="outline"
                className="shrink-0 gap-2 rounded-lg border-[#e2e8f0] bg-white px-4 text-[#0f172a] shadow-sm hover:bg-[#f8fafc] sm:shrink-0"
                asChild
              >
                <Link href={`/documents?type=${formData.type}`}>
                  <ArrowLeft className="h-4 w-4" />
                  Back to {formData.type === 'rfi' ? 'RFIs' : 'Submittals'}
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:gap-7 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 space-y-6">
            {/* Document setup */}
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
                  {selectedProject && (selectedProject.projectNumber || selectedProject.address) ? (
                    <p className="mt-1.5 text-xs text-[#94a3b8]">
                      {[selectedProject.projectNumber, selectedProject.address].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className={capLabel}>
                    {formData.type === 'rfi' ? 'RFI number' : 'Submittal number'}{' '}
                    <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={formData.number}
                    onChange={(e) => setFormData((p) => ({ ...p, number: e.target.value }))}
                  />
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

            {/* Title + description */}
            <div className={formCardClassName()}>
              <div className="mb-6">
                <label className={capLabel}>
                  {formData.type === 'rfi' ? 'RFI title' : 'Submittal title'} <span className="text-destructive">*</span>
                </label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                  placeholder={
                    formData.type === 'rfi'
                      ? 'e.g., Structural Clearance Issue at Grid Line C-12'
                      : 'e.g., Hollow Metal Doors — Series 4500 Submittal Package'
                  }
                />
              </div>

              <div className="mb-3 flex items-center justify-between gap-3">
                <span className={capLabelRow}>
                  {descriptionLabel} <span className="text-destructive">*</span>
                </span>
              </div>
              <MissingScopeEditorSection
                variant="document-description"
                documentApiType={docTypeToMissingScopeType(formData.type as DocumentType)}
                value={formData.description}
                onChange={(v) => setFormData((p) => ({ ...p, description: v }))}
                aiNotes={formData.notes}
                rows={8}
                placeholder={
                  formData.type === 'rfi'
                    ? 'Describe the conflict, observation, or clarification needed...'
                    : 'Describe the product, material, and specification compliance...'
                }
              />
            </div>

            {formData.type === 'submittal' && (
              <div className={formCardClassName()}>
                <h2 className="mb-5 text-lg font-semibold text-[#0f172a]">Submittal details</h2>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className={capLabel}>Spec section</label>
                    <Input
                      value={formData.specSection}
                      onChange={(e) => setFormData((p) => ({ ...p, specSection: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={capLabel}>Manufacturer</label>
                    <Input
                      value={formData.manufacturer}
                      onChange={(e) => setFormData((p) => ({ ...p, manufacturer: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={capLabel}>Product name</label>
                    <Input
                      value={formData.productName}
                      onChange={(e) => setFormData((p) => ({ ...p, productName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={capLabel}>Quantity</label>
                    <Input
                      value={formData.quantity}
                      onChange={(e) => setFormData((p) => ({ ...p, quantity: e.target.value }))}
                      placeholder="e.g., 4"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Supporting documents */}
            <div className={formCardClassName()}>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[#0f172a]">Supporting documents</h2>
                <span className="rounded-full bg-[#dbeafe] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#1e40af]">
                  10–25 MB limit per file
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
                  Drag and drop blueprints, photos, or specs or{' '}
                  <span className="font-semibold text-[#0f172a] underline decoration-[#cbd5e1] underline-offset-2">
                    browse files
                  </span>{' '}
                  from your computer
                </p>
              </div>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />
              <div className="space-y-2">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <FileImage className="h-5 w-5 shrink-0 text-[#64748b]" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#0f172a]">{a.name}</p>
                        <p className="text-xs text-[#64748b]">{a.size}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      className="rounded-md p-1.5 text-[#ef4444] transition-colors hover:bg-red-50"
                      aria-label={`Remove ${a.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className={formCardClassName()}>
              <label className={capLabel}>Additional notes (optional)</label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                className="resize-none"
              />
              <p className={hintClass}>{formData.notes.length} characters</p>
            </div>
          </div>

          <aside className="w-full min-w-0 space-y-6 lg:sticky lg:top-6 lg:self-start">
            <div className={formCardClassName()}>
              <h3 className="mb-5 text-lg font-semibold text-[#0f172a]">Categorization</h3>
              <div className="mb-6">
                <label className={capLabel}>Priority level</label>
                <div className="flex gap-2">{priorityBtn('low', 'Low')}{priorityBtn('normal', 'Normal')}{priorityBtn('urgent', 'Urgent')}</div>
              </div>
              <div>
                <label className={capLabel}>Due date</label>
                <Input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData((p) => ({ ...p, dueDate: e.target.value }))}
                  className={cn(dueDisplay && 'text-[#0f172a]')}
                />
                {dueDisplay ? <p className="mt-1.5 text-xs font-medium text-[#475569]">{dueDisplay}</p> : null}
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">Reference context</p>
                <p className="mt-1 text-xl font-bold tracking-tight">Grid Sector Alpha-9</p>
                <p className="mt-1 text-xs text-white/70">Link on-site photos and drawings to this request for reviewers.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default function NewDocumentPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <NewDocumentContent />
    </Suspense>
  )
}
