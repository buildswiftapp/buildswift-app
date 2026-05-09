'use client'

import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

type NotificationBellProps = {
  count?: number
  className?: string
  onClick?: () => void
}

export function NotificationBell({ count = 0, className, onClick }: NotificationBellProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
      className={cn(
        'relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-50 hover:text-slate-900',
        className
      )}
    >
      <Bell className="h-5 w-5" strokeWidth={1.8} aria-hidden />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )
}
