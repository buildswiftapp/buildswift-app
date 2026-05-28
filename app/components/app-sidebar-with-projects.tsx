'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  Building2,
  CreditCard,
  FileQuestion,
  FileStack,
  FolderKanban,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ScanSearch,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/lib/app-context'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

// Custom Lucide-style icon: a file outline with a dollar sign inside.
// Lucide v0.564 doesn't ship a `file-dollar-sign` icon, so this is hand-crafted
// to match the surrounding Lucide icons exactly:
//   - 24x24 viewBox
//   - currentColor stroke, fill=none
//   - rounded line caps/joins
//   - File outline & corner fold paths borrowed verbatim from `file-text`
//   - Dollar S-curve & vertical bar borrowed from `receipt`, scaled 0.5x and
//     translated so they sit cleanly below the corner fold and stay centered
//     in the page body — designed to read crisply at h-5 (20px).
function FileDollarSign({
  className,
  strokeWidth = 2,
}: {
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="M14 13h-3a1 1 0 1 0 0 2h2a1 1 0 1 1 0 2h-3" />
      <path d="M12 11.5v7" />
    </svg>
  )
}

const SIDEBAR_BG = '#0b1437'
const SIDEBAR_ACTIVE_GRADIENT =
  'linear-gradient(90deg, #5b3fd6 0%, #7c5cff 55%, #8b6dff 100%)'

const iconProps = {
  className: 'h-5 w-5 shrink-0 text-white',
  strokeWidth: 1.6,
} as const

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Projects', href: '/projects', icon: FolderKanban },
  { name: 'RFIs', href: '/documents', query: 'type=rfi', icon: FileQuestion },
  { name: 'Submittals', href: '/documents', query: 'type=submittal', icon: FileStack },
  { name: 'Change Orders', href: '/documents', query: 'type=change_order', icon: FileDollarSign },
  { name: 'Clash/Gap Detection Tool', href: '/clash-gap-detection', icon: ScanSearch },
]

const bottomNavigation = [
  { name: 'Account Settings', href: '/settings', icon: Settings },
  { name: 'Billing', href: '/billing', icon: CreditCard },
  { name: 'Help', href: '/help', icon: HelpCircle },
]

type AppSidebarWithProjectsProps = {
  collapsed: boolean
  onToggleSidebar: () => void
}

export function AppSidebarWithProjects({ collapsed, onToggleSidebar }: AppSidebarWithProjectsProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { logout } = useApp()

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient()
    if (supabase) {
      await supabase.auth.signOut()
    }
    logout()
    window.location.href = '/login'
  }

  const isActive = (item: (typeof navigation)[0]) => {
    if (item.query) {
      const [key, value] = item.query.split('=')
      return pathname === item.href && searchParams.get(key) === value
    }
    return pathname === item.href || pathname.startsWith(item.href + '/')
  }

  const row = (narrow: boolean, extra?: string) =>
    cn(
      'flex items-center gap-3 rounded-full py-3.5 text-sm font-medium text-white transition-colors duration-200',
      narrow ? 'justify-center px-2' : 'px-3',
      extra
    )

  return (
    <aside
      style={{ backgroundColor: SIDEBAR_BG }}
      className={cn(
        'flex h-full min-h-0 shrink-0 flex-col text-white transition-[width] duration-300 ease-out',
        collapsed ? 'w-[4.25rem]' : 'w-[15.5rem]'
      )}
    >
      {collapsed ? (
        <div className="flex shrink-0 flex-col items-center gap-2 px-2 py-4">
          <Link
            href="/dashboard"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/[0.06]"
            aria-label="BuildSwift home"
          >
            <Building2 className="h-6 w-6 shrink-0" strokeWidth={1.7} aria-hidden />
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-3 px-5 pb-5 pt-6">
          <Link
            href="/dashboard"
            className="flex min-w-0 flex-1 items-center gap-4 truncate py-0.5"
            aria-label="BuildSwift home"
          >
            <Building2 className="h-7 w-7 shrink-0 text-white" strokeWidth={1.7} aria-hidden />
            <span className="truncate text-[22px] font-bold leading-tight tracking-tight">
              <span className="text-[#4f6cff]">Build</span>
              <span className="text-[#f97316]">Swift</span>
            </span>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="h-9 w-9 shrink-0 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
          </Button>
        </div>
      )}

      <nav className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-4 pt-1">
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
                active
                  ? 'text-white shadow-[0_8px_24px_-12px_rgba(124,92,255,0.7)]'
                  : 'hover:bg-white/[0.06]'
              )}
              style={active ? { backgroundImage: SIDEBAR_ACTIVE_GRADIENT } : undefined}
            >
              <Icon {...iconProps} />
              {!collapsed && <span className="truncate">{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/[0.08] px-3 pb-5 pt-4">
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
                  active ? 'bg-white/[0.08] text-white' : 'hover:bg-white/[0.06]'
                )}
              >
                <Icon {...iconProps} />
                {!collapsed && <span className="truncate">{item.name}</span>}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => void handleLogout()}
            title={collapsed ? 'Log out' : undefined}
            className={cn(
              row(collapsed, 'py-2.5 w-full'),
              'text-white/80 hover:bg-white/[0.06] hover:text-white'
            )}
          >
            <LogOut {...iconProps} />
            {!collapsed && <span className="truncate">Log out</span>}
          </button>
        </div>
      </div>
    </aside>
  )
}
