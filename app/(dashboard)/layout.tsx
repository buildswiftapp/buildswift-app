'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppProvider } from '@/lib/app-context'
import { AppSidebarWithProjects } from '@/app/components/app-sidebar-with-projects'
import { AppHeader } from '@/components/app-header'
import { Toaster } from '@/components/ui/sonner'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [ready, setReady] = useState(false)

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

  if (!ready) {
    return null
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebarWithProjects />
        <main className="flex-1 overflow-auto bg-[#f8f9fb]">
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
