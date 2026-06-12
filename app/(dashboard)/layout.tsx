'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AppProvider } from '@/lib/app-context'
import { AppSidebarWithProjects } from '@/app/components/app-sidebar-with-projects'
import { Toaster } from '@/components/ui/sonner'

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
      <AppSidebarWithProjects
        collapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
      />
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
