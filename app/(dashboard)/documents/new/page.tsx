'use client'

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Sparkles,
  Upload,
  X,
  Eye,
  Save,
  CalendarDays,
  Lightbulb,
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
import type { Attachment as DocAttachment, DocumentType } from '@/lib/types'
import { ReviewerManagementSection } from '@/app/components/reviewer-management-section'
import { MissingScopeCallout } from '@/app/components/missing-scope-callout'

const PREVIEW_BLUE = '#2563eb'
const NAVY = '#0f172a'

type BuilderType = 'rfi' | 'submittal'

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

function NewDocumentContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const typeParam = searchParams.get('type')
  const projectParam = searchParams.get('project')

  const { projects, addDocument, user } = useApp()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeParam === 'change_order') {
      const q = projectParam ? `?project=${encodeURIComponent(projectParam)}` : ''
      router.replace(`/change-orders/new${q}`)
    }
  }, [typeParam, projectParam, router])

  const resolvedType: BuilderType = typeParam === 'submittal' ? 'submittal' : 'rfi'

  const defaultProjectId =
    (projectParam && projects.some((p) => p.id === projectParam) ? projectParam : null) ||
    projects[0]?.id ||
    ''

  const [formData, setFormData] = useState({
    type: resolvedType,
    projectId: defaultProjectId,
    number: resolvedType === 'rfi' ? 'RFI-001' : 'SUB-001',
    title: '',
    date: new Date().toISOString().slice(0, 10),
    dueDate: '',
    question: '',
    description: '',
    specSection: '',
    manufacturer: '',
    productName: '',
    notes: '',
  })

  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === formData.projectId),
    [projects, formData.projectId]
  )

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

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
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

  const docAttachments: DocAttachment[] = attachments.map((a) => ({
    id: a.id,
    name: a.name,
    url: '#',
    size: 0,
    type: a.name.split('.').pop() || 'file',
  }))

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

  const handleSubmit = async (asDraft: boolean) => {
    if (!formData.projectId) return toast.error('Please select a project')
    if (!formData.title.trim()) return toast.error('Please enter a title')
    if (!formData.description.trim()) return toast.error('Please add description')
    if (formData.type === 'rfi' && !formData.question.trim()) {
      return toast.error('Please add the RFI question')
    }

    setIsSubmitting(true)
    try {
      const content =
        formData.type === 'rfi'
          ? buildRfiHtml({
              number: formData.number,
              title: formData.title,
              date: formData.date,
              projectName: selectedProject?.name || '',
              question: formData.question,
              description: formData.description,
              notes: formData.notes,
            })
          : buildSubmittalHtml({
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

      addDocument({
        projectId: formData.projectId,
        type: formData.type as DocumentType,
        title: formData.title,
        content,
        status: 'draft',
        createdBy: user?.id || 'user-1',
        dueDate: formData.dueDate || undefined,
        metadata: {
          question: formData.type === 'rfi' ? formData.question : undefined,
          specSection: formData.type === 'submittal' ? formData.specSection : undefined,
          manufacturer: formData.type === 'submittal' ? formData.manufacturer : undefined,
          productName: formData.type === 'submittal' ? formData.productName : undefined,
          notes: formData.notes || undefined,
          attachments: docAttachments,
        },
      })

      toast.success(asDraft ? 'Draft saved successfully' : `${formData.type === 'rfi' ? 'RFI' : 'Submittal'} generated successfully`)
      router.push(`/documents?type=${formData.type}`)
    } catch {
      toast.error('Failed to save document')
    } finally {
      setIsSubmitting(false)
    }
  }

  const labelClass = 'mb-1.5 block text-sm font-medium'
  const hintClass = 'mt-1.5 text-xs text-muted-foreground'

  return (
    <div className="min-h-full bg-[#f8f9fb] px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: NAVY }}>
              {formData.type === 'rfi' ? 'Create New RFI' : 'Create New Submittal'}
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Enter the details below. BuildSwift will generate a professional document based on your input.
            </p>
          </div>
          <Button
            variant="outline"
            className="shrink-0 gap-2 rounded-lg border-slate-200 bg-white px-4 shadow-sm hover:bg-slate-50"
            style={{ color: NAVY }}
            asChild
          >
            <Link href={`/documents?type=${formData.type}`}>
              <ArrowLeft className="h-4 w-4" />
              Back to {formData.type === 'rfi' ? 'RFIs' : 'Submittals'}
            </Link>
          </Button>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 lg:max-w-[calc(100%-22rem)]">
            <Card className="border border-slate-200/80 bg-white shadow-sm">
              <CardContent className="space-y-10 p-6 sm:p-8">
                <section>
                  {sectionTitle(1, formData.type === 'rfi' ? 'Project & RFI Info' : 'Project & Submittal Info')}
                  <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <div className="min-w-0">
                      <label className={labelClass} style={{ color: NAVY }}>
                        Project <span className="text-destructive">*</span>
                      </label>
                      <Select
                        value={formData.projectId}
                        onValueChange={(value) => setFormData((p) => ({ ...p, projectId: value }))}
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
                        {formData.type === 'rfi' ? 'RFI Number' : 'Submittal Number'} <span className="text-destructive">*</span>
                      </label>
                      <Input
                        value={formData.number}
                        onChange={(e) => setFormData((p) => ({ ...p, number: e.target.value }))}
                        className="rounded-lg border-slate-200 shadow-xs"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className={labelClass} style={{ color: NAVY }}>
                        Title <span className="text-destructive">*</span>
                      </label>
                      <Input
                        value={formData.title}
                        onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
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
                          onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
                          className="rounded-lg border-slate-200 pr-10 shadow-xs"
                        />
                        <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  {sectionTitle(2, formData.type === 'rfi' ? 'Question & Description' : 'Description of Submittal', true)}
                  <p className="mb-3 text-sm text-muted-foreground">
                    {formData.type === 'rfi'
                      ? 'Provide the clarification request and supporting context.'
                      : 'Provide a clear description of the submitted product/material.'}
                  </p>
                  {formData.type === 'rfi' && (
                    <>
                      <label className={labelClass} style={{ color: NAVY }}>
                        Question <span className="text-destructive">*</span>
                      </label>
                      <Textarea
                        value={formData.question}
                        onChange={(e) => setFormData((p) => ({ ...p, question: e.target.value }))}
                        rows={3}
                        className="mb-4 resize-none rounded-lg border-slate-200 text-[15px] leading-relaxed shadow-xs"
                      />
                    </>
                  )}

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
                    onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                    rows={5}
                    className="resize-none rounded-lg border-slate-200 text-[15px] leading-relaxed shadow-xs"
                  />
                  <p className={hintClass}>{formData.description.length} characters</p>
                </section>

                <MissingScopeCallout />

                {formData.type === 'submittal' && (
                  <section>
                    {sectionTitle(3, 'Submittal Details')}
                    <div className="grid gap-5 sm:grid-cols-3">
                      <div>
                        <label className={labelClass} style={{ color: NAVY }}>Spec Section</label>
                        <Input value={formData.specSection} onChange={(e) => setFormData((p) => ({ ...p, specSection: e.target.value }))} className="rounded-lg border-slate-200 shadow-xs" />
                      </div>
                      <div>
                        <label className={labelClass} style={{ color: NAVY }}>Manufacturer</label>
                        <Input value={formData.manufacturer} onChange={(e) => setFormData((p) => ({ ...p, manufacturer: e.target.value }))} className="rounded-lg border-slate-200 shadow-xs" />
                      </div>
                      <div>
                        <label className={labelClass} style={{ color: NAVY }}>Product Name</label>
                        <Input value={formData.productName} onChange={(e) => setFormData((p) => ({ ...p, productName: e.target.value }))} className="rounded-lg border-slate-200 shadow-xs" />
                      </div>
                    </div>
                  </section>
                )}

                <section>
                  {sectionTitle(formData.type === 'submittal' ? 4 : 3, 'Attachments (Optional)')}
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
                    <p className="mt-1 text-xs text-muted-foreground">Drawings, photos, specifications, etc. (PDF, JPG, PNG, DOC)</p>
                  </div>
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />
                  <div className="space-y-2">
                    {attachments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium" style={{ color: NAVY }}>{a.name}</p>
                          <p className="text-xs text-muted-foreground">{a.size}</p>
                        </div>
                        <button type="button" onClick={() => removeAttachment(a.id)} className="rounded p-1 text-muted-foreground transition-colors hover:bg-slate-200 hover:text-slate-700">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  {sectionTitle(formData.type === 'submittal' ? 5 : 4, 'Notes (Optional)')}
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                    rows={3}
                    className="resize-none rounded-lg border-slate-200 text-[15px] leading-relaxed shadow-xs"
                  />
                  <p className={hintClass}>{formData.notes.length} characters</p>
                </section>

                <div className="border-t border-slate-200 pt-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button className="gap-2 rounded-lg px-4 shadow-sm" onClick={() => handleSubmit(false)} disabled={isSubmitting}>
                      <Sparkles className="h-4 w-4" />
                      {formData.type === 'rfi' ? 'Generate RFI' : 'Generate Submittal'}
                    </Button>
                    <Button variant="outline" className="gap-2 rounded-lg border-slate-200 bg-white px-4 shadow-sm" onClick={() => handleSubmit(true)} disabled={isSubmitting}>
                      <Save className="h-4 w-4" />
                      Save Draft
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="w-full shrink-0 lg:sticky lg:top-8 lg:w-88">
            <div className="space-y-4">
              <Card className="border border-slate-200/80 bg-white shadow-sm">
                <CardContent className="space-y-3 p-5">
                  <h3 className="text-base font-semibold" style={{ color: NAVY }}>Summary</h3>
                  <div>
                    <p className="text-xs text-muted-foreground">Project</p>
                    <p className="font-medium" style={{ color: NAVY }}>{selectedProject?.name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{selectedProject?.projectNumber || '—'}</p>
                  </div>
                  <div className="h-px bg-slate-200" />
                  <div>
                    <p className="text-xs text-muted-foreground">{formData.type === 'rfi' ? 'RFI #' : 'Submittal #'}</p>
                    <p className="font-semibold" style={{ color: NAVY }}>{formData.number || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Title</p>
                    <p className="font-semibold" style={{ color: NAVY }}>{formData.title || 'Untitled'}</p>
                  </div>
                  <div>
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
                  <Button className="w-full" variant="default" style={{ backgroundColor: PREVIEW_BLUE }}>
                    <Eye className="mr-2 h-4 w-4" />
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
                    Be specific and detailed for better results. You can always edit before generating.
                  </p>
                </CardContent>
              </Card>

              <ReviewerManagementSection />
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
