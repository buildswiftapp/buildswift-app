'use client'

import { CircleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface MissingScopeCalloutProps {
  className?: string
  onCheck?: () => void
}

export function MissingScopeCallout({ className, onCheck }: MissingScopeCalloutProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="flex items-center gap-3 text-slate-700">
        <CircleAlert className="h-5 w-5 text-[#0f3b8f]" />
        <p className="text-base">Unsure if this request is already covered in project specs?</p>
      </div>
      <button
        type="button"
        className="inline-flex h-10 items-center justify-center rounded-md bg-slate-100 px-5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-200"
        onClick={() => {
          if (onCheck) {
            onCheck()
            return
          }
          toast.message('Missing Scope', {
            description: 'Missing Scope check will be connected here.',
          })
        }}
      >
        Check Missing Scope
      </button>
    </div>
  )
}
