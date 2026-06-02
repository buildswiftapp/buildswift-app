'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import type { ApiClashGapAnalysisListItem } from '@/lib/clash-gap-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  FileSearch,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const PAGE_SIZE = 8

// Compact pagination: first/last page, the current page and its neighbours, with
// an ellipsis for any gap (e.g. 1 … 4 5 6 … 12). ≤ 5 pages are shown in full.
function pageItems(current: number, total: number): (number | 'gap')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)
  const items: (number | 'gap')[] = [1]
  const left = Math.max(2, current - 1)
  const right = Math.min(total - 1, current + 1)
  if (left > 2) items.push('gap')
  for (let p = left; p <= right; p++) items.push(p)
  if (right < total - 1) items.push('gap')
  items.push(total)
  return items
}

function formatSavedDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function issueSummary(analysis: ApiClashGapAnalysisListItem) {
  const byType = analysis.summary?.by_type
  const conflicts = byType?.clash ?? 0
  const missing = byType?.gap ?? 0
  const verified = byType?.mismatch ?? 0
  const total = analysis.issue_count ?? analysis.summary?.total ?? conflicts + missing + verified
  return { total, conflicts, missing, verified }
}

function formatDocList(names: string[] | undefined): string {
  if (!names?.length) return '—'
  return names.join(', ')
}

export function ClashGapSessionsPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<ApiClashGapAnalysisListItem[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [sessionPendingDelete, setSessionPendingDelete] = useState<{
    id: string
    projectName: string
  } | null>(null)

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ analyses: ApiClashGapAnalysisListItem[] }>(
        '/api/clash-gap/analyses?saved=1',
      )
      setSessions(data.analyses ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load saved sessions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  const startNewSession = () => {
    router.push('/clash-gap-detection/session?new=1')
  }

  const openDeleteConfirm = (id: string, projectName: string) => {
    setSessionPendingDelete({ id, projectName })
    setDeleteConfirmOpen(true)
  }

  const confirmDeleteSession = async () => {
    if (!sessionPendingDelete) return
    const { id } = sessionPendingDelete
    setDeletingId(id)
    try {
      await apiFetch(`/api/clash-gap/analyses/${id}`, { method: 'DELETE' })
      setSessions((prev) => prev.filter((s) => s.id !== id))
      setDeleteConfirmOpen(false)
      setSessionPendingDelete(null)
      toast.success('Session deleted.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete session')
    } finally {
      setDeletingId(null)
    }
  }

  const pageCount = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const start = (safePage - 1) * PAGE_SIZE
  const pageSessions = sessions.slice(start, start + PAGE_SIZE)

  return (
    <div className="min-h-full w-full bg-[#f9fafb] pb-10">
      <div className="border-b border-[#e2e8f0] bg-white px-4 py-5 shadow-sm sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[min(100%,1720px)] flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 max-w-3xl items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100">
                <Sparkles className="h-5 w-5 text-violet-600" strokeWidth={2.25} aria-hidden />
              </div>
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-[#0f172a] md:text-[26px]">
                    Detection Tool
                  </h1>
                  <span className="rounded-md bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">
                    BETA
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-[#475569]">
                  Find gaps and conflicts in your plans and specs. Auto-generate RFIs from detected
                  issues. Findings are based on document text, not 3D geometry.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
              <Button type="button" className="rounded-xl bg-violet-600 text-white hover:bg-violet-700" onClick={startNewSession}>
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                New Session
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[min(100%,1720px)] px-4 pt-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-[#0f172a]">Saved sessions</h2>
          <p className="text-sm text-[#64748b]">
            Sessions you finished with Save and Done. Open one to review issues and download reports.
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-[#e2e8f0] bg-white px-6 py-12 text-center text-sm text-[#64748b]">
            Loading saved sessions…
          </div>
        ) : sessions.length === 0 ? (
          <Card className="rounded-2xl border-[#e2e8f0] shadow-sm">
            <CardContent className="flex flex-col items-center gap-4 px-6 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50">
                <FileSearch className="h-7 w-7 text-violet-600" aria-hidden />
              </div>
              <div className="max-w-md space-y-1">
                <p className="text-base font-semibold text-[#0f172a]">No saved sessions yet</p>
                <p className="text-sm text-[#64748b]">
                  Run a detection, review the results, then use Save and Done to keep the session here.
                </p>
              </div>
              <Button type="button" className="rounded-xl bg-violet-600 text-white hover:bg-violet-700" onClick={startNewSession}>
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                Start new session
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
          <div className="grid gap-3">
            {pageSessions.map((session) => {
              const { total, conflicts, missing, verified } = issueSummary(session)
              const isDeleting = deletingId === session.id
              const projectName = session.project_name?.trim() || 'Untitled project'
              return (
                <div
                  key={session.id}
                  className="group relative rounded-2xl border border-[#e2e8f0] bg-white shadow-sm transition-shadow hover:shadow-md"
                >
                  <Link
                    href={`/clash-gap-detection/session?analysis=${session.id}`}
                    className="block p-5 pr-14"
                  >
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr_auto] lg:items-center lg:gap-6">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-base font-semibold text-[#0f172a] group-hover:text-violet-700">
                          {projectName}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748b]">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" aria-hidden />
                            Saved {formatSavedDate(session.saved_at)}
                          </span>
                          <span>{total} issue{total === 1 ? '' : 's'}</span>
                        </div>
                      </div>

                      <div className="min-w-0 space-y-2 border-[#e2e8f0] lg:border-x lg:px-6">
                        <div className="flex min-w-0 items-start gap-2 text-sm">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-violet-50 text-violet-700">
                            <FileText className="h-3 w-3" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">Plans</p>
                            <p className="truncate text-[#334155]" title={formatDocList(session.plan_documents)}>
                              {formatDocList(session.plan_documents)}
                            </p>
                          </div>
                        </div>
                        <div className="flex min-w-0 items-start gap-2 text-sm">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-sky-50 text-sky-700">
                            <FileText className="h-3 w-3" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">Specs</p>
                            <p className="truncate text-[#334155]" title={formatDocList(session.spec_documents)}>
                              {formatDocList(session.spec_documents)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                          {conflicts} conflicts
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">
                          <CircleAlert className="h-3.5 w-3.5" aria-hidden />
                          {missing} missing
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                          <CircleCheck className="h-3.5 w-3.5" aria-hidden />
                          {verified} verified
                        </span>
                      </div>
                    </div>
                  </Link>
                  <button
                    type="button"
                    aria-label={`Delete session ${projectName}`}
                    disabled={isDeleting}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      openDeleteConfirm(session.id, projectName)
                    }}
                    className="absolute right-4 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg border border-[#e2e8f0] bg-white text-[#64748b] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </div>
              )
            })}
          </div>
          {pageCount > 1 ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs text-[#475569]">
              <span className="min-w-0 truncate">
                Showing {start + 1}–{Math.min(start + PAGE_SIZE, sessions.length)} of {sessions.length}
              </span>
              <div className="flex flex-nowrap items-center gap-1">
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
                {pageItems(safePage, pageCount).map((item, i) =>
                  item === 'gap' ? (
                    <span
                      key={`gap-${i}`}
                      className="text-muted-foreground select-none px-1 text-xs tabular-nums"
                    >
                      …
                    </span>
                  ) : (
                    <Button
                      key={item}
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-9 min-w-[2.25rem] rounded-lg px-2 text-xs font-semibold',
                        item === safePage
                          ? 'border-violet-600 bg-violet-600 text-white hover:bg-violet-600'
                          : 'border-[#e2e8f0] bg-white text-violet-600 hover:bg-slate-50',
                      )}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </Button>
                  ),
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
          ) : null}
          </>
        )}
      </div>

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!deletingId) {
            setDeleteConfirmOpen(open)
            if (!open) setSessionPendingDelete(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this saved session?</DialogTitle>
            <DialogDescription>
              {sessionPendingDelete?.projectName ? (
                <>
                  <span className="font-medium text-[#0f172a]">{sessionPendingDelete.projectName}</span>
                  {' '}
                  will be permanently removed, including uploaded files, OCR data, and detected issues.
                  This cannot be undone.
                </>
              ) : (
                <>
                  This permanently deletes the analysis, uploaded files, OCR data, and detected issues
                  from the server. This cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(deletingId)}
              onClick={() => {
                setDeleteConfirmOpen(false)
                setSessionPendingDelete(null)
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={Boolean(deletingId)}
              onClick={() => void confirmDeleteSession()}
            >
              {deletingId ? 'Deleting…' : 'Delete session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
