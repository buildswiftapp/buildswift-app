'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  FolderKanban,
  FileQuestion,
  FileStack,
  FilePen,
  ClipboardList,
  Users,
  Settings,
  HelpCircle,
  ChevronLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const SIDEBAR_BG = '#0b1d42'
const SIDEBAR_ACTIVE = '#1d56d8'

const iconProps = {
  className: 'h-5 w-5 shrink-0 text-white',
  strokeWidth: 1.5,
} as const

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Projects', href: '/projects', icon: FolderKanban },
  { name: 'RFIs', href: '/documents', query: 'type=rfi', icon: FileQuestion },
  { name: 'Submittals', href: '/documents', query: 'type=submittal', icon: FileStack },
  { name: 'Change Orders', href: '/documents', query: 'type=change_order', icon: FilePen },
  { name: 'Reports', href: '/reports', icon: ClipboardList },
  { name: 'Contacts', href: '/team', icon: Users },
]

const bottomNavigation = [
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Help', href: '/help', icon: HelpCircle },
]

export function AppSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [collapsed, setCollapsed] = useState(false)

  const isActive = (item: (typeof navigation)[0]) => {
    if (item.query) {
      const [key, value] = item.query.split('=')
      return pathname === item.href && searchParams.get(key) === value
    }
    return pathname === item.href || pathname.startsWith(item.href + '/')
  }

  const row = (narrow: boolean, extra?: string) =>
    cn(
      'flex items-center gap-3 rounded-2xl py-3 text-sm font-medium text-white transition-colors duration-200',
      narrow ? 'justify-center px-2' : 'px-3',
      extra
    )

  return (
    <aside
      style={{ backgroundColor: SIDEBAR_BG }}
      className={cn(
        'flex h-screen flex-col text-white transition-[width] duration-300 ease-out',
        collapsed ? 'w-[4.25rem]' : 'w-[15.5rem]'
      )}
    >
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2.5 pb-4 pt-5">
        {navigation.map((item) => {
          const active = isActive(item)
          const href = item.query ? `${item.href}?${item.query}` : item.href
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={href}
              title={collapsed ? item.name : undefined}
              className={cn(
                row(collapsed),
                active ? 'shadow-sm' : 'hover:bg-white/[0.06]'
              )}
              style={
                active
                  ? { backgroundColor: SIDEBAR_ACTIVE, color: '#ffffff' }
                  : undefined
              }
            >
              <Icon {...iconProps} />
              {!collapsed && <span className="truncate">{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-white/[0.12] px-2.5 pb-5 pt-4">
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
                  active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.06]'
                )}
              >
                <Icon {...iconProps} />
                {!collapsed && <span className="truncate">{item.name}</span>}
              </Link>
            )
          })}

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand' : 'Collapse'}
            className={cn(row(collapsed, 'w-full py-2.5 text-left hover:bg-white/[0.06]'))}
          >
            <ChevronLeft
              className={cn(
                'h-5 w-5 shrink-0 text-white transition-transform duration-200',
                collapsed && 'rotate-180'
              )}
              strokeWidth={1.5}
            />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </div>
    </aside>
  )
}
