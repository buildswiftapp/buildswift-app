'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
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

export function AppHeader() {
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
    <header className="flex h-[74px] shrink-0 items-center justify-end border-b border-border bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="flex w-full items-center justify-end gap-4">
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
    </header>
  )
}
