'use client'

import type { RefObject } from 'react'
import { useMemo, useState } from 'react'
import type { ClashGapIssue, IssueType } from '@/lib/clash-gap-types'
import { HighlightedExcerpt } from '@/app/components/clash-gap-detection/highlighted-excerpt'
import { SummaryStatCard } from '@/app/components/clash-gap-detection/summary-stat-card'
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
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  FileText,
  Filter,
  Hammer,
  Search,
  SendIcon,
  ShieldCheck,
  SquarePlus,
  Tag,
} from 'lucide-react'
import type { RfiDraftState } from '@/lib/clash-gap-types'
import { RfiDraftPanel } from './rfi-draft-panel'

const PAGE_SIZE = 10

function detectionDisplayTitle(title: string): string {
  return title
    .trim()
    .split(/\s+/)
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ')
}

function issueTypeTheme(type: IssueType) {
  if (type === 'conflict') {
    return {
      accent: 'border-l-red-500',
      iconBox: 'bg-red-50',
      iconClass: 'text-red-600',
      badge: 'bg-red-50 text-red-700',
      badgeLabel: 'CONFLICT',
      chipColor: 'red' as const,
    }
  }
  if (type === 'missing') {
    return {
      accent: 'border-l-orange-500',
      iconBox: 'bg-orange-50',
      iconClass: 'text-orange-600',
      badge: 'bg-orange-50 text-orange-700',
      badgeLabel: 'MISSING',
      chipColor: 'orange' as const,
    }
  }
  return {
    accent: 'border-l-emerald-500',
    iconBox: 'bg-emerald-50',
    iconClass: 'text-emerald-600',
    badge: 'bg-emerald-50 text-emerald-800',
    badgeLabel: 'VERIFIED',
    chipColor: 'emerald' as const,
  }
}

function issueBadge(issue: ClashGapIssue, compact?: boolean) {
  const theme = issueTypeTheme(issue.type)
  const label =
    issue.type === 'missing' && !compact ? 'MISSING INFO' : theme.badgeLabel
  return (
    <span
      className={cn(
        'rounded-md px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide',
        theme.badge,
      )}
    >
      {label}
    </span>
  )
}

function SeverityDots({ level }: { level: ClashGapIssue['severity'] }) {
  const n = level === 'high' ? 3 : level === 'medium' ? 2 : 1
  const fill =
    level === 'medium'
      ? 'bg-orange-400'
      : level === 'low'
        ? 'bg-slate-400'
        : 'bg-emerald-500'
  return (
    <div className="flex gap-1" aria-label={`Confidence ${level}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'h-2 w-2 rounded-full',
            i < n ? fill : 'bg-[#e2e8f0]',
          )}
        />
      ))}
    </div>
  )
}

function IssueListIcon({ type }: { type: IssueType }) {
  const theme = issueTypeTheme(type)
  const common = cn('h-[18px] w-[18px]', theme.iconClass)
  const icon =
    type === 'conflict' ? (
      <AlertTriangle className={common} strokeWidth={2.5} aria-hidden />
    ) : type === 'missing' ? (
      <CircleAlert className={common} strokeWidth={2.5} aria-hidden />
    ) : (
      <CircleCheck className={common} strokeWidth={2.5} aria-hidden />
    )
  return (
    <div
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
        theme.iconBox,
      )}
    >
      {icon}
    </div>
  )
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

function sourceColumnKind(idx: number): 'specification' | 'drawing' {
  return idx === 0 ? 'specification' : 'drawing'
}

function SourceTypeBadge({ kind }: { kind: 'specification' | 'drawing' }) {
  if (kind === 'specification')
    return (
      <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-violet-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
        <FileText className="h-3 w-3" strokeWidth={2.5} aria-hidden />
        Specification
      </span>
    )
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
      <FileText className="h-3 w-3" strokeWidth={2.5} aria-hidden />
      Drawing
    </span>
  )
}

export function DetectionResultsWorkspace(props: {
  issues: ClashGapIssue[]
  onIgnoreIssue: (id: string) => void
  onAddToRfi: (id: string) => void
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
  draft: RfiDraftState | null
  setDraft: (updater: RfiDraftState | ((prev: RfiDraftState) => RfiDraftState)) => void
  uploadFilenames: string[]
  linkedIssue: ClashGapIssue | null
  onClearDraft: () => void
  onSaveDraftLocal: () => void
  onCreateRfi: () => void
  rfiPanelRef: RefObject<HTMLDivElement | null>
  onBackToUpload?: () => void
}) {
  const [page, setPage] = useState(1)

  const visible = props.issues
  const conflicts = visible.filter((i) => i.type === 'conflict').length
  const missing = visible.filter((i) => i.type === 'missing').length
  const verified = visible.filter((i) => i.type === 'mismatch').length
  const issueTotal = conflicts + missing + verified
  const barRatio = (n: number) => (issueTotal > 0 ? n / issueTotal : 0)

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
    color: 'red' | 'orange' | 'emerald' | 'neutral',
    active: boolean,
  ) => {
    const colors = {
      red: active
        ? 'border-red-200 bg-red-100 text-red-800'
        : 'border-transparent bg-red-50 text-red-700 hover:bg-red-100/80',
      orange: active
        ? 'border-orange-200 bg-orange-100 text-orange-800'
        : 'border-transparent bg-orange-50 text-orange-700 hover:bg-orange-100/80',
      emerald: active
        ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
        : 'border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-100/80',
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
      {props.onBackToUpload ? (
        <Button
          type="button"
          variant="ghost"
          className="-ml-2 h-9 w-fit text-[#475569]"
          onClick={props.onBackToUpload}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to upload
        </Button>
      ) : null}

      <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-[#0f172a]">Issues found</h3>
        <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
          <SummaryStatCard
            variant="conflict"
            count={conflicts}
            label="Conflicts"
            barRatio={barRatio(conflicts)}
          />
          <SummaryStatCard
            variant="missing"
            count={missing}
            label="Missing info"
            barRatio={barRatio(missing)}
          />
          <SummaryStatCard
            variant="verified"
            count={verified}
            label="Verified"
            barRatio={barRatio(verified)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,0.93fr)_minmax(0,1.035fr)_minmax(0,1.035fr)] xl:items-start xl:gap-6">
        <div className="flex min-h-0 min-w-0 flex-col gap-5 xl:h-[78vh] xl:max-h-[820px] xl:min-h-[560px] xl:overflow-hidden xl:rounded-2xl xl:border xl:border-[#e2e8f0] xl:bg-white xl:p-6 xl:shadow-sm">
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

          <div className="grid w-full min-w-0 grid-cols-[auto_auto_auto_minmax(0,1fr)] items-center gap-1.5">
            {chipClass('All', 'all', 'neutral', props.filter === 'all')}
            {chipClass('Conflicts', 'conflict', 'red', props.filter === 'conflict')}
            {chipClass('Missing', 'missing', 'orange', props.filter === 'missing')}
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

          <div className="scrollbar-thin flex max-h-[min(52vh,640px)] flex-col gap-3 overflow-y-auto pr-1 xl:max-h-none xl:min-h-0 xl:flex-1">
            {pageRows.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">No matching issues.</p>
            ) : (
              pageRows.map((issue) => {
                const sel = activeId === issue.id
                const theme = issueTypeTheme(issue.type)
                return (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => props.onSelectIssue(issue.id)}
                    className={cn(
                      'group flex w-full gap-3 rounded-xl border border-[#e5e7eb] border-l-4 bg-white px-3.5 py-4 text-left shadow-sm transition-colors hover:border-[#d1d5db]',
                      theme.accent,
                      sel && 'ring-2 ring-violet-200 ring-offset-1',
                    )}
                  >
                    <IssueListIcon type={issue.type} />
                    <div className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-left text-[15px] font-semibold leading-snug text-[#111827]">
                        {detectionDisplayTitle(issue.title)}
                      </span>
                      <p className="mt-1.5 line-clamp-2 text-left text-[13px] leading-relaxed text-[#6b7280]">
                        {issue.summary}
                      </p>
                      {sheetTags(issue.sources).length > 0 ? (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {sheetTags(issue.sources).map((t) => (
                            <span
                              key={t}
                              className="rounded-md bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-medium text-[#4b5563]"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-2.5">
                        {issueBadge(issue, true)}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium capitalize text-[#6b7280]">
                            {issue.severity}
                          </span>
                          <SeverityDots level={issue.severity} />
                        </div>
                      </div>
                    </div>
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-lg border border-[#e2e8f0] bg-white text-[#9ca3af] transition-colors group-hover:border-[#cbd5e1] group-hover:text-[#6b7280]"
                      aria-hidden
                    >
                      <ChevronRight className="h-4 w-4" strokeWidth={2} />
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
                          ? 'border-violet-600 bg-violet-600 text-white hover:bg-violet-600'
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

        <div className="flex min-h-[480px] min-w-0 flex-col xl:h-[78vh] xl:max-h-[820px] xl:min-h-[560px]">
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
              </div>

              <CardContent className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
                <p className="text-sm leading-relaxed text-[#475569]">{selected.summary}</p>
                {selected.suggestedAction ? (
                  <p className="text-sm leading-relaxed text-[#475569]">
                    <span className="font-semibold text-[#334155]">Suggested action: </span>
                    {selected.suggestedAction}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#64748b]">
                  <span className="inline-flex items-center gap-1.5">
                    <Hammer className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Discipline:{' '}
                    <span className="font-semibold text-[#0f172a]">
                      {selected.discipline ?? '—'}
                    </span>
                  </span>
                  {selected.category ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      Category:{' '}
                      <span className="font-semibold text-[#0f172a]">{selected.category}</span>
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5 capitalize">
                    <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Confidence:{' '}
                    <span className="font-semibold text-[#0f172a]">{selected.confidence}</span>
                    <SeverityDots level={selected.severity} />
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-[#0f172a]">
                    Sources ({selected.sources.length})
                  </h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {selected.sources.slice(0, 2).map((src, idx) => {
                      const kind = sourceColumnKind(idx)
                      return (
                        <div
                          key={`${selected.id}-${idx}`}
                          className="flex flex-col gap-2 rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                        >
                          <SourceTypeBadge kind={kind} />
                          <div className="text-sm font-semibold leading-snug text-[#0f172a]">
                            {src.documentLabel}
                          </div>
                          <div className="text-xs text-[#64748b]">Page {src.page}</div>
                          <p className="text-sm leading-relaxed text-[#475569]">
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
                    className="mt-3 rounded-xl border-[#e2e8f0] bg-white text-violet-700 hover:bg-violet-50"
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
                      selected.type === 'conflict' && 'border-red-200 bg-red-50',
                      selected.type === 'missing' && 'border-orange-200 bg-orange-50',
                      selected.type === 'mismatch' && 'border-emerald-200 bg-emerald-50',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <CircleAlert
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0',
                          selected.type === 'conflict' && 'text-red-600',
                          selected.type === 'missing' && 'text-orange-500',
                          selected.type === 'mismatch' && 'text-emerald-600',
                        )}
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-[#0f172a]">
                          {selected.type === 'conflict'
                            ? 'Why this is a conflict'
                            : selected.type === 'missing'
                              ? 'Why information may be missing'
                              : 'Verification note'}
                        </h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-[#475569]">
                          {selected.rationale}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {relatedTitles.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-semibold text-[#0f172a]">
                      Related issues ({relatedTitles.length})
                    </h3>
                    <ul className="mt-2 space-y-1.5">
                      {relatedTitles.map((ri) => {
                        const theme = issueTypeTheme(ri.type)
                        const Icon =
                          ri.type === 'conflict'
                            ? AlertTriangle
                            : ri.type === 'missing'
                              ? CircleAlert
                              : CircleCheck
                        return (
                          <li key={ri.id}>
                            <button
                              type="button"
                              onClick={() => props.onSelectIssue(ri.id)}
                              className="flex w-full items-center gap-2 rounded-md py-1 text-left text-sm transition-colors hover:bg-slate-50"
                            >
                              <Icon
                                className={cn('h-4 w-4 shrink-0', theme.iconClass)}
                                strokeWidth={2.5}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1 truncate font-medium text-violet-700 hover:underline">
                                {detectionDisplayTitle(ri.title)}
                              </span>
                              {issueBadge(ri, true)}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 rounded-xl border-[#e2e8f0] text-[#475569] hover:bg-slate-50"
                      onClick={() => {
                        const next =
                          relatedTitles.find((ri) => ri.id !== props.selectedIssueId) ??
                          relatedTitles[0]!
                        props.onSelectIssue(next.id)
                      }}
                    >
                      View all related
                      <ChevronRight className="ml-1 h-4 w-4" strokeWidth={2} aria-hidden />
                    </Button>
                  </div>
                ) : null}

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#f1f5f9] pt-5">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl border-[#e2e8f0] text-[#475569]"
                    onClick={() => props.onIgnoreIssue(selected.id)}
                  >
                    <Ban className="mr-2 h-4 w-4" strokeWidth={2} aria-hidden />
                    Ignore Issue
                  </Button>
                  <Button
                    type="button"
                    className="rounded-xl bg-violet-600 text-white hover:bg-violet-700"
                    onClick={() => props.onAddToRfi(selected.id)}
                  >
                    <SendIcon className="mr-2 h-4 w-4" strokeWidth={2} aria-hidden />
                    Send to RFI
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="min-h-0 min-w-0 xl:h-[78vh] xl:max-h-[820px] xl:min-h-[560px]">
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

