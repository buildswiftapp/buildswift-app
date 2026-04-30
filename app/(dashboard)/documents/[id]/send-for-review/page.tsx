'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Mail, Send } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type DocType = 'rfi' | 'submittal' | 'change_order'

function formCardClassName(extra?: string) {
  return cn(
    'rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:p-6 lg:p-7 xl:p-8',
    extra
  )
}

const PAGE_BG = '#f1f5f9'
const capLabel = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]'

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

function splitEmailTokens(raw: string): string[] {
  return raw
    .split(/[,\n;]/g)
    .map((t) => normalizeEmail(t))
    .filter(Boolean)
}

function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
}

export default function SendForReviewPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [doc, setDoc] = useState<{ id: string; title: string; doc_type: DocType; project_id: string | null } | null>(null)
  const [projectName, setProjectName] = useState<string>('—')

  const [emailInput, setEmailInput] = useState('')
  const [reviewers, setReviewers] = useState<string[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [expiresInDays, setExpiresInDays] = useState<3 | 7 | 14>(7)
  const [recentInvites, setRecentInvites] = useState<Array<{ reviewer_email: string; decision: string | null }>>([])
  const [recentInvitesLoading, setRecentInvitesLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    let active = true
    const load = async () => {
      try {
        const res = await apiFetch<{ document: any }>(`/api/documents/${id}`)
        if (!active) return
        const d = res.document
        setDoc({
          id: d.id,
          title: d.title || '—',
          doc_type: d.doc_type,
          project_id: d.project_id ?? null,
        })

        if (d.project_id) {
          const p = await apiFetch<{ projects: Array<{ id: string; name: string }> }>('/api/projects')
          if (!active) return
          setProjectName(p.projects.find((x) => x.id === d.project_id)?.name ?? '—')
        } else {
          setProjectName('—')
        }

        setRecentInvitesLoading(true)
        const invites = await apiFetch<{ invitations: Array<{ reviewer_email: string; decision: string | null }> }>(
          `/api/documents/${id}/review-requests`
        )
        if (!active) return
        setRecentInvites(invites.invitations ?? [])
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load document')
      } finally {
        if (active) {
          setIsLoading(false)
          setRecentInvitesLoading(false)
        }
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [id])

  const docTypeLabel = useMemo(() => {
    const t = doc?.doc_type
    if (t === 'rfi') return 'RFI'
    if (t === 'submittal') return 'Submittal'
    if (t === 'change_order') return 'Change Order'
    return 'Document'
  }, [doc?.doc_type])

  const addEmails = (raw: string) => {
    const tokens = splitEmailTokens(raw)
    if (!tokens.length) return
    const invalid = tokens.filter((e) => !isValidEmail(e))
    if (invalid.length) {
      toast.error(`Invalid email${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}`)
      return
    }
    setReviewers((prev) => {
      const seen = new Set(prev)
      const next = [...prev]
      for (const e of tokens) {
        if (!seen.has(e)) {
          seen.add(e)
          next.push(e)
        }
      }
      return next
    })
    setEmailInput('')
  }

  const removeEmail = (email: string) => {
    setReviewers((prev) => prev.filter((e) => e !== email))
  }

  useEffect(() => {
    if (!suggestionsOpen) return
    const q = emailInput.trim()
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        setSuggestionsLoading(true)
        const res = await apiFetch<{ emails: string[] }>(`/api/reviewers/suggestions?q=${encodeURIComponent(q)}`)
        if (!cancelled) setSuggestions(res.emails ?? [])
      } catch {
        if (!cancelled) setSuggestions([])
      } finally {
        if (!cancelled) setSuggestionsLoading(false)
      }
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [emailInput, suggestionsOpen])

  const handleSend = async () => {
    const pendingTokens = splitEmailTokens(emailInput)
    const merged = [...reviewers, ...pendingTokens]
      .map((e) => normalizeEmail(e))
      .filter(Boolean)
    const uniq = Array.from(new Set(merged))

    if (uniq.length === 0) return toast.error('Add at least one reviewer email')
    const invalid = uniq.filter((e) => !isValidEmail(e))
    if (invalid.length) return toast.error(`Invalid email${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}`)

    setIsSending(true)
    try {
      await apiFetch(`/api/documents/${id}/send-for-review`, {
        method: 'POST',
        json: {
          reviewers: uniq,
          expires_in_days: expiresInDays,
          resend: false,
        },
      })
      toast.success('Review invitation sent')
      router.push(`/documents/${id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invitation')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div
      className="min-h-full w-full px-3 py-6 sm:px-4 sm:py-7 lg:px-6 lg:py-8 xl:px-8 2xl:px-10"
      style={{ backgroundColor: PAGE_BG }}
    >
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 flex items-start gap-4 sm:mb-8">
          <Button variant="ghost" size="icon" asChild className="mt-1">
            <Link href={`/documents/${id}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-[#0f172a]">Send for Review</h1>
            <p className="mt-1 text-base text-[#64748b]">Invite an external reviewer to approve this document</p>
          </div>
        </div>

        <div className={formCardClassName('mb-6')}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#0f172a]">{doc?.title || '—'}</p>
              <p className="mt-1 text-xs text-[#64748b]">
                {docTypeLabel}
                {projectName && projectName !== '—' ? ` · ${projectName}` : ''}
              </p>
            </div>
            <div className="inline-flex items-center rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1.5 text-xs font-semibold text-[#334155]">
              Pending Review
            </div>
          </div>
        </div>

        <div className={formCardClassName()}>
          <div className="mb-5 flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-[#eff6ff] p-2 text-[#1d4ed8]">
              <Mail className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-[#0f172a]">Reviewer Details</h2>
              <p className="mt-1 text-sm text-[#64748b]">
                Enter the reviewer&apos;s information. They will receive an email with a secure link to review and sign the document.
              </p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={capLabel}>
                Email Address <span className="text-destructive">*</span>
              </label>
              <Popover open={suggestionsOpen} onOpenChange={setSuggestionsOpen}>
                <PopoverAnchor asChild>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      value={emailInput}
                      onChange={(e) => {
                        setEmailInput(e.target.value)
                        setSuggestionsOpen(true)
                      }}
                      onFocus={() => setSuggestionsOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addEmails(emailInput)
                          return
                        }
                        if (e.key === 'ArrowDown') setSuggestionsOpen(true)
                        if (e.key === 'Escape') setSuggestionsOpen(false)
                      }}
                      placeholder="reviewer@company.com"
                      inputMode="email"
                      autoComplete="email"
                      disabled={isSending || isLoading}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="sm:shrink-0"
                      onClick={() => addEmails(emailInput)}
                      disabled={isSending || isLoading}
                    >
                      Add
                    </Button>
                  </div>
                </PopoverAnchor>

                <PopoverContent
                  align="start"
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                  sideOffset={6}
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <Command>
                    <CommandList>
                      <CommandEmpty>
                        {suggestionsLoading ? 'Loading…' : 'No saved reviewers found.'}
                      </CommandEmpty>
                      <CommandGroup heading="Saved reviewers">
                        {(suggestions ?? [])
                          .filter((e) => !reviewers.includes(e))
                          .slice(0, 25)
                          .map((e) => (
                            <CommandItem
                              key={e}
                              value={e}
                              onSelect={() => {
                                addEmails(e)
                                setSuggestionsOpen(false)
                              }}
                            >
                              {e}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              <p className="mt-1.5 text-xs text-[#64748b]">
                Type to add or select from saved reviewers. Paste multiple emails separated by commas.
              </p>

              {reviewers.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {reviewers.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => removeEmail(e)}
                      disabled={isSending || isLoading}
                      className="inline-flex items-center gap-2 rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[#0f172a] hover:bg-[#eef2ff] disabled:opacity-50"
                      title="Remove"
                    >
                      {e}
                      <span className="text-[#64748b]">×</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="sm:col-span-2">
              <label className={capLabel}>Link expiration</label>
              <Select
                value={String(expiresInDays)}
                onValueChange={(v) => setExpiresInDays((Number(v) as 3 | 7 | 14) || 7)}
                disabled={isSending || isLoading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select expiration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 days</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-5">
            <p className="text-sm font-semibold text-[#0f172a]">What happens next:</p>
            <ul className="mt-3 space-y-2 text-sm text-[#334155]">
              {[
                'Reviewer receives an email with a secure review link',
                'They can view the document and add comments',
                'They approve or reject with a digital signature',
                "You'll be notified when they respond",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <span className="mt-[2px] inline-flex h-4 w-4 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-[10px] font-bold text-emerald-700">
                    ✓
                  </span>
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className={cn('mt-6', formCardClassName())}>
            <h3 className="text-base font-semibold text-[#0f172a]">Recent Invitations</h3>
            <p className="mt-1 text-sm text-[#64748b]">Reviewers who have been invited to this document</p>
            <div className="mt-5">
              {recentInvitesLoading ? (
                <p className="py-10 text-center text-sm text-[#64748b]">Loading…</p>
              ) : recentInvites.length === 0 ? (
                <p className="py-10 text-center text-sm text-[#64748b]">No invitations sent yet</p>
              ) : (
                <div className="space-y-2">
                  {recentInvites.map((r) => (
                    <div
                      key={r.reviewer_email}
                      className="flex items-center justify-between rounded-lg border border-[#e2e8f0] bg-white px-4 py-3"
                    >
                      <p className="text-sm font-semibold text-[#0f172a]">{r.reviewer_email}</p>
                      <span className="text-xs font-semibold text-[#64748b]">
                        {r.decision === 'approve'
                          ? 'Approved'
                          : r.decision === 'reject'
                            ? 'Rejected'
                            : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => router.push(`/documents/${id}`)} disabled={isSending}>
              Cancel
            </Button>
            <Button onClick={() => void handleSend()} disabled={isSending || isLoading}>
              <Send className="mr-2 h-4 w-4" />
              {isSending ? 'Sending...' : 'Send Invitation'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

