'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  FolderKanban,
  FileText,
  Clock,
  FileQuestion,
  FileCheck,
  FilePen,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

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
  internal_status: string
  updated_at: string
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<DashboardProject[]>([])
  const [documents, setDocuments] = useState<DashboardDocument[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [billingSummary, setBillingSummary] = useState<{
    tier: string
    documents_used: number
    documents_limit: number
    ai_generations_used: number
    ai_generations_limit: number
  } | null>(null)

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

        const summary = await apiFetch<{
          tier: string
          documents_used: number
          documents_limit: number
          ai_generations_used: number
          ai_generations_limit: number
        }>('/api/billing/summary')
        if (active) setBillingSummary(summary)
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

  const normalizeStatus = (internalStatus: string) => {
    const s = (internalStatus ?? '').trim().toLowerCase()
    if (s === 'in_review' || s === 'pending_reviewer') return 'pending_review'
    if (s === 'revising') return 'revision_requested'
    if (s === 'approved' || s === 'rejected' || s === 'draft') return s
    return 'draft'
  }

  const uiDocuments = documents.map((d) => ({
    id: d.id,
    projectId: d.project_id,
    type: d.doc_type,
    title: d.title,
    status: normalizeStatus(d.internal_status),
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
  const pendingDocuments = uiDocuments.filter((d) => d.status === 'pending_review')
  const draftDocuments = uiDocuments.filter((d) => d.status === 'draft')

  const documentsByType = {
    rfi: uiDocuments.filter((d) => d.type === 'rfi').length,
    submittal: uiDocuments.filter((d) => d.type === 'submittal').length,
    change_order: uiDocuments.filter((d) => d.type === 'change_order').length,
  }

  const recentDocuments = [...uiDocuments]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5)

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { className: string; label: string }> = {
      draft: { className: 'bg-muted text-muted-foreground', label: 'Draft' },
      pending_review: { className: 'bg-slate-100 text-slate-800', label: 'Pending Review' },
      approved: { className: 'bg-emerald-100 text-emerald-800', label: 'Approved' },
      rejected: { className: 'bg-red-100 text-red-800', label: 'Rejected' },
      revision_requested: { className: 'bg-violet-100 text-violet-800', label: 'Revision Requested' },
    }
    const style = styles[status] || styles.draft
    return <Badge className={style.className}>{style.label}</Badge>
  }

  const getDocumentTypeIcon = (type: string) => {
    switch (type) {
      case 'rfi':
        return <FileQuestion className="h-4 w-4" />
      case 'submittal':
        return <FileCheck className="h-4 w-4" />
      case 'change_order':
        return <FilePen className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="app-page">
      <div className="space-y-6">
        <div>
          <h1 className="app-section-title">Dashboard</h1>
          <p className="app-section-subtitle">Overview of projects, documents, and review progress.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="app-surface">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Projects
              </CardTitle>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loadingData ? '—' : activeProjects.length}</div>
              <p className="text-xs text-muted-foreground">
                {loadingData ? 'Loading…' : `${uiProjects.length} total projects`}
              </p>
            </CardContent>
          </Card>

          <Card className="app-surface">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Documents
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loadingData ? '—' : uiDocuments.length}</div>
              <p className="text-xs text-muted-foreground">
                Across all projects
              </p>
            </CardContent>
          </Card>

          <Card className="app-surface">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Reviews
              </CardTitle>
              <Clock className="h-4 w-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loadingData ? '—' : pendingDocuments.length}</div>
              <p className="text-xs text-muted-foreground">
                Awaiting approval
              </p>
            </CardContent>
          </Card>

          <Card className="app-surface">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Drafts
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loadingData ? '—' : draftDocuments.length}</div>
              <p className="text-xs text-muted-foreground">
                In progress
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="app-surface lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Documents</CardTitle>
                <CardDescription>Latest activity across your projects</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loadingData ? (
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground">Loading recent documents…</div>
                ) : recentDocuments.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No documents yet.
                  </div>
                ) : (
                  recentDocuments.map((doc) => {
                    const project = uiProjects.find((p) => p.id === doc.projectId)
                  return (
                    <Link
                      key={doc.id}
                      href={`/documents/${doc.id}`}
                      className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {getDocumentTypeIcon(doc.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{doc.title}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {project?.name} &bull; {formatDate(doc.updatedAt)}
                        </p>
                      </div>
                      {getStatusBadge(doc.status)}
                    </Link>
                  )
                  })
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="app-surface">
            <CardHeader>
              <CardTitle>Documents by Type</CardTitle>
              <CardDescription>Breakdown of your documents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileQuestion className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">RFIs</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{loadingData ? '—' : documentsByType.rfi}</span>
                </div>
                <Progress
                  value={uiDocuments.length > 0 ? (documentsByType.rfi / uiDocuments.length) * 100 : 0}
                  className="h-2"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-accent" />
                    <span className="text-sm font-medium">Submittals</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{loadingData ? '—' : documentsByType.submittal}</span>
                </div>
                <Progress
                  value={uiDocuments.length > 0 ? (documentsByType.submittal / uiDocuments.length) * 100 : 0}
                  className="h-2"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FilePen className="h-4 w-4 text-chart-3" />
                    <span className="text-sm font-medium">Change Orders</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{loadingData ? '—' : documentsByType.change_order}</span>
                </div>
                <Progress
                  value={uiDocuments.length > 0 ? (documentsByType.change_order / uiDocuments.length) * 100 : 0}
                  className="h-2"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="app-surface">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Active Projects</CardTitle>
              <CardDescription>Your ongoing construction projects</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {loadingData ? (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Loading active projects…
                </div>
              ) : activeProjects.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No active projects yet.
                </div>
              ) : (
                activeProjects.slice(0, 3).map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{project.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {project.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {project.documentsCount} documents
                    </span>
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                      Active
                    </Badge>
                  </div>
                </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {billingSummary && (
          <Card className="app-surface">
            <CardHeader>
              <CardTitle>Usage Overview</CardTitle>
              <CardDescription>Your current plan: {billingSummary.tier}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Documents</span>
                    <span className="text-muted-foreground">
                      {billingSummary.documents_used} /{' '}
                      {billingSummary.documents_limit < 0 ? 'Unlimited' : billingSummary.documents_limit}
                    </span>
                  </div>
                  <Progress
                    value={
                      billingSummary.documents_limit > 0
                        ? (billingSummary.documents_used / billingSummary.documents_limit) * 100
                        : 0
                    }
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground">
                    {billingSummary.documents_limit < 0
                      ? 'Unlimited documents available on this plan'
                      : `${Math.max(0, billingSummary.documents_limit - billingSummary.documents_used)} documents remaining this month`}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">AI Generations</span>
                    <span className="text-muted-foreground">
                      {billingSummary.ai_generations_used} /{' '}
                      {billingSummary.ai_generations_limit < 0
                        ? 'Unlimited'
                        : billingSummary.ai_generations_limit}
                    </span>
                  </div>
                  <Progress
                    value={
                      billingSummary.ai_generations_limit > 0
                        ? (billingSummary.ai_generations_used / billingSummary.ai_generations_limit) * 100
                        : 0
                    }
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground">
                    {billingSummary.ai_generations_limit < 0
                      ? 'Unlimited AI generations available on this plan'
                      : `${Math.max(0, billingSummary.ai_generations_limit - billingSummary.ai_generations_used)} AI generations remaining`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
