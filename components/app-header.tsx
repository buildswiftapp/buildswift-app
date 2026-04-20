'use client'

import Link from 'next/link'
import Image from 'next/image'
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
    <header className="flex h-16 items-center justify-between border-b border-border bg-white px-6">
      <Link href="/dashboard" className="flex items-center gap-2 py-1" aria-label="BuildSwift home">
        <Image
          src="/logo.png"
          alt=""
          width={220}
          height={52}
          className="h-9 w-auto max-h-9 max-w-[120px] shrink-0 object-contain object-left sm:max-w-[140px]"
          priority
          aria-hidden
        />
        <span className="text-xl font-bold">
          <span className="text-primary">Build</span>
          <span className="text-primary">Swift</span>
        </span>
      </Link>

      <div className="flex items-center gap-4">
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-auto gap-3 px-3 py-2">
                <Avatar className="h-9 w-9 bg-primary">
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden text-left sm:block">
                  <p className="text-sm font-medium text-foreground">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.role === 'admin' ? 'Project Manager' : user.role}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
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
