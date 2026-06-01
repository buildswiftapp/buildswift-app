'use client'

import { Loader2 } from 'lucide-react'

export function SessionLoadingOverlay({ open, label = 'Loading session…' }: { open: boolean; label?: string }) {
  if (!open) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-white/70 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#e2e8f0] bg-white px-8 py-7 shadow-lg">
        <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
        <p className="text-sm font-medium text-[#334155]">{label}</p>
      </div>
    </div>
  )
}
