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

/** Isometric-style mark to pair with BUILDSWIFT / CONSTRUCTION (see brand lockup). */
function BuildSwiftLogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 48" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      {/* Left block (narrow, angled) */}
      <path fill="#cbd5e1" d="M3 21 L11 18.5 L11 34.5 L3 34.5 Z" />
      {/* Center — tall front */}
      <path fill="#f1f5f9" d="M12 9 L23.5 6 L23.5 35 L12 35 Z" />
      {/* Center — side / depth */}
      <path fill="#94a3b8" d="M23.5 6 L31 8.5 L31 35 L23.5 35 Z" />
      {/* Right block (short) */}
      <path fill="#64748b" d="M27.5 22.5 L35.5 20.5 L35.5 35 L27.5 35 Z" />
      {/* Chevron ground / accent */}
      <path fill="#e2e8f0" d="M1 38 L22 31 L43 38 L22 45 Z" opacity={0.9} />
    </svg>
  )
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
      <div className="px-2.5 pb-2 pt-4">
        {!collapsed ? (
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-lg px-1 py-1 transition-opacity hover:opacity-95"
            aria-label="BUILDSWIFT CONSTRUCTION — Home"
          >
            <BuildSwiftLogoMark className="h-11 w-11 shrink-0" />
            <div className="min-w-0 select-none leading-[1.08]">
              <div className="font-sans text-[13px] font-bold uppercase tracking-tight text-white">
                BUILDSWIFT
              </div>
              <div className="mt-0.5 font-sans text-[8.5px] font-normal uppercase tracking-[0.26em] text-slate-400">
                CONSTRUCTION
              </div>
            </div>
          </Link>
        ) : (
          <Link
            href="/dashboard"
            title="BUILDSWIFT CONSTRUCTION"
            className="flex justify-center py-1"
            aria-label="BUILDSWIFT CONSTRUCTION — Home"
          >
            <BuildSwiftLogoMark className="h-9 w-9 shrink-0" />
          </Link>
        )}
      </div>

      <nav className="flex min-h-0 flex-col gap-1.5 overflow-y-auto px-2.5 pb-4 pt-2">
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
