'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AppProvider } from '@/lib/app-context'
import { AppSidebarWithProjects } from '@/app/components/app-sidebar-with-projects'
import { Toaster } from '@/components/ui/sonner'

const SIDEBAR_BG = '#0b1437'

function SidebarFallback({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      style={{ backgroundColor: SIDEBAR_BG }}
      className={collapsed ? 'w-[4.25rem] shrink-0' : 'w-[15.5rem] shrink-0'}
      aria-hidden
    />
  )
}

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    if (pathname === '/documents/new' || pathname?.startsWith('/documents/new')) {
      setSidebarCollapsed(true)
    }
  }, [pathname])

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Suspense fallback={<SidebarFallback collapsed={sidebarCollapsed} />}>
        <AppSidebarWithProjects
          collapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
        />
      </Suspense>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
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
