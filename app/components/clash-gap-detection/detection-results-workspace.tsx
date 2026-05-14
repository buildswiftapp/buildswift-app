'use client'

import type { RefObject } from 'react'
import { useMemo, useState } from 'react'
import type { ClashGapIssue, IssueType } from '@/lib/clash-gap-types'
import { HighlightedExcerpt } from '@/app/components/clash-gap-detection/highlighted-excerpt'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  Filter,
  SquarePlus,
  Search,
  X,
} from 'lucide-react'
import type { RfiDraftState } from '@/lib/clash-gap-types'
import { RfiDraftPanel } from './rfi-draft-panel'

const PAGE_SIZE = 10

/** Matches reference mock title casing (e.g. “Slab Thickness Conflict”). */
function detectionDisplayTitle(title: string): string {
  return title
    .trim()
    .split(/\s+/)
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ')
}

function issueBadge(issue: ClashGapIssue, compact?: boolean) {
  if (issue.type === 'conflict') {
    return (
      <span className="rounded-full border border-red-200 bg-red-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-900">
        Conflict
      </span>
    )
  }
  if (issue.type === 'missing') {
    return (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950">
        {compact ? 'Missing' : 'Missing info'}
      </span>
    )
  }
  return (
    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
      Verified
    </span>
  )
}

function ConfidenceDots({ level }: { level: ClashGapIssue['confidence'] }) {
  const n = level === 'high' ? 3 : level === 'medium' ? 2 : 1
  const fill =
    level === 'medium'
      ? 'bg-amber-400'
      : level === 'low'
        ? 'bg-slate-400'
        : 'bg-emerald-500'
  return (
    <div className="flex gap-0.5" aria-label={`Confidence ${level}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            i < n ? fill : 'bg-[#e2e8f0]',
          )}
        />
      ))}
    </div>
  )
}

function issueIcon(type: IssueType) {
  const common = 'h-4 w-4 shrink-0'
  if (type === 'conflict')
    return <AlertTriangle className={cn(common, 'text-red-600')} aria-hidden />
  if (type === 'missing')
    return <CircleAlert className={cn(common, 'text-amber-600')} aria-hidden />
  return <CircleCheck className={cn(common, 'text-emerald-600')} aria-hidden />
}

function sheetTags(sources: ClashGapIssue['sources']) {
  const tags: string[] = []
  for (const s of sources) {
    if (typeof s.page === 'string' && /\d/.test(s.page)) tags.push(String(s.page))
    const cs = /\b(\d{2}\s?\d{2}\s?\d{2})\b/.exec(s.documentLabel)
    if (cs) tags.push(cs[1].replace(/\s/g, ''))
  }
  return [...new Set(tags)].slice(0, 4)
}

/** Matches reference mock: first excerpt = Specification, second = Drawing */
function sourceColumnKind(idx: number): 'specification' | 'drawing' {
  return idx === 0 ? 'specification' : 'drawing'
}

function SourceTypeBadge({ kind }: { kind: 'specification' | 'drawing' }) {
  if (kind === 'specification')
    return (
      <span className="mb-2 inline-block rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        Specification
      </span>
    )
  return (
    <span className="mb-2 inline-block rounded-md bg-emerald-600/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
      Drawing
    </span>
  )
}

export function DetectionResultsWorkspace(props: {
  issues: ClashGapIssue[]
  ignoredIds: Set<string>
  onIgnore: (id: string) => void
  filter: IssueType | 'all'
  onFilterChange: (f: IssueType | 'all') => void
  disciplineFilter: string
  onDisciplineFilterChange: (d: string) => void
  search: string
  onSearchChange: (s: string) => void
  selectedIssueId: string | null
  onSelectIssue: (id: string | null) => void
  bookmarkedIds: Set<string>
  onToggleBookmark: (id: string) => void
  onOpenSources: (issue: ClashGapIssue) => void
  onFocusRfi: () => void
  draft: RfiDraftState | null
  setDraft: (updater: RfiDraftState | ((prev: RfiDraftState) => RfiDraftState)) => void
  uploadFilenames: string[]
  linkedIssue: ClashGapIssue | null
  onClearDraft: () => void
  onSaveDraftLocal: () => void
  onCreateRfi: () => void
  rfiPanelRef: RefObject<HTMLDivElement | null>
  onBackToPrepare: () => void
}) {
  const [page, setPage] = useState(1)

  const visible = props.issues.filter((i) => !props.ignoredIds.has(i.id))
  const conflicts = visible.filter((i) => i.type === 'conflict').length
  const missing = visible.filter((i) => i.type === 'missing').length
  const verified = visible.filter((i) => i.type === 'verified').length

  const disciplines = useMemo(() => {
    const set = new Set<string>()
    visible.forEach((i) => {
      if (i.discipline) set.add(i.discipline)
    })
    return ['all', ...[...set].sort()]
  }, [visible])

  const q = props.search.trim().toLowerCase()
  const filtered = visible.filter((i) => {
    if (props.filter !== 'all' && i.type !== props.filter) return false
    if (props.disciplineFilter !== 'all' && (i.discipline ?? '') !== props.disciplineFilter)
      return false
    if (!q) return true
    return (
      i.title.toLowerCase().includes(q) ||
      i.summary.toLowerCase().includes(q) ||
      i.sources.some((s) => s.documentLabel.toLowerCase().includes(q))
    )
  })

  const activeId =
    props.selectedIssueId && filtered.some((i) => i.id === props.selectedIssueId)
      ? props.selectedIssueId
      : filtered[0]?.id ?? null

  const selected = filtered.find((i) => i.id === activeId) ?? null

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const start = (safePage - 1) * PAGE_SIZE
  const pageRows = filtered.slice(start, start + PAGE_SIZE)

  const chipClass = (
    label: string,
    value: IssueType | 'all',
    color: 'red' | 'amber' | 'emerald' | 'neutral',
    active: boolean,
  ) => {
    /** Reference: pastel fills + dark text; “All” solid blue when active, gray outline when not */
    const colors = {
      red: active
        ? 'border-red-300 bg-red-100 text-red-900'
        : 'border-transparent bg-red-50 text-red-700 hover:bg-red-100/80',
      amber: active
        ? 'border-amber-300 bg-amber-100 text-amber-950'
        : 'border-transparent bg-amber-50 text-amber-800 hover:bg-amber-100/80',
      emerald: active
        ? 'border-emerald-300 bg-emerald-100 text-emerald-950'
        : 'border-transparent bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80',
      neutral: active
        ? 'border-violet-600 bg-violet-600 text-white shadow-sm hover:bg-violet-700'
        : 'border-[#e2e8f0] bg-white text-[#475569] hover:bg-slate-50',
    }
    return (
      <button
        type="button"
        onClick={() => {
          props.onFilterChange(value)
          setPage(1)
        }}
        className={cn(
          'inline-flex h-9 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-bold transition-colors',
          colors[color],
        )}
      >
        {label}
      </button>
    )
  }

  const relatedTitles = useMemo(() => {
    if (!selected?.relatedIssueIds?.length) return []
    const map = new Map(props.issues.map((i) => [i.id, i]))
    return selected.relatedIssueIds
      .map((id) => map.get(id))
      .filter(Boolean) as ClashGapIssue[]
  }, [selected, props.issues])

  return (
    <div className="flex flex-col gap-5">
      <Button
        type="button"
        variant="ghost"
        className="-ml-2 h-9 w-fit text-[#475569]"
        onClick={props.onBackToPrepare}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to upload &amp; settings
      </Button>

      <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,0.93fr)_minmax(0,1.035fr)_minmax(0,1.035fr)] xl:items-start xl:gap-6">
        {/* Left */}
        <div className="flex min-h-0 min-w-0 flex-col gap-5 xl:rounded-2xl xl:border xl:border-[#e2e8f0] xl:bg-white xl:p-6 xl:shadow-sm">
          <h3 className="text-base font-semibold text-[#0f172a]">Issues found</h3>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-[#e2e8f0] border-t-4 border-t-red-600 bg-white px-3 py-3 text-center shadow-sm">
              <div className="text-xl font-bold tabular-nums text-[#991b1b]">{conflicts}</div>
              <div className="mt-1 text-xs font-semibold text-[#991b1b]">Conflicts</div>
            </div>
            <div className="rounded-xl border border-[#e2e8f0] border-t-4 border-t-amber-500 bg-white px-3 py-3 text-center shadow-sm">
              <div className="text-xl font-bold tabular-nums text-[#92400e]">{missing}</div>
              <div className="mt-1 text-xs font-semibold text-[#92400e]">Missing info</div>
            </div>
            <div className="rounded-xl border border-[#e2e8f0] border-t-4 border-t-emerald-600 bg-white px-3 py-3 text-center shadow-sm">
              <div className="text-xl font-bold tabular-nums text-[#166534]">{verified}</div>
              <div className="mt-1 text-xs font-semibold text-[#166534]">Verified</div>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                strokeWidth={2}
                aria-hidden
              />
              <Input
                placeholder="Search issues..."
                value={props.search}
                onChange={(e) => {
                  props.onSearchChange(e.target.value)
                  setPage(1)
                }}
                className="rounded-xl border-[#e2e8f0] pl-10 pr-3"
              />
            </div>
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e2e8f0] bg-white text-[#64748b] transition-colors hover:border-[#cbd5e1] hover:bg-slate-50 hover:text-[#0f172a]"
              aria-label="Filter"
            >
              <Filter className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <div className="grid w-full min-w-0 grid-cols-[auto_auto_auto_auto_minmax(0,1fr)] items-center gap-1.5">
            {chipClass('All', 'all', 'neutral', props.filter === 'all')}
            {chipClass('Conflicts', 'conflict', 'red', props.filter === 'conflict')}
            {chipClass('Missing', 'missing', 'amber', props.filter === 'missing')}
            {chipClass('Verified', 'verified', 'emerald', props.filter === 'verified')}
            <Select value={props.disciplineFilter} onValueChange={props.onDisciplineFilterChange}>
              <SelectTrigger className="h-9 min-h-9 w-full min-w-0 rounded-full border-[#d1d5db] bg-white px-2.5 text-xs font-medium text-[#374151] shadow-none hover:bg-slate-50 [&_[data-slot=select-value]]:truncate">
                <SelectValue placeholder="Discipline" />
              </SelectTrigger>
              <SelectContent>
                {disciplines.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d === 'all' ? 'All disciplines' : d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="scrollbar-thin flex max-h-[min(52vh,640px)] flex-col gap-3 overflow-y-auto pr-1">
            {pageRows.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">No matching issues.</p>
            ) : (
              pageRows.map((issue) => {
                const sel = activeId === issue.id
                const selClass =
                  issue.type === 'conflict'
                    ? 'border border-red-200 bg-gradient-to-br from-red-50 via-white to-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
                    : issue.type === 'missing'
                      ? 'border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
                      : 'border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
                return (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => props.onSelectIssue(issue.id)}
                    className={cn(
                      'group w-full rounded-xl px-3.5 py-3.5 text-left transition-colors',
                      sel
                        ? selClass
                        : 'border border-[#e5e7eb] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-[#d1d5db]',
                    )}
                  >
                    <div className="flex gap-3">
                      <div className="mt-0.5 shrink-0">{issueIcon(issue.type)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="line-clamp-3 text-left text-sm font-semibold leading-snug text-[#111827]">
                            {detectionDisplayTitle(issue.title)}
                          </span>
                          <ChevronRight
                            className="mt-0.5 h-5 w-5 shrink-0 text-[#9ca3af] transition-colors group-hover:text-[#6b7280]"
                            strokeWidth={2}
                            aria-hidden
                          />
                        </div>
                        <p className="mt-1 line-clamp-3 text-left text-xs leading-relaxed text-[#6b7280]">
                          {issue.summary}
                        </p>
                        <div className="mt-2 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                          <div className="flex flex-wrap gap-1">
                            {sheetTags(issue.sources).map((t) => (
                              <span
                                key={t}
                                className="rounded bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] font-medium text-[#4b5563]"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                            {issueBadge(issue, true)}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-medium capitalize text-[#6b7280]">
                                {issue.confidence}
                              </span>
                              <ConfidenceDots level={issue.confidence} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-[#e2e8f0] pt-3 text-xs text-[#475569] sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing{' '}
              {filtered.length === 0 ? 0 : start + 1}{' '}
              to{' '}
              {Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length} issues
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg border-[#e2e8f0] bg-white"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {pageCount <= 7
                ? Array.from({ length: pageCount }, (_, i) => i + 1).map((pn) => (
                    <Button
                      key={pn}
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-9 min-w-[2.25rem] rounded-lg px-2 text-xs font-semibold',
                        pn === safePage
                          ? 'border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-50'
                          : 'border-[#e2e8f0] bg-white font-semibold text-violet-600 hover:bg-slate-50',
                      )}
                      onClick={() => setPage(pn)}
                    >
                      {pn}
                    </Button>
                  ))
                : (
                    <span className="text-muted-foreground px-2 text-xs tabular-nums">
                      {safePage} / {pageCount}
                    </span>
                  )}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg border-[#e2e8f0] bg-white"
                disabled={safePage >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Center */}
        <div className="flex min-h-[480px] min-w-0 flex-col">
          {!selected ? (
            <Card className="flex flex-1 flex-col items-center justify-center rounded-2xl border-[#e2e8f0] bg-white p-12 text-center shadow-sm">
              <p className="font-medium text-[#0f172a]">Select an issue</p>
              <p className="text-muted-foreground mt-2 max-w-sm text-sm">
                Detailed comparison and rationale appear here when you choose an issue from the list.
              </p>
            </Card>
          ) : (
            <Card className="flex flex-1 flex-col overflow-hidden rounded-2xl border-[#e2e8f0] bg-white shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#f1f5f9] p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold leading-snug text-[#0f172a] md:text-xl">
                      {detectionDisplayTitle(selected.title)}
                    </h2>
                    {issueBadge(selected)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-pressed={props.bookmarkedIds.has(selected.id)}
                    className={cn(props.bookmarkedIds.has(selected.id) && 'text-violet-600')}
                    onClick={() => props.onToggleBookmark(selected.id)}
                  >
                    <Bookmark
                      className="h-5 w-5"
                      fill={props.bookmarkedIds.has(selected.id) ? 'currentColor' : 'none'}
                    />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => props.onSelectIssue(null)}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              <CardContent className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
                <p className="text-sm font-medium leading-relaxed text-[#334155]">
                  {selected.summary}
                </p>

                <div className="text-muted-foreground flex flex-wrap items-center gap-x-1 gap-y-1 text-xs">
                  <span>
                    Discipline:{' '}
                    <span className="font-semibold text-[#0f172a]">
                      {selected.discipline ?? '—'}
                    </span>
                  </span>
                  {selected.category ? (
                    <>
                      <span className="mx-1 text-[#cbd5e1]">•</span>
                      <span>Category: </span>
                      <span className="font-semibold text-[#0f172a]">{selected.category}</span>
                    </>
                  ) : null}
                  <span className="flex items-center gap-1 capitalize">
                    <span className="mx-1 text-[#cbd5e1]">•</span>
                    Confidence:{' '}
                    <span className="font-semibold text-[#0f172a]">{selected.confidence}</span>
                    <ConfidenceDots level={selected.confidence} />
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-[#475569]">
                    Sources ({selected.sources.length})
                  </h3>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {selected.sources.slice(0, 2).map((src, idx) => {
                      const kind = sourceColumnKind(idx)
                      return (
                        <div
                          key={`${selected.id}-${idx}`}
                          className="flex flex-col gap-2 rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
                        >
                          <SourceTypeBadge kind={kind} />
                          <div className="text-sm font-semibold leading-snug text-[#0f172a]">
                            {src.documentLabel}
                          </div>
                          <div className="text-muted-foreground text-xs">Page {src.page}</div>
                          <p className="text-sm leading-relaxed text-[#334155]">
                            <HighlightedExcerpt
                              text={src.excerpt}
                              highlight={src.highlight}
                              variant={idx === 0 ? 'amber' : 'red'}
                            />
                          </p>
                        </div>
                      )
                    })}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 rounded-xl border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
                    onClick={() => props.onOpenSources(selected)}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" strokeWidth={1.8} />
                    View Full Sources
                  </Button>
                </div>

                {selected.rationale ? (
                  <div
                    className={cn(
                      'rounded-xl border p-4',
                      selected.type === 'conflict' &&
                        'border-rose-100 bg-rose-50/90 dark:border-rose-950/40 dark:bg-rose-950/25',
                      selected.type === 'missing' &&
                        'border-amber-100 bg-amber-50/60 dark:bg-amber-950/25',
                      selected.type === 'verified' &&
                        'border-emerald-100 bg-emerald-50/60 dark:bg-emerald-950/20',
                    )}
                  >
                    <h3 className="text-sm font-semibold text-[#0f172a]">
                      {selected.type === 'conflict'
                        ? 'Why this is a conflict'
                        : selected.type === 'missing'
                          ? 'Why information may be missing'
                          : 'Verification note'}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#334155]">{selected.rationale}</p>
                  </div>
                ) : null}

                {relatedTitles.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-semibold text-[#475569]">
                      Related issues ({relatedTitles.length})
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {relatedTitles.map((ri) => (
                        <li key={ri.id}>
                          <button
                            type="button"
                            onClick={() => props.onSelectIssue(ri.id)}
                            className="flex w-full flex-wrap items-center gap-2 text-left text-sm font-medium text-violet-700 hover:underline"
                          >
                            <span>{detectionDisplayTitle(ri.title)}</span>
                            <span className="inline-flex scale-90">{issueBadge(ri)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 rounded-xl border-[#e2e8f0] text-violet-700 hover:bg-violet-50"
                      onClick={() => {
                        const next =
                          relatedTitles.find((ri) => ri.id !== props.selectedIssueId) ??
                          relatedTitles[0]!
                        props.onSelectIssue(next.id)
                      }}
                    >
                      View all related
                    </Button>
                  </div>
                ) : null}

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#f1f5f9] pt-5">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl border-[#e2e8f0]"
                    onClick={() => props.onIgnore(selected.id)}
                  >
                    <Ban className="mr-2 h-4 w-4" strokeWidth={1.8} />
                    Ignore Issue
                  </Button>
                  <Button
                    type="button"
                    className="rounded-xl bg-violet-600 text-white hover:bg-violet-700"
                    onClick={() => {
                      props.onFocusRfi()
                    }}
                  >
                    <SquarePlus className="mr-2 h-4 w-4" strokeWidth={2} aria-hidden />
                    Add to RFI
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right */}
        <div className="min-h-0 min-w-0">
          <RfiDraftPanel
            panelRef={props.rfiPanelRef}
            issue={props.linkedIssue}
            draft={props.draft}
            setDraft={props.setDraft}
            uploadFilenames={props.uploadFilenames}
            onClear={props.onClearDraft}
            onSaveDraftLocal={props.onSaveDraftLocal}
            onCreateRfi={props.onCreateRfi}
          />
        </div>
      </div>

      <p className="text-muted-foreground text-center text-xs leading-relaxed">
        AI analysis can make mistakes. Always review results and sources.
      </p>
    </div>
  )
}

