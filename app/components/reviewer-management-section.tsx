'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api'

const SUGGEST_DEBOUNCE_MS = 250

export type ReviewInviteSendPayload = {
  reviewers: string[]
  /** Review link lifetime (days). Default 7 in API if omitted. */
  expires_in_days: 3 | 7 | 14
  /** When true, only refresh expired tokens on the latest open review cycle. */
  resend: boolean
}

interface ReviewerManagementSectionProps {
  initialCcReviewers?: string[]
  onSend?: (payload: ReviewInviteSendPayload) => Promise<void> | void
  onReviewConfigChange?: (config: { reviewers: string[]; expires_in_days: 3 | 7 | 14 }) => void
  /** Parent supplies Card; omit outer border/padding shell */
  embedded?: boolean
  /** Create flow: ADD CC label styling, optional no send */
  layout?: 'default' | 'create'
  hideSendButton?: boolean
}

export function ReviewerManagementSection({
  initialCcReviewers = [],
  onSend,
  onReviewConfigChange,
  embedded = false,
  layout = 'default',
  hideSendButton = false,
}: ReviewerManagementSectionProps) {
  const [ccInput, setCcInput] = useState('')
  const [ccReviewers, setCcReviewers] = useState<string[]>(initialCcReviewers)
  const [expiresInDays, setExpiresInDays] = useState<3 | 7 | 14>(7)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const isCreate = layout === 'create'

  const addReviewer = useCallback(() => {
    const email = ccInput.trim().toLowerCase()
    if (!email) return
    if (!email.includes('@')) return
    if (ccReviewers.includes(email)) {
      setCcInput('')
      setSuggestions([])
      return
    }
    setCcReviewers((prev) => [...prev, email])
    setCcInput('')
    setSuggestions([])
  }, [ccInput, ccReviewers])

  const pickSuggestion = useCallback(
    (email: string) => {
      const lower = email.toLowerCase().trim()
      if (!lower.includes('@')) return
      if (ccReviewers.includes(lower)) {
        setCcInput('')
        setSuggestions([])
        return
      }
      setCcReviewers((prev) => [...prev, lower])
      setCcInput('')
      setSuggestions([])
    },
    [ccReviewers]
  )

  const removeReviewer = (email: string) => {
    setCcReviewers((prev) => prev.filter((item) => item !== email))
  }

  const handleSend = async () => {
    if (ccReviewers.length === 0) {
      toast.error('Add at least one reviewer before sending')
      return
    }

    try {
      if (onSend) {
        await onSend({
          reviewers: ccReviewers,
          expires_in_days: expiresInDays,
          resend: false,
        })
      } else {
        toast.success('Reviewer list sent')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send reviewers')
    }
  }

  useEffect(() => {
    onReviewConfigChange?.({
      reviewers: ccReviewers,
      expires_in_days: expiresInDays,
    })
  }, [ccReviewers, expiresInDays, onReviewConfigChange])

  useEffect(() => {
    const q = ccInput.trim()
    if (q.length < 1) {
      setSuggestions([])
      setSuggestionsLoading(false)
      return
    }

    const ac = new AbortController()
    const t = window.setTimeout(() => {
      void (async () => {
        setSuggestionsLoading(true)
        try {
          const res = await apiFetch<{ emails: string[] }>(
            '/api/reviewers/suggestions?q=' + encodeURIComponent(q),
            { signal: ac.signal }
          )
          const filtered = (res.emails ?? []).filter((e) => !ccReviewers.includes(e.toLowerCase()))
          if (!ac.signal.aborted) setSuggestions(filtered)
        } catch {
          if (ac.signal.aborted) return
          setSuggestions([])
        } finally {
          setSuggestionsLoading(false)
        }
      })()
    }, SUGGEST_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(t)
      ac.abort()
    }
  }, [ccInput, ccReviewers])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setSuggestions([])
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const inner = (
    <>
      <h3
        className={cn(
          'font-semibold tracking-tight text-[#0f172a]',
          isCreate ? 'mb-5 text-lg' : 'mb-6 text-2xl'
        )}
      >
        Reviewer Management
      </h3>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
          {isCreate ? 'Add CC Reviewers' : 'Add Reviewers'}
        </p>
        <div ref={containerRef} className="relative">
          <div className="flex gap-2">
            <Input
              value={ccInput}
              onChange={(e) => setCcInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addReviewer()
                }
                if (e.key === 'Escape') {
                  setSuggestions([])
                }
              }}
              placeholder="email@architecture.com"
              className="min-h-12 flex-1"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={suggestions.length > 0 || suggestionsLoading}
              aria-controls="reviewer-suggestions-list"
            />
            <button
              type="button"
              onClick={addReviewer}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[6px] bg-[#0f172a] text-white transition-colors hover:bg-[#1e293b]"
              aria-label="Add reviewer"
            >
              <UserPlus className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>

          {(suggestions.length > 0 || suggestionsLoading) && ccInput.trim().length > 0 ? (
            <ul
              id="reviewer-suggestions-list"
              role="listbox"
              className="absolute z-50 mt-1 max-h-48 w-full min-w-[min(100%,18rem)] overflow-auto rounded-lg border border-[#e2e8f0] bg-white py-1 shadow-lg"
            >
              {suggestionsLoading && suggestions.length === 0 ? (
                <li className="px-3 py-2 text-sm text-[#64748b]">Searching…</li>
              ) : null}
              {suggestions.map((email) => (
                <li key={email} role="option">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm text-[#0f172a] hover:bg-[#f1f5f9]"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickSuggestion(email)}
                  >
                    {email}
                  </button>
                </li>
              ))}
              {suggestionsLoading && suggestions.length > 0 ? (
                <li className="border-t border-[#e2e8f0] px-3 py-1.5 text-xs text-[#94a3b8]">Updating…</li>
              ) : null}
            </ul>
          ) : null}
        </div>

        {ccReviewers.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {ccReviewers.map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-2 rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1.5 text-sm text-[#334155]"
              >
                {email}
                <button
                  type="button"
                  onClick={() => removeReviewer(email)}
                  className="rounded-full text-[#64748b] transition-colors hover:text-[#0f172a]"
                  aria-label={`Remove ${email}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {!hideSendButton && onSend ? (
          <div className="mt-5 space-y-3">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                Link expires in
              </p>
              <div className="flex flex-wrap gap-2">
                {([3, 7, 14] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setExpiresInDays(d)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                      expiresInDays === d
                        ? 'border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]'
                        : 'border-[#e2e8f0] bg-white text-[#475569] hover:bg-[#f8fafc]'
                    )}
                  >
                    {d} days
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {!hideSendButton && onSend ? (
          <div className="mt-4 w-full">
            <Button
              type="button"
              onClick={() => void handleSend()}
              disabled={ccReviewers.length === 0}
              className="h-12 w-full bg-[#2563eb] hover:bg-[#1d4ed8]"
            >
              <Send className="mr-2 h-4 w-4" />
              Send
            </Button>
          </div>
        ) : null}
      </div>
    </>
  )

  if (embedded) {
    return <div className="space-y-0">{inner}</div>
  }

  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">{inner}</div>
  )
}
