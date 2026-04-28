'use client'

import Link from 'next/link'
import { Building2, ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type AppHeaderProps = {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

export function AppHeader({ sidebarCollapsed, onToggleSidebar }: AppHeaderProps) {
  const { user, logout } = useApp()
  const supabase = createSupabaseBrowserClient()

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
  }

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    logout()
    window.location.href = '/login'
  }

  return (
    <header className="h-[74px] border-b border-border bg-white/95 px-3 backdrop-blur">
      <div className="flex h-full w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="flex items-center gap-2 py-1" aria-label="BuildSwift home">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef2f7] text-[#334155]">
              <Building2 className="h-5 w-5" strokeWidth={1.9} aria-hidden />
            </span>
            <span className="text-[28px] font-semibold tracking-tight">
              <span className="text-primary">Build</span>
              <span className="text-primary">Swift</span>
            </span>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="h-9 w-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4.5 w-4.5" strokeWidth={1.8} />
            ) : (
              <PanelLeftClose className="h-4.5 w-4.5" strokeWidth={1.8} />
            )}
          </Button>
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-auto rounded-xl gap-3 px-3 py-2 hover:bg-muted">
                  <Avatar className="h-10 w-10 bg-primary">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden text-left sm:block">
                    <p className="text-sm font-semibold text-foreground">{user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.role === 'admin' ? 'Project Manager' : user.role}
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-xl border-border">
                <DropdownMenuItem asChild>
                  <Link href="/settings">Account Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/billing">Billing</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  )
}
