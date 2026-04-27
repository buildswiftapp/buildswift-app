'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  FolderKanban,
  FileQuestion,
  FileStack,
  FilePen,
  Settings,
  CreditCard,
  HelpCircle,
  ChevronLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const SIDEBAR_BG = '#f5f6fb'
const SIDEBAR_ACTIVE = '#3f63f3'

const iconProps = {
  className: 'h-5 w-5 shrink-0 text-[#6b7280]',
  strokeWidth: 1.5,
} as const

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Projects', href: '/projects', icon: FolderKanban },
  { name: 'RFIs', href: '/documents', query: 'type=rfi', icon: FileQuestion },
  { name: 'Submittals', href: '/documents', query: 'type=submittal', icon: FileStack },
  { name: 'Change Orders', href: '/documents', query: 'type=change_order', icon: FilePen },
]

const bottomNavigation = [
  { name: 'Account Settings', href: '/settings', icon: Settings },
  { name: 'Billing', href: '/billing', icon: CreditCard },
  { name: 'Help', href: '/help', icon: HelpCircle },
]

export function AppSidebarWithProjects() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (pathname === '/documents/new' || pathname?.startsWith('/documents/new')) {
      setCollapsed(true)
    }
  }, [pathname])

  const isActive = (item: (typeof navigation)[0]) => {
    if (item.query) {
      const [key, value] = item.query.split('=')
      return pathname === item.href && searchParams.get(key) === value
    }
    return pathname === item.href || pathname.startsWith(item.href + '/')
  }

  const row = (narrow: boolean, extra?: string) =>
    cn(
      'flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium text-[#3a4255] transition-colors duration-200',
      narrow ? 'justify-center px-2' : 'px-3',
      extra
    )

  return (
    <aside
      style={{ backgroundColor: SIDEBAR_BG }}
      className={cn(
        'relative flex h-screen flex-col border-r border-sidebar-border text-sidebar-foreground transition-[width] duration-300 ease-out',
        collapsed ? 'w-[4.25rem]' : 'w-[15.5rem]'
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute top-1/2 -right-3 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-[#6b7280] shadow-sm transition-all hover:bg-muted hover:border-border hover:text-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <ChevronLeft
          className={cn('h-4 w-4 transition-transform duration-200', collapsed && 'rotate-180')}
          strokeWidth={1.8}
        />
      </button>

      <nav className="flex min-h-0 flex-col gap-1.5 overflow-y-auto px-2.5 pb-4 pt-5">
        {navigation.map((item) => {
          const active = isActive(item)
          const href = item.query ? `${item.href}?${item.query}` : item.href
          const Icon = item.icon

          return (
            <div key={item.name}>
              <div
                className={cn(
                  row(collapsed),
                  active ? 'shadow-sm text-white' : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
                style={active ? { backgroundColor: SIDEBAR_ACTIVE } : undefined}
              >
                <Link
                  href={href}
                  title={collapsed ? item.name : undefined}
                  className={cn(
                    'flex min-w-0 items-center',
                    collapsed ? 'justify-center' : 'flex-1 gap-3'
                  )}
                >
                  <Icon {...iconProps} className={cn(iconProps.className, active && 'text-white')} />
                  {!collapsed && <span className="truncate">{item.name}</span>}
                </Link>
              </div>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border px-2.5 pb-5 pt-4">
        <div className="flex flex-col gap-1">
          {bottomNavigation.map((item) => {
            const active = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                title={collapsed ? item.name : undefined}
                className={cn(
                  row(collapsed, 'py-2.5'),
                  active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <Icon {...iconProps} className={cn(iconProps.className, active && 'text-[#2d3b66]')} />
                {!collapsed && <span className="truncate">{item.name}</span>}
              </Link>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
