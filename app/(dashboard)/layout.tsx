'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AppProvider } from '@/lib/app-context'
import { AppSidebarWithProjects } from '@/app/components/app-sidebar-with-projects'
import { AppHeader } from '@/components/app-header'
import { Toaster } from '@/components/ui/sonner'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [ready, setReady] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    const checkSession = async () => {
      if (!supabase) {
        setReady(true)
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        router.replace('/login')
        return
      }

      setReady(true)
    }

    void checkSession()
  }, [router, supabase])

  useEffect(() => {
    if (pathname === '/documents/new' || pathname?.startsWith('/documents/new')) {
      setSidebarCollapsed(true)
    }
  }, [pathname])

  if (!ready) {
    return null
  }

  return (
    <div className="app-shell flex h-screen flex-col">
      <AppHeader
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
      />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebarWithProjects collapsed={sidebarCollapsed} />
        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
      <Toaster position="top-right" />
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AppProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </AppProvider>
  )
}
