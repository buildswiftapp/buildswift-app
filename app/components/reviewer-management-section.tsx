'use client'

import { useState } from 'react'
import { Send, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ReviewerManagementSectionProps {
  initialCcReviewers?: string[]
  onSend?: (reviewers: string[]) => Promise<void> | void
  /** Parent supplies Card; omit outer border/padding shell */
  embedded?: boolean
  /** Create flow: ADD CC label styling, optional no send */
  layout?: 'default' | 'create'
  hideSendButton?: boolean
}

export function ReviewerManagementSection({
  initialCcReviewers = ['m.sullivan@build.com', 'lisa.chen@eng.org'],
  onSend,
  embedded = false,
  layout = 'default',
  hideSendButton = false,
}: ReviewerManagementSectionProps) {
  const [ccInput, setCcInput] = useState('')
  const [ccReviewers, setCcReviewers] = useState<string[]>(initialCcReviewers)
  const isCreate = layout === 'create'

  const addReviewer = () => {
    const email = ccInput.trim().toLowerCase()
    if (!email) return
    if (!email.includes('@')) return
    if (ccReviewers.includes(email)) {
      setCcInput('')
      return
    }
    setCcReviewers((prev) => [...prev, email])
    setCcInput('')
  }

  const removeReviewer = (email: string) => {
    setCcReviewers((prev) => prev.filter((item) => item !== email))
  }

  const handleSend = async () => {
    try {
      if (onSend) {
        await onSend(ccReviewers)
      }
      toast.success('Reviewer list sent')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send reviewers')
    }
  }

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
        <div className="flex gap-2">
          <Input
            value={ccInput}
            onChange={(e) => setCcInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addReviewer()
              }
            }}
            placeholder="email@architecture.com"
            className="min-h-12 flex-1"
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
          <div className="mt-4 w-full">
            <Button
              type="button"
              onClick={() => void handleSend()}
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
