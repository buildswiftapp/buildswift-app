'use client'

import type { ReactNode, RefObject } from 'react'
import type { DetectionSettings } from '@/lib/clash-gap-types'
import {
  DOCUMENT_LABEL_TYPES,
  type DocumentLabelType,
  type DocumentUploadRow,
} from '@/lib/clash-gap-types'
import { stubPagesForFilename } from '@/lib/clash-gap-mock-detection'
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
import { Upload } from 'lucide-react'
import { toast } from 'sonner'

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

const TRADE_OPTIONS = ['Structural', 'Architectural', 'MEP', 'Civil', 'Landscape'] as const

function humanLabelType(t: DocumentLabelType): string {
  return t.replace(/_/g, ' ')
}

function formatAllowed(): string {
  return 'PDF, DOCX, plain text exports, common image scans'
}

export function UploadSetupStep(props: {
  projects: Project[]
  projectId: string
  onProjectIdChange: (id: string) => void
  rows: DocumentUploadRow[]
  onRowsChange: (rows: DocumentUploadRow[]) => void
  settings: DetectionSettings
  onSettingsChange: (s: DetectionSettings) => void
  selectedTrades: string[]
  onSelectedTradesChange: (next: string[]) => void
  fileInputRef: RefObject<HTMLInputElement | null>
}) {
  const {
    projects,
    projectId,
    onProjectIdChange,
    rows,
    onRowsChange,
    settings,
    onSettingsChange,
    selectedTrades,
    onSelectedTradesChange,
    fileInputRef,
  } = props

  const scopeNeedsTrades = settings.scope === 'selected_trades'

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
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} exceeds the 25 MB limit.`)
        continue
      }
      nextRows.push({
        id: `doc-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        filename: file.name,
        type: 'plans',
        pages: stubPagesForFilename(file.name),
        status: 'ready',
        file,
      })
    }
    if (nextRows.length) onRowsChange([...rows, ...nextRows])
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files?.length) ingestFiles(e.dataTransfer.files)
  }

  const onRowType = (id: string, type: DocumentLabelType) => {
    onRowsChange(rows.map((r) => (r.id === id ? { ...r, type } : r)))
  }

  const removeRow = (id: string) => {
    onRowsChange(rows.filter((r) => r.id !== id))
  }

  return (
    <div className="flex flex-col gap-6" style={{ backgroundColor: PAGE_BG }}>
      <div className="grid gap-6 lg:grid-cols-[1fr,min(340px,100%)]">
          <Card className="rounded-2xl border-[#e2e8f0] shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Documents & setup</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 px-6 pb-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">
                    Project
                  </Label>
                  <Select value={projectId} onValueChange={onProjectIdChange}>
                    <SelectTrigger className="mt-1.5 h-11 rounded-xl border-[#e2e8f0]">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!scopeNeedsTrades ? null : (
                  <div>
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">
                      Trades in scope
                    </Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {TRADE_OPTIONS.map((trade) => {
                        const on = selectedTrades.includes(trade)
                        return (
                          <button
                            key={trade}
                            type="button"
                            onClick={() =>
                              onSelectedTradesChange(
                                on ? selectedTrades.filter((t) => t !== trade) : [...selectedTrades, trade]
                              )
                            }
                            className={cn(
                              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                              on
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-[#e2e8f0] bg-white text-[#475569] hover:bg-[#f8fafc]',
                            )}
                          >
                            {trade}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div
                role="presentation"
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className={cn(
                  'relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#cbd5e1] bg-[#f8fafc] px-6 py-14 text-center transition-colors hover:border-primary/40 hover:bg-white',
                  'shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]',
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
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Upload className="h-6 w-6 text-primary" strokeWidth={1.6} aria-hidden />
                </div>
                <p className="mt-4 text-sm font-semibold text-[#0f172a]">
                  Drag and drop documents here
                </p>
                <p className="mt-2 max-w-md text-xs text-[#64748b]">{formatAllowed()}.</p>
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
                              value={r.type}
                              onValueChange={(v) => onRowType(r.id, v as DocumentLabelType)}
                            >
                              <SelectTrigger className="h-9 w-[160px] rounded-lg">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DOCUMENT_LABEL_TYPES.map((t) => (
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

              <div className="grid gap-6 rounded-xl border border-[#e2e8f0] bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
                <SettingBlock label="Detection mode">
                  <Select
                    value={settings.mode}
                    onValueChange={(v) =>
                      onSettingsChange({ ...settings, mode: v as DetectionSettings['mode'] })
                    }
                  >
                    <SelectTrigger className="mt-2 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gaps">Gaps</SelectItem>
                      <SelectItem value="conflicts">Conflicts</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingBlock>
                <SettingBlock label="Scope">
                  <Select
                    value={settings.scope}
                    onValueChange={(v) =>
                      onSettingsChange({ ...settings, scope: v as DetectionSettings['scope'] })
                    }
                  >
                    <SelectTrigger className="mt-2 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entire_project">Entire project</SelectItem>
                      <SelectItem value="selected_trades">Selected trades</SelectItem>
                      <SelectItem value="selected_documents">Selected documents only</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingBlock>
                <SettingBlock label="Sensitivity">
                  <Select
                    value={settings.sensitivity}
                    onValueChange={(v) =>
                      onSettingsChange({
                        ...settings,
                        sensitivity: v as DetectionSettings['sensitivity'],
                      })
                    }
                  >
                    <SelectTrigger className="mt-2 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingBlock>
                <SettingBlock label="RFI output format">
                  <Select
                    value={settings.rfiFormat}
                    onValueChange={(v) =>
                      onSettingsChange({
                        ...settings,
                        rfiFormat: v as DetectionSettings['rfiFormat'],
                      })
                    }
                  >
                    <SelectTrigger className="mt-2 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short</SelectItem>
                      <SelectItem value="detailed">Detailed</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingBlock>
              </div>
            </CardContent>
          </Card>

          <Card className="h-fit rounded-2xl border-[#e2e8f0] shadow-[0_2px_12px_rgba(15,23,42,0.06)] lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle className="text-base">What this checks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[#475569]">
              <p>
                A document-forward pass that highlights narrative conflicts, omissions, and
                cross-reference alignment — no 3D model, coordinates, or geometry clash spheres.
              </p>
              <ul className="list-inside list-disc space-y-2">
                <li>Spec versus drawing wording for key assemblies</li>
                <li>Missing details where specifications require depiction</li>
                <li>Addenda and revision alignment on reviewed uploads</li>
                <li>Trade-scoped notes when you narrow scope</li>
              </ul>
            </CardContent>
          </Card>
        </div>
    </div>
  )
}

function SettingBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">
        {label}
      </Label>
      {children}
    </div>
  )
}
