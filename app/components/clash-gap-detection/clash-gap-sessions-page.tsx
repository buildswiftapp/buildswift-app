'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import type { ApiClashGapAnalysisListItem } from '@/lib/clash-gap-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertTriangle,
  CircleAlert,
  CircleCheck,
  Clock,
  FileSearch,
  Plus,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

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

export function ClashGapSessionsPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<ApiClashGapAnalysisListItem[]>([])
  const [loading, setLoading] = useState(true)

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
          <div className="grid gap-3">
            {sessions.map((session) => {
              const { total, conflicts, missing, verified } = issueSummary(session)
              return (
                <Link
                  key={session.id}
                  href={`/clash-gap-detection/session?analysis=${session.id}`}
                  className="group block rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-base font-semibold text-[#0f172a] group-hover:text-violet-700">
                        {session.project_name?.trim() || 'Untitled project'}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748b]">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" aria-hidden />
                          Saved {formatSavedDate(session.saved_at)}
                        </span>
                        <span>{total} issue{total === 1 ? '' : 's'}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
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
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
