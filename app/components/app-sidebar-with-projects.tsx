'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard,
  FolderKanban,
  FileQuestion,
  FileStack,
  FilePen,
  Settings,
  CreditCard,
  HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const SIDEBAR_BG = '#001437'
const SIDEBAR_ACTIVE = '#3f63f3'

const iconProps = {
  className: 'h-5 w-5 shrink-0 text-white/80',
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

type AppSidebarWithProjectsProps = {
  collapsed: boolean
}

export function AppSidebarWithProjects({ collapsed }: AppSidebarWithProjectsProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const isActive = (item: (typeof navigation)[0]) => {
    if (item.query) {
      const [key, value] = item.query.split('=')
      return pathname === item.href && searchParams.get(key) === value
    }
    return pathname === item.href || pathname.startsWith(item.href + '/')
  }

  const row = (narrow: boolean, extra?: string) =>
    cn(
      'flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium text-white/90 transition-colors duration-200',
      narrow ? 'justify-center px-2' : 'px-3',
      extra
    )

  return (
    <aside
      style={{ backgroundColor: SIDEBAR_BG }}
      className={cn(
        'flex h-screen flex-col border-r border-white/10 text-white transition-[width] duration-300 ease-out',
        collapsed ? 'w-[4.25rem]' : 'w-[15.5rem]'
      )}
    >
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
                  active ? 'shadow-sm text-white' : 'hover:bg-white/10 hover:text-white'
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

      <div className="border-t border-white/10 px-2.5 pb-5 pt-4">
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
                  active ? 'bg-white/12 text-white' : 'hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon {...iconProps} className={cn(iconProps.className, active && 'text-white')} />
                {!collapsed && <span className="truncate">{item.name}</span>}
              </Link>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
