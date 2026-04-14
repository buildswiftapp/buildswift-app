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
  Settings,
  CreditCard,
  HelpCircle,
  ChevronLeft,
  ChevronDown,
} from 'lucide-react'
import { useApp } from '@/lib/app-context'
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
  const [projectsExpanded, setProjectsExpanded] = useState(true)
  const { projects } = useApp()

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
        'relative flex h-screen flex-col text-white transition-[width] duration-300 ease-out',
        collapsed ? 'w-[4.25rem]' : 'w-[15.5rem]'
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute top-1/2 -right-3 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-[#0b1d42] text-white shadow-md transition-all hover:bg-[#17408f] hover:border-white/45 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <ChevronLeft
          className={cn('h-4 w-4 transition-transform duration-200', collapsed && 'rotate-180')}
          strokeWidth={1.8}
        />
      </button>

      <nav className="flex min-h-0 flex-col gap-1 overflow-y-auto px-2.5 pb-4 pt-5">
        {navigation.map((item) => {
          const active = isActive(item)
          const href = item.query ? `${item.href}?${item.query}` : item.href
          const Icon = item.icon
          const isProjectsItem = item.name === 'Projects'
          const showProjects = projectsExpanded

          return (
            <div key={item.name}>
              <div
                className={cn(
                  row(collapsed),
                  active ? 'shadow-sm' : 'hover:bg-white/[0.06]'
                )}
                style={active ? { backgroundColor: SIDEBAR_ACTIVE, color: '#ffffff' } : undefined}
              >
                <Link
                  href={href}
                  title={collapsed ? item.name : undefined}
                  className={cn('flex min-w-0 flex-1 items-center gap-3')}
                >
                  <Icon {...iconProps} />
                  {!collapsed && <span className="truncate">{item.name}</span>}
                </Link>

                {!collapsed && isProjectsItem && projects.length > 0 && (
                  <button
                    type="button"
                    className="rounded p-1 text-white/80 hover:bg-white/[0.08] hover:text-white"
                    onClick={() => setProjectsExpanded((prev) => !prev)}
                    aria-label={projectsExpanded ? 'Collapse projects' : 'Expand projects'}
                    title={projectsExpanded ? 'Collapse projects' : 'Expand projects'}
                  >
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform duration-200',
                        !projectsExpanded && '-rotate-90'
                      )}
                      strokeWidth={1.8}
                    />
                  </button>
                )}
              </div>

              {!collapsed && isProjectsItem && projects.length > 0 && showProjects && (
                <div className="relative mt-1 pl-8 pr-2 pb-1">
                  <div
                    className="absolute bottom-1 top-1 w-px bg-white/35"
                    style={{ left: '21px' }}
                  />
                  <div className="space-y-1.5">
                    {projects.slice(0, 6).map((project) => {
                      const projectHref = `/projects/${project.id}`
                      const projectActive =
                        pathname === projectHref || pathname.startsWith(`${projectHref}/`)

                      return (
                        <Link
                          key={project.id}
                          href={projectHref}
                          title={project.name}
                          className={cn(
                            'block truncate rounded-md px-3 py-2 text-sm leading-5 transition-colors',
                            projectActive
                              ? 'bg-white/20 text-white'
                              : 'text-white/80 hover:bg-white/[0.08] hover:text-white'
                          )}
                        >
                          {project.name}
                        </Link>
                      )
                    })}

                    {projects.length > 6 && (
                      <Link
                        href="/projects"
                        className="block px-3 py-2 text-xs text-white/65 hover:text-white"
                      >
                        View all projects
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="border-t border-white/[0.12] px-2.5 pb-5 pt-4">
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
        </div>
      </div>
    </aside>
  )
}
