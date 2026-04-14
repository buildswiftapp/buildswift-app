'use client'

import { useState } from 'react'
import { Send, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface ReviewerManagementSectionProps {
  initialCcReviewers?: string[]
}

export function ReviewerManagementSection({
  initialCcReviewers = ['m.sullivan@build.com', 'lisa.chen@eng.org'],
}: ReviewerManagementSectionProps) {
  const [ccInput, setCcInput] = useState('')
  const [ccReviewers, setCcReviewers] = useState<string[]>(initialCcReviewers)

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

  const handleSend = () => {
    toast.success('Reviewer list sent')
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-6 text-2xl font-semibold tracking-tight text-slate-900">
        Reviewer Management
      </h3>

      <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Add Reviewers
          </p>
          <div className="flex gap-2">
            <input
              value={ccInput}
              onChange={(e) => setCcInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addReviewer()
                }
              }}
              placeholder="email@architecture.com"
              className="h-12 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-base outline-none ring-0 placeholder:text-slate-400 focus:border-primary"
            />
            <button
              type="button"
              onClick={addReviewer}
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#2563eb] text-white transition-colors hover:bg-[#1d4ed8]"
              aria-label="Add reviewer"
            >
              <UserPlus className="h-5 w-5" />
            </button>
          </div>

          {ccReviewers.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {ccReviewers.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-900"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => removeReviewer(email)}
                    className="rounded-full text-slate-500 transition-colors hover:text-slate-700"
                    aria-label={`Remove ${email}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 w-full">
            <Button
              type="button"
              onClick={handleSend}
              className="h-12 w-full bg-[#2563eb] hover:bg-[#1d4ed8]"
            >
              <Send className="mr-2 h-4 w-4" />
              Send
            </Button>
          </div>
      </div>
    </div>
  )
}
