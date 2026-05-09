'use client'

import { UserNav } from '@/components/user-nav'

export function AppHeader() {
  return (
    <header className="flex h-[74px] shrink-0 items-center justify-end border-b border-border bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="flex w-full items-center justify-end gap-4">
        <UserNav />
      </div>
    </header>
  )
}
