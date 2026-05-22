'use client'

import type { RefObject } from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { ClashGapIssue, RfiDraftState } from '@/lib/clash-gap-types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { FileText, Plane, Save, Sparkles, X } from 'lucide-react'

const SUBJECT_MAX = 255
const DESC_MAX = 2000

const DISCIPLINES = [
  'Structural',
  'Architectural',
  'MEP',
  'Civil',
  'Landscape',
  'General',
] as const

const ASSIGNEE_ROLES = [
  'Structural Engineer',
  'Architect',
  'MEP Engineer',
  'Civil Engineer',
  'General Contractor',
  'Owner',
] as const

function buildChipList(uploadFilenames: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of uploadFilenames) {
    const trimmed = name.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out.slice(0, 16)
}

const PRI_DOT: Record<RfiDraftState['priority'], string> = {
  low: 'bg-emerald-500',
  normal: 'bg-amber-500',
  urgent: 'bg-red-500',
}

const PRI_LABEL: Record<RfiDraftState['priority'], string> = {
  low: 'Low',
  normal: 'Medium',
  urgent: 'High',
}

export function RfiDraftPanel(props: {
  issue: ClashGapIssue | null
  uploadFilenames: string[]
  draft: RfiDraftState | null
  setDraft: (updater: RfiDraftState | ((prev: RfiDraftState) => RfiDraftState)) => void
  onClear: () => void
  onSaveDraftLocal: () => void
  onCreateRfi: () => void
  panelRef?: RefObject<HTMLDivElement | null>
}) {
  const { issue, draft, setDraft, onClear, onSaveDraftLocal, onCreateRfi, panelRef, uploadFilenames } =
    props

  const [chips, setChips] = useState<string[]>([])

  useEffect(() => {
    if (!issue) {
      setChips([])
      return
    }
    setChips(buildChipList(uploadFilenames))
  }, [issue?.id, uploadFilenames])

  const syncRelatedFromChips = useCallback(
    (next: string[]) => {
      setChips(next)
      setDraft((d) => ({ ...d, relatedDocuments: next.join('\n') }))
    },
    [setDraft]
  )

  const removeChip = (label: string) => {
    syncRelatedFromChips(chips.filter((c) => c !== label))
  }

  const shell = (inner: React.ReactNode) => (
    <div ref={panelRef} className="min-h-0 min-w-0 lg:max-h-[calc(100vh-12rem)]">
      {inner}
    </div>
  )

  if (!draft || !issue) {
    return shell(
      <Card className="flex min-h-[480px] flex-col rounded-2xl border-[#e2e8f0] bg-white shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
        <CardContent className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">RFI Draft (Auto-filled)</p>
          <p>Select an issue to auto-fill the RFI panel.</p>
        </CardContent>
      </Card>,
    )
  }

  const disciplineIsPreset = DISCIPLINES.includes(
    draft.discipline as (typeof DISCIPLINES)[number],
  )

  const assigneeIsPreset = ASSIGNEE_ROLES.includes(
    draft.assignee as (typeof ASSIGNEE_ROLES)[number],
  )
  const assigneeSelectValue = assigneeIsPreset
    ? draft.assignee
    : draft.assignee || ASSIGNEE_ROLES[0]

  return shell(
    <Card className="flex max-h-[inherit] min-h-0 flex-col rounded-2xl border-[#e2e8f0] bg-white shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 border-b border-[#f1f5f9] px-6 pb-4 pt-6">
        <div className="flex min-w-0 items-start gap-2">
          <Sparkles
            className="mt-0.5 h-5 w-5 shrink-0 text-violet-500"
            strokeWidth={1.8}
            aria-hidden
          />
          <div>
            <h2 className="text-base font-semibold text-[#0f172a]">RFI Draft (Auto-filled)</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Edit fields before creating in BuildSwift.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-sm font-medium text-violet-600 hover:underline"
        >
          Clear
        </button>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
        <div>
          <Label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748b]">
            RFI title <span className="text-red-600">*</span>
          </Label>
          <Input
            className="mt-1.5 rounded-xl border-[#e2e8f0]"
            value={draft.title}
            maxLength={120}
            onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748b]">
              Discipline
            </Label>
            <Select
              value={
                disciplineIsPreset
                  ? draft.discipline
                  : draft.discipline || 'General'
              }
              onValueChange={(v) => setDraft((p) => ({ ...p, discipline: v }))}
            >
              <SelectTrigger className="mt-1.5 w-full rounded-xl border-[#e2e8f0]">
                <SelectValue placeholder="Discipline" />
              </SelectTrigger>
              <SelectContent>
                {!disciplineIsPreset && draft.discipline ? (
                  <SelectItem value={draft.discipline}>{draft.discipline}</SelectItem>
                ) : null}
                {DISCIPLINES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748b]">
              Priority
            </Label>
            <Select
              value={draft.priority}
              onValueChange={(v) =>
                setDraft((p) => ({ ...p, priority: v as RfiDraftState['priority'] }))
              }
            >
              <SelectTrigger className="mt-1.5 w-full rounded-xl border-[#e2e8f0]">
                <SelectValue placeholder="Priority">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn('h-2 w-2 shrink-0 rounded-full', PRI_DOT[draft.priority])}
                      aria-hidden
                    />
                    <span className="truncate">{PRI_LABEL[draft.priority]}</span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(['low', 'normal', 'urgent'] as const).map((pv) => (
                  <SelectItem key={pv} value={pv}>
                    <span className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full shrink-0', PRI_DOT[pv])} />
                      {PRI_LABEL[pv]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748b]">
              Subject / Issue
            </Label>
            <span className="text-muted-foreground text-xs">
              {draft.subject.length}/{SUBJECT_MAX}
            </span>
          </div>
          <Textarea
            className="mt-1.5 min-h-[72px] rounded-xl border-[#e2e8f0]"
            value={draft.subject}
            maxLength={SUBJECT_MAX}
            onChange={(e) => setDraft((p) => ({ ...p, subject: e.target.value }))}
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748b]">
              RFI description <span className="text-red-600">*</span>
            </Label>
            <span className="text-muted-foreground text-xs">
              {draft.description.length}/{DESC_MAX}
            </span>
          </div>
          <Textarea
            className="mt-1.5 min-h-[220px] rounded-xl border-[#e2e8f0]"
            value={draft.description}
            maxLength={DESC_MAX}
            onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
          />
        </div>

        <div>
          <Label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748b]">
            Related documents {chips.length > 0 ? `(${chips.length})` : ''}
          </Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {chips.length === 0 ? (
              <p className="text-muted-foreground text-xs">No references yet.</p>
            ) : (
              chips.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-[#f8fafc] py-1 pl-2 pr-1 text-xs font-medium text-[#334155]"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-red-600" strokeWidth={1.8} aria-hidden />
                  <span className="max-w-[min(100%,20rem)] truncate sm:max-w-[min(100%,24rem)]">{c}</span>
                  <button
                    type="button"
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-[#e2e8f0] hover:text-foreground"
                    aria-label={`Remove ${c}`}
                    onClick={() => removeChip(c)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748b]">
              Assign to
            </Label>
            <Select
              value={assigneeSelectValue}
              onValueChange={(v) => setDraft((p) => ({ ...p, assignee: v }))}
            >
              <SelectTrigger className="mt-1.5 w-full rounded-xl border-[#e2e8f0]">
                <SelectValue placeholder="Assign to" />
              </SelectTrigger>
              <SelectContent>
                {!assigneeIsPreset && draft.assignee ? (
                  <SelectItem value={draft.assignee}>{draft.assignee}</SelectItem>
                ) : null}
                {ASSIGNEE_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748b]">
              Due date
            </Label>
            <Input
              type="date"
              className="mt-1.5 rounded-xl border-[#e2e8f0]"
              value={draft.dueDate}
              onChange={(e) => setDraft((p) => ({ ...p, dueDate: e.target.value }))}
            />
          </div>
        </div>

        <div className="mt-auto flex flex-wrap gap-2 border-t border-[#f1f5f9] pt-4">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-[#e2e8f0]"
            onClick={onSaveDraftLocal}
          >
            <Save className="mr-2 h-4 w-4" strokeWidth={1.8} />
            Save Draft
          </Button>
          <Button
            type="button"
            className="rounded-xl bg-violet-600 text-white hover:bg-violet-700"
            onClick={onCreateRfi}
          >
            <Plane className="mr-2 h-4 w-4" strokeWidth={1.8} />
            Create RFI
          </Button>
        </div>
      </CardContent>
    </Card>,
  )
}
