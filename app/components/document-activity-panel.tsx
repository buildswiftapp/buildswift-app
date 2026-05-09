'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { History, MessageSquare } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

export type ReviewDecisionSummary = {
  id: string
  review_cycle_id: string
  cycle_no: number | null
  decided_at: string
  reviewer_email: string
  reviewer_name: string | null
  status: 'Approved' | 'Answered' | 'Rejected'
  notes: string | null
}

type DocType = 'rfi' | 'submittal' | 'change_order'

type ActivityRow = {
  id?: string | null
  created_at?: string | null
  event_type?: string | null
  actor_type?: string | null
  actor_email?: string | null
  actor_display_name?: string | null
  event_data?: unknown
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

function humanizeStatus(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function eventDataAsObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return {}
}

function describeActivity(row: ActivityRow): { label: string; detail: string | null } {
  const data = eventDataAsObject(row.event_data)
  const fromStatus = typeof data.from_status === 'string' ? data.from_status : null
  const toStatus = typeof data.to_status === 'string' ? data.to_status : null
  const note = typeof data.note === 'string' ? data.note : null

  switch (row.event_type) {
    case 'document.created':
      return {
        label: 'Document created',
        detail: typeof data.title === 'string' ? data.title : null,
      }
    case 'document.updated':
      return { label: 'Document updated', detail: null }
    case 'document.deleted':
      return { label: 'Document deleted', detail: null }
    case 'document.comment':
      return {
        label: 'Comment added',
        detail: typeof data.body === 'string' ? data.body : null,
      }
    case 'document.sent_for_review': {
      const reviewers =
        typeof data.reviewer_count === 'number' ? `${data.reviewer_count} reviewer(s)` : null
      return {
        label: 'Sent for review',
        detail: [reviewers, toStatus ? `→ ${humanizeStatus(toStatus)}` : null]
          .filter(Boolean)
          .join(' • ') || null,
      }
    }
    case 'document.review_link_resent':
      return { label: 'Review link resent', detail: null }
    case 'reviewer.decision_submitted': {
      const outcome = typeof data.outcome === 'string' ? data.outcome : null
      const decision = typeof data.decision === 'string' ? data.decision : null
      const detail = outcome ?? decision
      return {
        label: 'Reviewer responded',
        detail: detail ? humanizeStatus(detail) : null,
      }
    }
    case 'document.status_changed': {
      const transition =
        fromStatus && toStatus
          ? `${humanizeStatus(fromStatus)} → ${humanizeStatus(toStatus)}`
          : toStatus
            ? humanizeStatus(toStatus)
            : null
      const reason = typeof data.reason === 'string' ? humanizeStatus(data.reason) : null
      return {
        label: 'Status changed',
        detail: [transition, reason].filter(Boolean).join(' • ') || null,
      }
    }
    case 'document.closed':
      return {
        label: 'Document closed',
        detail: note ?? (toStatus ? humanizeStatus(toStatus) : null),
      }
    case 'review.invited':
    case 'reviewer.invited':
      return { label: 'Reviewer invited', detail: null }
    case 'review.viewed':
    case 'reviewer.viewed':
      return { label: 'Reviewer opened link', detail: null }
    default: {
      const fallback = (row.event_type || 'Event').replace(/[._]/g, ' ')
      return { label: humanizeStatus(fallback), detail: null }
    }
  }
}

/** Shows reviewer notes with a two-line clamp; overflow reveals a More / Less toggle. */
function ExpandableReviewerNotes({ text }: { text: string | null }) {
  const [expanded, setExpanded] = useState(false)
  const [truncatable, setTruncatable] = useState(false)
  const contentRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    setExpanded(false)
  }, [text])

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return

    const updateTruncatable = () => {
      const node = contentRef.current
      if (!node || expanded) return
      setTruncatable(node.scrollHeight > node.clientHeight + 2)
    }

    updateTruncatable()
    const ro = new ResizeObserver(updateTruncatable)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, expanded])

  if (text == null || text === '') {
    return <span>—</span>
  }

  return (
    <div className="min-w-0 text-sm leading-relaxed text-[#475569]">
      <p
        ref={contentRef}
        className={cn('break-words whitespace-pre-wrap', !expanded && 'line-clamp-2')}
      >
        {text}
      </p>
      {truncatable ? (
        <button
          type="button"
          className="mt-1 font-medium text-[#0b1d3a] hover:underline"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Less' : 'More'}
        </button>
      ) : null}
    </div>
  )
}

export function DocumentActivityPanel(props: { documentId: string; docType?: DocType }) {
  const { documentId, docType } = props
  const positiveOutcomeLabel = docType === 'rfi' ? 'Answered' : 'Approved'
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [reviewDecisions, setReviewDecisions] = useState<ReviewDecisionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<{
        activity: ActivityRow[]
        reviewDecisions?: ReviewDecisionSummary[]
      }>(`/api/documents/${documentId}/activity`)
      setActivity(Array.isArray(res.activity) ? res.activity : [])
      setReviewDecisions(Array.isArray(res.reviewDecisions) ? res.reviewDecisions : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity')
      setActivity([])
      setReviewDecisions([])
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    void load()
  }, [load])

  // Chronological newest-first for the history table.
  const orderedActivity = useMemo(() => {
    return [...activity].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return tb - ta
    })
  }, [activity])

  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:p-6">
      <div className="mb-5 flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-[#64748b]" strokeWidth={2} aria-hidden />
        <h2 className="text-lg font-semibold text-[#0f172a]">Activity Log</h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-[#64748b]">
          <Spinner className="h-5 w-5" />
          Loading activity…
        </div>
      ) : error ? (
        <p className="rounded-lg border border-red-200 bg-red-50/90 px-3 py-2 text-sm text-red-900">{error}</p>
      ) : (
        <>
          {/* History (chronological log) — no current-status badge here. */}
          <div className="mb-2 flex items-center gap-2">
            <History className="h-4 w-4 text-[#64748b]" strokeWidth={2} aria-hidden />
            <h3 className="text-base font-semibold text-[#0f172a]">History</h3>
          </div>
          <p className="mb-3 text-sm text-[#64748b]">
            Chronological record of every action on this document. Status, reviewer activity, and
            closure are all logged here. The current status pill lives only in the page header.
          </p>
          <div className="mb-6 overflow-hidden rounded-lg border border-[#e2e8f0]">
            <Table>
              <TableHeader>
                <TableRow className="border-[#e2e8f0] hover:bg-[#f8fafc]">
                  <TableHead className="px-3 text-[#475569]">When</TableHead>
                  <TableHead className="px-3 text-[#475569]">Actor</TableHead>
                  <TableHead className="px-3 text-[#475569]">Event</TableHead>
                  <TableHead className="min-w-[14rem] px-3 text-[#475569]">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderedActivity.length === 0 ? (
                  <TableRow className="border-[#e2e8f0] hover:bg-transparent">
                    <TableCell colSpan={4} className="px-3 py-6 text-center text-sm text-[#64748b]">
                      No activity recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  orderedActivity.map((row, idx) => {
                    const { label, detail } = describeActivity(row)
                    const actorName =
                      row.actor_display_name?.trim() ||
                      row.actor_email?.trim() ||
                      (row.actor_type === 'system' ? 'System' : 'Team member')
                    return (
                      <TableRow key={row.id ?? `act-${idx}`} className="border-[#e2e8f0]">
                        <TableCell className="whitespace-nowrap px-3 align-top text-[#0f172a]">
                          {row.created_at ? formatWhen(row.created_at) : '—'}
                        </TableCell>
                        <TableCell className="max-w-[14rem] px-3 align-top">
                          <div className="text-sm font-medium text-[#0f172a]">{actorName}</div>
                          {row.actor_email && row.actor_email !== actorName ? (
                            <div className="mt-0.5 truncate text-xs text-[#64748b]" title={row.actor_email}>
                              {row.actor_email}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-3 align-top text-sm font-medium text-[#0f172a]">
                          {label}
                        </TableCell>
                        <TableCell className="px-3 align-top">
                          <span className="text-sm text-[#475569]">{detail ?? '—'}</span>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Reviewer responses sub-table: this is data (per-row outcome), NOT a current-status badge. */}
          <div className="mb-2">
            <h3 className="text-base font-semibold text-[#0f172a]">Reviewer responses</h3>
            <p className="mt-0.5 text-sm text-[#64748b]">
              Each row is one reviewer decision ({positiveOutcomeLabel} or Rejected) with any notes
              they provided.
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border border-[#e2e8f0]">
            <Table>
              <TableHeader>
                <TableRow className="border-[#e2e8f0] hover:bg-[#f8fafc]">
                  <TableHead className="px-3 text-[#475569]">Date</TableHead>
                  <TableHead className="px-3 text-[#475569]">Round</TableHead>
                  <TableHead className="px-3 text-[#475569]">Reviewer</TableHead>
                  <TableHead className="px-3 text-[#475569]">Outcome</TableHead>
                  <TableHead className="min-w-[12rem] px-3 text-[#475569]">Reviewer notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewDecisions.length === 0 ? (
                  <TableRow className="border-[#e2e8f0] hover:bg-transparent">
                    <TableCell colSpan={5} className="px-3 py-6 text-center text-sm text-[#64748b]">
                      No reviewer decisions recorded for this document yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  reviewDecisions.map((d) => (
                    <TableRow key={d.id} className="border-[#e2e8f0]">
                      <TableCell className="whitespace-nowrap px-3 text-[#0f172a]">
                        {formatWhen(d.decided_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-3 text-[#0f172a]">
                        {d.cycle_no != null ? `#${d.cycle_no}` : '—'}
                      </TableCell>
                      <TableCell className="max-w-[14rem] px-3 align-top">
                        <div className="text-sm font-medium text-[#0f172a]">
                          {d.reviewer_name ?? d.reviewer_email ?? '—'}
                        </div>
                        {d.reviewer_name && d.reviewer_email ? (
                          <div className="mt-0.5 truncate text-xs text-[#64748b]" title={d.reviewer_email}>
                            {d.reviewer_email}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-3 align-top">
                        <Badge
                          variant="outline"
                          className={cn(
                            d.status === 'Rejected'
                              ? 'border-rose-200 bg-rose-50 text-rose-900'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          )}
                        >
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md px-3 align-top">
                        <ExpandableReviewerNotes text={d.notes} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
