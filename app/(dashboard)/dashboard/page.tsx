'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  ArrowRight,
  ArrowUp,
  Building2,
  Check,
  Clock,
  FileCheck,
  FilePen,
  FileQuestion,
  FileStack,
  FileText,
  FolderKanban,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { useApp } from '@/lib/app-context'
import { apiFetch } from '@/lib/api'
import { UpgradeRequiredDialog } from '@/app/components/billing/upgrade-required-dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  backfillFromLegacy,
  statusBadge,
  statusBadgeClasses,
  type DocType,
} from '@/lib/status'
import { pickProjectImage } from './project-images'

type DashboardProject = {
  id: string
  name: string
  description?: string | null
  address?: string | null
  status: 'active' | 'completed' | 'on_hold' | string
  updated_at?: string | null
  created_at?: string | null
}

type DashboardDocument = {
  id: string
  project_id: string
  doc_type: 'rfi' | 'submittal' | 'change_order' | string
  title: string
  status: string
  internal_status: string
  external_status?: string
  updated_at: string
}

type BillingSummary = {
  tier: string
  ai_generations_used: number
  ai_generations_limit: number | null
  clash_gap_reports_used: number
  clash_gap_reports_limit: number | null
}

const TYPE_COLORS = {
  rfi: '#8b5cf6',
  submittal: '#3b82f6',
  change_order: '#f97316',
} as const

export default function DashboardPage() {
  const { user } = useApp()
  const [projects, setProjects] = useState<DashboardProject[]>([])
  const [documents, setDocuments] = useState<DashboardDocument[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [upgradeMessage, setUpgradeMessage] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        setLoadingData(true)
        const [projectsRes, documentsRes] = await Promise.all([
          apiFetch<{ projects: DashboardProject[] }>('/api/projects'),
          apiFetch<{ documents: DashboardDocument[] }>('/api/documents'),
        ])
        if (active) {
          setProjects(projectsRes.projects ?? [])
          setDocuments(documentsRes.documents ?? [])
        }

        try {
          const summary = await apiFetch<BillingSummary>('/api/billing/summary')
          if (active) setBillingSummary(summary)
        } catch (e) {
          const status = typeof (e as any)?.status === 'number' ? (e as any).status : null
          if (status === 403) {
            setUpgradeMessage(e instanceof Error ? e.message : 'Upgrade required to continue.')
            setUpgradeOpen(true)
          }
        }
      } catch {
        if (active) {
          setProjects([])
          setDocuments([])
          setBillingSummary(null)
        }
      } finally {
        if (active) setLoadingData(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const resolveStatus = (d: DashboardDocument): string => {
    if (typeof d.status === 'string' && d.status.length) return d.status
    const t = d.doc_type
    if (t !== 'rfi' && t !== 'submittal' && t !== 'change_order') return 'draft'
    return backfillFromLegacy(t as DocType, d.internal_status, d.external_status ?? null, null)
  }

  const uiDocuments = documents.map((d) => ({
    id: d.id,
    projectId: d.project_id,
    type: d.doc_type,
    title: d.title,
    status: resolveStatus(d),
    updatedAt: d.updated_at,
  }))

  const docsByProjectId = uiDocuments.reduce<Record<string, number>>((acc, d) => {
    acc[d.projectId] = (acc[d.projectId] ?? 0) + 1
    return acc
  }, {})

  const uiProjects = projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    status: p.status,
    documentsCount: docsByProjectId[p.id] ?? 0,
    updatedAt: p.updated_at ?? p.created_at ?? new Date().toISOString(),
  }))

  const activeProjects = uiProjects.filter((p) => p.status === 'active')
  const pendingDocuments = uiDocuments.filter((d) => {
    const s = d.status
    return s === 'pending' || s === 'pending_review' || s === 'under_review'
  })
  const draftDocuments = uiDocuments.filter((d) => d.status === 'draft')

  const documentsByType = {
    rfi: uiDocuments.filter((d) => d.type === 'rfi').length,
    submittal: uiDocuments.filter((d) => d.type === 'submittal').length,
    change_order: uiDocuments.filter((d) => d.type === 'change_order').length,
  }

  const totalDocs = uiDocuments.length

  const recentDocuments = [...uiDocuments]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5)

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

  const firstName = user?.name?.split(' ')[0] ?? 'there'

  return (
    <div className="relative">
      <UpgradeRequiredDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        message={upgradeMessage || 'Upgrade your plan to continue.'}
      />
      <BackgroundDecoration />

      <div className="relative app-page space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-[28px] font-semibold leading-tight tracking-tight text-[#111827]">
            <span>Welcome back, {firstName}</span>
            <span aria-hidden className="text-[26px]">👋</span>
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening with your projects today.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Active Projects"
            value={loadingData ? '—' : activeProjects.length}
            sub={loadingData ? 'Loading…' : `${uiProjects.length} total projects`}
            icon={<FolderKanban className="h-6 w-6" strokeWidth={1.8} />}
            tone="violet"
            trend={{ kind: 'delta', label: '20%', detail: 'vs last month' }}
          />
          <StatCard
            label="Total Documents"
            value={loadingData ? '—' : uiDocuments.length}
            sub="Across all projects"
            icon={<FileStack className="h-6 w-6" strokeWidth={1.8} />}
            tone="sky"
            trend={{ kind: 'delta', label: '15%', detail: 'vs last month' }}
          />
          <StatCard
            label="Pending Reviews"
            value={loadingData ? '—' : pendingDocuments.length}
            sub="Awaiting approval"
            icon={<Clock className="h-6 w-6" strokeWidth={1.8} />}
            tone="orange"
            trend={{ kind: 'check', label: 'On track' }}
          />
          <StatCard
            label="Drafts"
            value={loadingData ? '—' : draftDocuments.length}
            sub="In progress"
            icon={<FilePen className="h-6 w-6" strokeWidth={1.8} />}
            tone="emerald"
            trend={{ kind: 'check', label: 'On track' }}
          />
        </div>


        <div className="grid gap-6 lg:grid-cols-3">
          <section className="app-surface lg:col-span-2 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <SoftIconTile tone="violet">
                  <FileText className="h-5 w-5" strokeWidth={1.8} />
                </SoftIconTile>
                <div>
                  <h2 className="text-base font-semibold text-[#111827]">Recent Documents</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Latest activity across your projects
                  </p>
                </div>
              </div>
              <Link
                href="/documents"
                className="rounded-full border border-border bg-white px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-[#111827]"
              >
                View all
              </Link>
            </div>

            <div className="mt-5 space-y-2.5">
              {loadingData ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                  Loading recent documents…
                </div>
              ) : recentDocuments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No documents yet.
                </div>
              ) : (
                recentDocuments.map((doc) => {
                  const project = uiProjects.find((p) => p.id === doc.projectId)
                  const t = (doc.type === 'rfi' || doc.type === 'submittal' || doc.type === 'change_order'
                    ? doc.type
                    : 'rfi') as DocType
                  const badge = statusBadge(t, doc.status)
                  return (
                    <Link
                      key={doc.id}
                      href={`/documents/${doc.id}`}
                      className="group flex items-center gap-4 rounded-xl border border-transparent bg-slate-50/70 p-3.5 transition-colors hover:border-border hover:bg-white"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-500">
                        {getDocumentTypeIcon(doc.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#111827]">{doc.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {project?.name ?? 'Unassigned'} • {formatDate(doc.updatedAt)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-medium',
                          statusBadgeClasses(badge.tone)
                        )}
                      >
                        {badge.label}
                      </Badge>
                    </Link>
                  )
                })
              )}
            </div>
          </section>

          <section className="app-surface flex flex-col p-6">
            <h2 className="text-base font-semibold text-[#111827]">Documents by Type</h2>

            <div className="mt-2 flex flex-1 items-center gap-6">
              <DocumentTypeDonut
                rfi={documentsByType.rfi}
                submittal={documentsByType.submittal}
                changeOrder={documentsByType.change_order}
              />
              <div className="flex-1 space-y-5">
                <TypeLegendRow
                  color={TYPE_COLORS.rfi}
                  label="RFIs"
                  count={documentsByType.rfi}
                  total={totalDocs}
                />
                <TypeLegendRow
                  color={TYPE_COLORS.submittal}
                  label="Submittals"
                  count={documentsByType.submittal}
                  total={totalDocs}
                />
                <TypeLegendRow
                  color={TYPE_COLORS.change_order}
                  label="Change Orders"
                  count={documentsByType.change_order}
                  total={totalDocs}
                />
              </div>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">Breakdown of your documents</p>
          </section>
        </div>

        <section className="app-surface p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <SoftIconTile tone="violet">
                <Building2 className="h-5 w-5" strokeWidth={1.8} />
              </SoftIconTile>
              <div>
                <h2 className="text-base font-semibold text-[#111827]">Active Projects</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Your ongoing construction projects
                </p>
              </div>
            </div>
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-[#111827]"
            >
              View all projects
              <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
            </Link>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loadingData ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                Loading active projects…
              </div>
            ) : activeProjects.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No active projects yet.
              </div>
            ) : (
              activeProjects.slice(0, 3).map((project, idx) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="group flex gap-3.5 rounded-xl border border-border bg-white p-3 transition-shadow hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)]"
                >
                  <img
                    src={pickProjectImage(project.name, idx)}
                    alt=""
                    className="h-20 w-24 shrink-0 rounded-lg object-cover"
                    loading="lazy"
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <h3 className="truncate text-sm font-semibold text-[#111827]">
                      {project.name}
                    </h3>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {project.description}
                    </p>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" strokeWidth={1.8} />
                        {project.documentsCount} document
                        {project.documentsCount === 1 ? '' : 's'}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                        Active
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        {billingSummary && (
          <section className="app-surface p-6">
            <div className="flex items-start gap-3">
              <SoftIconTile tone="violet">
                <TrendingUp className="h-5 w-5" strokeWidth={1.8} />
              </SoftIconTile>
              <div>
                <h2 className="text-base font-semibold text-[#111827]">Usage Overview</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Your current plan: {capitalize(billingSummary.tier)}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-10 md:grid-cols-2">
              <UsageBar
                label="Clash/Gap Reports"
                icon={<FileText className="h-6 w-6" strokeWidth={1.8} />}
                used={billingSummary.clash_gap_reports_used}
                limit={billingSummary.clash_gap_reports_limit}
                unlimitedNote="Reports are available on this plan"
                limitedNote={(remaining) => `${remaining} reports remaining this month`}
              />
              <UsageBar
                label="AI Generations"
                icon={<Sparkles className="h-6 w-6" strokeWidth={1.8} />}
                used={billingSummary.ai_generations_used}
                limit={billingSummary.ai_generations_limit}
                unlimitedNote="High-volume AI generations on this plan"
                limitedNote={(remaining) => `${remaining} AI generations remaining`}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

type Tone = 'violet' | 'sky' | 'orange' | 'emerald'

const TONE_TILE: Record<Tone, string> = {
  violet: 'bg-violet-100 text-violet-600',
  sky: 'bg-sky-100 text-sky-600',
  orange: 'bg-orange-100 text-orange-600',
  emerald: 'bg-emerald-100 text-emerald-600',
}

function SoftIconTile({
  tone = 'violet',
  children,
  size = 'md',
}: {
  tone?: Tone
  children: React.ReactNode
  size?: 'md' | 'lg' | 'xl'
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-2xl',
        size === 'xl' ? 'h-[52px] w-[52px]' : size === 'lg' ? 'h-11 w-11' : 'h-10 w-10',
        TONE_TILE[tone]
      )}
    >
      {children}
    </span>
  )
}

type StatTrend =
  | { kind: 'delta'; label: string; detail: string }
  | { kind: 'check'; label: string }

function StatCard({
  label,
  value,
  sub,
  icon,
  tone,
  trend,
}: {
  label: string
  value: number | string
  sub: string
  icon: React.ReactNode
  tone: Tone
  trend: StatTrend
}) {
  return (
    <div className="app-surface flex items-center justify-between gap-4 p-5">
      <div className="flex min-w-0 items-center gap-4">
        <SoftIconTile tone={tone} size="xl">
          {icon}
        </SoftIconTile>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-tight text-[#111827]">{label}</p>
          <p className="mt-1 text-[32px] font-bold leading-none tracking-tight text-[#111827]">
            {value}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center self-center">
        {trend.kind === 'delta' ? (
          <span className="inline-flex flex-col items-center gap-0.5 text-center">
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-500">
              <ArrowUp className="h-4 w-4" strokeWidth={2.4} />
              {trend.label}
            </span>
            <span className="text-xs text-muted-foreground">{trend.detail}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-500">
            <Check className="h-4 w-4" strokeWidth={2.4} />
            {trend.label}
          </span>
        )}
      </div>
    </div>
  )
}

function DocumentTypeDonut({
  rfi,
  submittal,
  changeOrder,
}: {
  rfi: number
  submittal: number
  changeOrder: number
}) {
  const total = rfi + submittal + changeOrder
  const data =
    total === 0
      ? [{ name: 'empty', value: 1 }]
      : [
          { name: 'rfi', value: rfi, color: TYPE_COLORS.rfi },
          { name: 'submittal', value: submittal, color: TYPE_COLORS.submittal },
          { name: 'change_order', value: changeOrder, color: TYPE_COLORS.change_order },
        ].filter((d) => d.value > 0)

  return (
    <div className="relative h-[180px] w-[180px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={86}
            paddingAngle={total === 0 ? 0 : 3}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={
                  total === 0
                    ? '#e5e7eb'
                    : (entry as { color: string }).color
                }
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold leading-none text-[#111827]">{total}</span>
        <span className="mt-1.5 text-xs text-muted-foreground">Total</span>
      </div>
    </div>
  )
}

function TypeLegendRow({
  color,
  label,
  count,
  total,
}: {
  color: string
  label: string
  count: number
  total: number
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-2.5 font-medium text-[#111827]">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          {label}
        </span>
        <span className="text-sm text-muted-foreground">
          {count} ({pct}%)
        </span>
      </div>
      <div className="mt-2 h-[5px] w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function UsageBar({
  label,
  icon,
  used,
  limit,
  unlimitedNote,
  limitedNote,
}: {
  label: string
  icon: React.ReactNode
  used: number
  limit: number
  unlimitedNote: string
  limitedNote: (remaining: number) => string
}) {
  const isUnlimited = limit < 0
  const pct = isUnlimited
    ? Math.min(100, Math.max(0, used * 5))
    : limit > 0
    ? Math.min(100, Math.round((used / limit) * 100))
    : 0
  const remaining = isUnlimited ? Infinity : Math.max(0, limit - used)

  return (
    <div className="flex items-start gap-4">
      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[#111827]">{label}</span>
          <span className="text-sm font-medium text-muted-foreground">
            {used} / {isUnlimited ? 'Unlimited' : limit}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-violet-500 transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {isUnlimited ? unlimitedNote : limitedNote(remaining)}
        </p>
      </div>
    </div>
  )
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function getDocumentTypeIcon(type: string) {
  switch (type) {
    case 'rfi':
      return <FileQuestion className="h-4 w-4" strokeWidth={1.8} />
    case 'submittal':
      return <FileCheck className="h-4 w-4" strokeWidth={1.8} />
    case 'change_order':
      return <FilePen className="h-4 w-4" strokeWidth={1.8} />
    default:
      return <FileText className="h-4 w-4" strokeWidth={1.8} />
  }
}

function BackgroundDecoration() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute right-0 top-0 h-[280px] w-[820px] max-w-full"
      viewBox="0 0 820 280"
      fill="none"
      preserveAspectRatio="xMaxYMin slice"
    >
      <defs>
        <linearGradient id="bgMountainSoft" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M120 280 C 220 240 290 200 350 160 C 390 135 420 120 450 130 C 480 142 500 170 520 165 C 545 155 575 120 615 80 C 655 55 685 70 715 110 C 750 160 790 220 820 260 L 820 280 Z"
        fill="url(#bgMountainSoft)"
      />
    </svg>
  )
}
