'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
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
  status: 'Approved' | 'Rejected'
  notes: string | null
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

/** Shows reviewer notes with a two-line clamp; overflow reveals a “More” / “Less” toggle. */
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

export function DocumentActivityPanel(props: { documentId: string }) {
  const { documentId } = props
  const [reviewDecisions, setReviewDecisions] = useState<ReviewDecisionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<{
        activity: unknown[]
        reviewDecisions?: ReviewDecisionSummary[]
      }>(`/api/documents/${documentId}/activity`)
      setReviewDecisions(Array.isArray(res.reviewDecisions) ? res.reviewDecisions : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity')
      setReviewDecisions([])
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    void load()
  }, [load])

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
          <div className="mb-2">
            <h3 className="text-base font-semibold text-[#0f172a]">Review outcomes</h3>
            <p className="mt-0.5 text-sm text-[#64748b]">
              Each row is one reviewer decision (Approved or Rejected) with any notes they provided.
            </p>
          </div>
          <div className="mb-6 overflow-hidden rounded-lg border border-[#e2e8f0]">
            <Table>
              <TableHeader>
                <TableRow className="border-[#e2e8f0] hover:bg-[#f8fafc]">
                  <TableHead className="px-3 text-[#475569]">Date</TableHead>
                  <TableHead className="px-3 text-[#475569]">Round</TableHead>
                  <TableHead className="px-3 text-[#475569]">Reviewer</TableHead>
                  <TableHead className="px-3 text-[#475569]">Status</TableHead>
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
                            d.status === 'Approved'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                              : 'border-rose-200 bg-rose-50 text-rose-900'
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
