'use client'

import { useState, type ReactNode, type RefObject } from 'react'
import {
  CLASH_GAP_UPLOAD_TYPES,
  type DocumentLabelType,
  type DocumentUploadRow,
} from '@/lib/clash-gap-types'
import {
  canRunClashGapDetection,
  hasPlansDocument,
  hasSpecsDocument,
} from '@/lib/clash-gap-document-inference'
import type { Project } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { CloudUpload, FileText, ImageIcon, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { CLASH_GAP_MAX_BYTES, formatUploadSizeLimit } from '@/lib/upload-limits'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const ACCEPT = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
])

const ACCEPT_EXT = /\.(pdf|docx|doc|txt|jpe?g|png|webp|tiff?)$/i

const PAGE_BG = '#f9fafb'

function humanLabelType(t: DocumentLabelType): string {
  if (t === 'plans_specs') return 'Plans & Specs'
  return t.replace(/_/g, ' ')
}

function formatAllowed(): string {
  return 'PDF, DOCX, plain text exports, common image scans'
}

function FormatTypeChip(props: {
  label: string
  icon: ReactNode
  iconClassName: string
}) {
  return (
    <span className="inline-flex items-center gap-3 text-sm font-medium text-[#475569]">
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          props.iconClassName,
        )}
      >
        {props.icon}
      </span>
      {props.label}
    </span>
  )
}

export function UploadSetupStep(props: {
  projects: Project[]
  projectId: string
  onProjectIdChange: (id: string) => void
  rows: DocumentUploadRow[]
  onRowsChange: (rows: DocumentUploadRow[]) => void
  fileInputRef: RefObject<HTMLInputElement | null>
  analysisId?: string | null
  onUploadRow?: (row: DocumentUploadRow) => Promise<void>
  onRemoveRow?: (row: DocumentUploadRow) => Promise<void>
  onRowTypeChange?: (row: DocumentUploadRow, type: DocumentLabelType) => void | Promise<void>
  onCreateProject?: (input: {
    name: string
    address?: string
    jobNumber?: string
  }) => Promise<void>
}) {
  const {
    projects,
    projectId,
    onProjectIdChange,
    rows,
    onRowsChange,
    fileInputRef,
    analysisId,
    onUploadRow,
    onRemoveRow,
    onRowTypeChange,
    onCreateProject,
  } = props

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newJobNumber, setNewJobNumber] = useState('')
  const [creating, setCreating] = useState(false)

  const ingestFiles = (list: FileList | File[]) => {
    const files = Array.from(list)
    if (!files.length) return
    const nextRows: DocumentUploadRow[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const okMime = ACCEPT.has(file.type) || (!file.type && ACCEPT_EXT.test(file.name))
      if (!okMime) {
        toast.error(`${file.name} is not an accepted type (${formatAllowed()}).`)                                                                                                                                                                                                                                                                                                                                                                                                           
        continue
      }
      if (file.size > CLASH_GAP_MAX_BYTES) {
        toast.error(`${file.name} exceeds the ${formatUploadSizeLimit(CLASH_GAP_MAX_BYTES)} limit.`)
        continue
      }
      nextRows.push({
        id: `doc-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        filename: file.name,
        type: null,
        pages: '—',
        status: onUploadRow ? 'pending' : 'ready',
        file,
      })
    }
    if (nextRows.length) {
      onRowsChange([...rows, ...nextRows])
      if (onUploadRow) {
        void (async () => {
          for (const row of nextRows) {
            await onUploadRow(row)
          }
        })()
      }
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files?.length) ingestFiles(e.dataTransfer.files)
  }

  const onRowType = (id: string, type: DocumentLabelType) => {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    const updated = { ...row, type }
    onRowsChange(rows.map((r) => (r.id === id ? updated : r)))
    void onRowTypeChange?.(updated, type)
  }

  const removeRow = (id: string) => {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    if (onRemoveRow) {
      void onRemoveRow(row)
      return
    }
    onRowsChange(rows.filter((r) => r.id !== id))
  }

  return (
    <div className="flex flex-col gap-6" style={{ backgroundColor: PAGE_BG }}>
      <div className="grid gap-6 lg:grid-cols-[1fr,min(340px,100%)]">
          <Card className="rounded-2xl border-[#e2e8f0] shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-3 text-lg">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100">
                  <FileText
                    className="h-[22px] w-[22px] text-violet-600"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                </span>
                Documents &amp; setup
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 px-6 pb-6">
              <div className="flex flex-col gap-2">
                <Label className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-600">
                  Project
                </Label>
                <div className="flex max-w-md flex-wrap items-center gap-2">
                  <Select value={projectId} onValueChange={onProjectIdChange}>
                    <SelectTrigger className="h-11 min-w-[220px] flex-1 rounded-xl border-[#e2e8f0] sm:min-w-[260px]">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.jobNumber ? ` (${p.jobNumber})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {onCreateProject ? (
                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                      <DialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 w-11 shrink-0 rounded-xl border-violet-200 text-violet-600 hover:bg-violet-50"
                          aria-label="Create project"
                        >
                          <Plus className="h-4 w-4" aria-hidden />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create project</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3 py-2">
                          <div>
                            <Label>Project name</Label>
                            <Input
                              className="mt-1"
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Address (optional)</Label>
                            <Input
                              className="mt-1"
                              value={newAddress}
                              onChange={(e) => setNewAddress(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Job number (optional)</Label>
                            <Input
                              className="mt-1"
                              value={newJobNumber}
                              onChange={(e) => setNewJobNumber(e.target.value)}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            disabled={creating || !newName.trim()}
                            onClick={() => {
                              void (async () => {
                                setCreating(true)
                                try {
                                  await onCreateProject({
                                    name: newName.trim(),
                                    address: newAddress.trim() || undefined,
                                    jobNumber: newJobNumber.trim() || undefined,
                                  })
                                  setCreateOpen(false)
                                  setNewName('')
                                  setNewAddress('')
                                  setNewJobNumber('')
                                } catch (e) {
                                  toast.error(
                                    e instanceof Error ? e.message : 'Could not create project',
                                  )
                                } finally {
                                  setCreating(false)
                                }
                              })()
                            }}
                          >
                            {creating ? 'Creating…' : 'Create'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  ) : null}
                </div>
              </div>

              <div
                role="presentation"
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className={cn(
                  'relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#bfdbfe] bg-[#f0f7ff] px-6 py-14 text-center transition-colors hover:border-sky-400 hover:bg-[#eaf4ff]',
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="sr-only"
                  accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp,.tif,.tiff"
                  onChange={(e) => {
                    const f = e.target.files
                    if (f?.length) ingestFiles(f)
                    e.target.value = ''
                  }}
                />
                <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-sky-100">
                  <CloudUpload
                    className="h-9 w-9 text-sky-500"
                    strokeWidth={2}
                    aria-hidden
                  />
                </div>
                <p className="mt-5 text-lg font-bold text-[#0f172a]">
                  Drag and drop documents here
                </p>
                <p className="mt-2 max-w-md text-sm text-[#64748b]">
                  {formatAllowed()}.{' '}
                  <span className="font-medium">Up to {formatUploadSizeLimit(CLASH_GAP_MAX_BYTES)} per file.</span>
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
                  <FormatTypeChip
                    label="PDF"
                    iconClassName="bg-red-500"
                    icon={
                      <span className="text-[11px] font-bold leading-none text-white">PDF</span>
                    }
                  />
                  <FormatTypeChip
                    label="DOCX"
                    iconClassName="bg-blue-600"
                    icon={
                      <span className="text-[10px] font-bold leading-none text-white">DOCX</span>
                    }
                  />
                  <FormatTypeChip
                    label="Image scans"
                    iconClassName="bg-emerald-100"
                    icon={
                      <ImageIcon
                        className="h-5 w-5 text-emerald-600"
                        strokeWidth={2.25}
                        aria-hidden
                      />
                    }
                  />
                </div>
              </div>

              <div
                className={cn(
                  'rounded-xl border px-4 py-3 text-xs',
                  canRunClashGapDetection(rows)
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-amber-200 bg-amber-50 text-amber-900',
                )}
              >
                <span className="font-semibold">Required for detection:</span>{' '}
                <span className={hasPlansDocument(rows) ? 'text-emerald-800' : ''}>
                  Plans {hasPlansDocument(rows) ? '✓' : '— missing'}
                </span>
                {' · '}
                <span className={hasSpecsDocument(rows) ? 'text-emerald-800' : ''}>
                  Specifications {hasSpecsDocument(rows) ? '✓' : '— missing'}
                </span>
                {!canRunClashGapDetection(rows) ? (
                  <span className="mt-1 block">
                    Document type starts unset — for each uploaded file, pick its type from the
                    dropdown in the table. Set at least one row to{' '}
                    <span className="font-semibold">Plans</span> and one to{' '}
                    <span className="font-semibold">Specifications</span> to continue.
                  </span>
                ) : (
                  <span className="mt-1 block">Drawings are reviewed against the specifications.</span>
                )}
              </div>

              {rows.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-[#e2e8f0]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#f1f5f9] text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748b]">
                      <tr>
                        <th className="px-4 py-3">File</th>
                        <th className="px-4 py-3">Document type</th>
                        <th className="px-4 py-3">Pages</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="w-24 px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-t border-[#e2e8f0] bg-white">
                          <td className="max-w-[200px] truncate px-4 py-3 font-medium text-[#0f172a]">
                            {r.filename}
                          </td>
                          <td className="px-4 py-3">
                            <Select
                              value={r.type ?? undefined}
                              onValueChange={(v) => onRowType(r.id, v as DocumentLabelType)}
                              disabled={r.status !== 'ready'}
                            >
                              <SelectTrigger
                                className={cn(
                                  'h-9 w-[170px] rounded-lg',
                                  !r.type && 'text-muted-foreground',
                                )}
                              >
                                <SelectValue
                                  placeholder={r.status === 'ready' ? 'Select type' : 'Uploading…'}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {CLASH_GAP_UPLOAD_TYPES.map((t) => (
                                  <SelectItem key={t} value={t}>
                                    {humanLabelType(t)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-3 text-[#475569]">{r.pages}</td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-xs font-medium',
                                r.status === 'ready' && 'bg-emerald-50 text-emerald-800',
                                r.status === 'pending' && 'bg-amber-50 text-amber-900',
                                r.status === 'error' && 'bg-red-50 text-red-800',
                              )}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => removeRow(r.id)}
                            >
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="h-fit rounded-2xl border-[#e2e8f0] shadow-[0_2px_12px_rgba(15,23,42,0.06)] lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle className="text-base">What this checks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[#475569]">
              <p>
                Drawings are reviewed exclusively against the uploaded specifications. Every issue
                traces back to a specific specification requirement — no 3D geometry or
                coordinates required.
              </p>
              <ul className="list-inside list-disc space-y-2">
                <li>
                  <span className="font-medium text-[#0f172a]">Gaps</span> — spec requirements
                  absent or under-detailed in drawings
                </li>
                <li>
                  <span className="font-medium text-[#0f172a]">Clashes</span> — cross-discipline
                  drawing conflicts that deviate from the spec
                </li>
                <li>
                  <span className="font-medium text-[#0f172a]">Mismatches</span> — drawings that
                  actively contradict a spec requirement
                </li>
              </ul>
              <p className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-xs">
                Upload <span className="font-medium">Plans</span> and{' '}
                <span className="font-medium">Specifications</span> to run the analysis.
              </p>
            </CardContent>
          </Card>
        </div>
    </div>
  )
}

