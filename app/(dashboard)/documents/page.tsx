'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Plus,
  FileText,
  FileQuestion,
  FileCheck,
  FilePen,
  MoreHorizontal,
  Trash2,
  CheckCircle2,
  Eye,
  XCircle,
  Search,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import type { DocumentStatus } from '@/lib/types'
import { mockReviews, mockTeamMembers } from '@/lib/mock-data'

function DocumentsContent() {
  const searchParams = useSearchParams()
  const typeFromUrl = searchParams.get('type')
  const typeFilter =
    typeFromUrl === 'rfi' || typeFromUrl === 'submittal' || typeFromUrl === 'change_order'
      ? typeFromUrl
      : 'all'

  const [documents, setDocuments] = useState<
    Array<{
      id: string
      project_id: string
      doc_type: 'rfi' | 'submittal' | 'change_order'
      title: string
      description: string
      internal_status: string
      external_status: string
      current_version_no: number
      created_by: string
      created_at: string
      updated_at: string
    }>
  >([])
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true)
  useEffect(() => {
    const load = async () => {
      try {
        const [projectRes, documentRes] = await Promise.all([
          apiFetch<{ projects: Array<{ id: string; name: string }> }>('/api/projects'),
          apiFetch<{ documents: Array<{
            id: string
            project_id: string
            doc_type: 'rfi' | 'submittal' | 'change_order'
            title: string
            description: string
            internal_status: string
            external_status: string
            current_version_no: number
            created_by: string
            created_at: string
            updated_at: string
          }> }>('/api/documents'),
        ])
        setProjects(projectRes.projects)
        setDocuments(documentRes.documents)
      } catch {
        // Keep UI fallback behavior.
      } finally {
        setIsLoadingDocuments(false)
      }
    }
    void load()
  }, [])

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description.toLowerCase().includes(searchQuery.toLowerCase())
    const normalizedStatus: DocumentStatus =
      doc.internal_status === 'in_review'
        ? 'pending_review'
        : doc.internal_status === 'pending_reviewer'
          ? 'pending_review'
          : doc.internal_status === 'revising'
            ? 'revision_requested'
            : (doc.internal_status as DocumentStatus)
    const matchesType = typeFilter === 'all' || doc.doc_type === typeFilter
    const matchesStatus = statusFilter === 'all' || normalizedStatus === statusFilter
    const matchesProject = projectFilter === 'all' || doc.project_id === projectFilter
    return matchesSearch && matchesType && matchesStatus && matchesProject
  })

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

  const formatDocumentCreatedAt = (iso: string | undefined) => {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const internalStateBadge = (internal: string) => {
    const map: Record<string, { label: string; className: string }> = {
      draft: { label: 'Draft', className: 'bg-zinc-200 text-zinc-900 hover:bg-zinc-200' },
      in_review: { label: 'In Review', className: 'bg-violet-200 text-violet-950 hover:bg-violet-200' },
      pending_reviewer: {
        label: 'Pending Reviewer',
        className: 'bg-orange-200 text-orange-950 hover:bg-orange-200',
      },
      revising: { label: 'Revising', className: 'bg-rose-200 text-rose-950 hover:bg-rose-200' },
      approved: { label: 'Approved', className: 'bg-emerald-200 text-emerald-950 hover:bg-emerald-200' },
      rejected: { label: 'Rejected', className: 'bg-red-200 text-red-950 hover:bg-red-200' },
      answered: { label: 'Answered', className: 'bg-lime-200 text-lime-950 hover:bg-lime-200' },
      closed: { label: 'Closed', className: 'bg-neutral-200 text-neutral-800 hover:bg-neutral-200' },
      pending_execution: {
        label: 'Pending Execution',
        className: 'bg-purple-200 text-purple-950 hover:bg-purple-200',
      },
    }
    const style =
      map[internal] ?? {
        label: internal.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        className: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
      }
    return (
      <Badge className={`rounded-md border-0 px-2.5 py-1 text-xs font-semibold ${style.className}`}>
        {style.label}
      </Badge>
    )
  }

  const externalStateBadge = (external: string) => {
    const map: Record<string, { label: string; className: string }> = {
      draft: { label: 'Draft', className: 'bg-stone-200 text-stone-900 hover:bg-stone-200' },
      sent: { label: 'Sent', className: 'bg-cyan-200 text-cyan-950 hover:bg-cyan-200' },
      viewed: { label: 'Viewed', className: 'bg-sky-200 text-sky-950 hover:bg-sky-200' },
      approved: { label: 'Approved', className: 'bg-teal-200 text-teal-950 hover:bg-teal-200' },
      rejected: { label: 'Rejected', className: 'bg-red-200 text-red-950 hover:bg-red-200' },
      pending_reviewer: {
        label: 'Pending Reviewer',
        className: 'bg-amber-200 text-amber-950 hover:bg-amber-200',
      },
    }
    const style =
      map[external] ?? {
        label: external.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        className: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
      }
    return (
      <Badge className={`rounded-md border-0 px-2.5 py-1 text-xs font-semibold ${style.className}`}>
        {style.label}
      </Badge>
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getProjectName = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    return project?.name || 'Unknown Project'
  }

  const formatRelativeUpdate = (dateString: string) => {
    const date = new Date(dateString)
    const diffMs = Date.now() - date.getTime()
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    if (hours < 1) return 'Just now'
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
    if (hours < 48) return 'Yesterday'
    return formatDate(dateString)
  }

  const getUserName = (userId: string) => {
    const member = mockTeamMembers.find((user) => user.id === userId)
    return member?.name || 'Team Member'
  }

  const getReviewerTracking = (documentId: string, status: DocumentStatus) => {
    const review = mockReviews.find((r) => r.documentId === documentId)
    if (review?.status === 'approved') return ['sent', 'viewed'] as const
    if (review?.status === 'rejected' || review?.status === 'revision_requested') return ['failed'] as const
    if (status === 'approved') return ['sent', 'viewed'] as const
    if (status === 'rejected' || status === 'revision_requested') return ['failed'] as const
    if (status === 'pending_review') return ['sent'] as const
    return [] as const
  }

  const trackingBadge = (key: 'sent' | 'viewed' | 'failed') => {
    if (key === 'sent') {
      return (
        <Badge className="rounded-md border border-amber-300/80 bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100">
          <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-amber-800" />
          SENT
        </Badge>
      )
    }
    if (key === 'viewed') {
      return (
        <Badge className="rounded-md border border-indigo-300/80 bg-indigo-100 px-2.5 py-1 text-[11px] font-semibold text-indigo-950 hover:bg-indigo-100">
          <Eye className="mr-1 h-3.5 w-3.5 text-indigo-800" />
          VIEWED
        </Badge>
      )
    }
    return (
      <Badge className="rounded-md border border-red-300/70 bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-950 hover:bg-red-100">
        <XCircle className="mr-1 h-3.5 w-3.5 text-red-800" />
        FAILED
      </Badge>
    )
  }


  const newDocCtaClassName =
    'w-full gap-2 rounded-xl px-5 py-2.5 h-auto min-h-10 min-w-fit text-sm font-semibold shadow-sm sm:w-auto shrink-0'

  const newDocumentHref =
    typeFilter === 'change_order'
      ? '/change-orders/new'
      : typeFilter !== 'all'
        ? `/documents/new?type=${typeFilter}`
        : '/documents/new?type=rfi'

  const newDocumentCtaLabel =
    typeFilter === 'rfi'
      ? 'New RFI'
      : typeFilter === 'submittal'
        ? 'New Submittal'
        : typeFilter === 'change_order'
          ? 'New Change Order'
          : 'New Document'

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'all' || projectFilter !== 'all'

  return (
    <div className="flex flex-col">
      <div className="flex-1 space-y-6 p-6">
        <div className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {typeFilter === 'rfi'
                  ? 'Request for Information'
                  : typeFilter === 'submittal'
                    ? 'Submittals'
                    : typeFilter === 'change_order'
                      ? 'Change Orders'
                      : 'Documents'}
              </h1>
              <p className="max-w-2xl text-sm text-slate-500">
                {typeFilter === 'rfi'
                  ? 'Track and manage technical queries across architectural and structural domains with real-time status synchronization.'
                  : 'Track and manage documents with real-time status synchronization.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {typeFilter !== 'all' ? (
                <Button asChild className={newDocCtaClassName}>
                  <Link
                    href={
                      typeFilter === 'change_order'
                        ? '/change-orders/new'
                        : `/documents/new?type=${typeFilter}`
                    }
                  >
                    <Plus className="size-4" />
                    {typeFilter === 'rfi' ? 'Create New RFI' : `Create ${newDocumentCtaLabel}`}
                  </Link>
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className={newDocCtaClassName}>
                      <Plus className="size-4" />
                      Create New Document
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href="/documents/new?type=rfi">
                        <FileQuestion className="mr-2 h-4 w-4" />
                        New RFI
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/documents/new?type=submittal">
                        <FileCheck className="mr-2 h-4 w-4" />
                        New Submittal
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/change-orders/new">
                        <FilePen className="mr-2 h-4 w-4" />
                        New Change Order
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-slate-50 px-4 py-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="relative w-full flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3 xl:ml-auto">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger size="sm" className="w-[190px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending_review">Pending Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="revision_requested">Revision Requested</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger size="sm" className="w-[210px]">
                    <SelectValue placeholder="Project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      All Projects
                    </SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  className="px-2 text-[#0f172a]"
                  onClick={() => {
                    setSearchQuery('')
                    setStatusFilter('all')
                    setProjectFilter('all')
                  }}
                  disabled={!hasActiveFilters}
                >
                  Clear Filters
                </Button>
              </div>
            </div>
          </div>
        </div>

        {isLoadingDocuments ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/40 text-muted-foreground">
            <Spinner className="size-8" />
            <p className="text-sm">Loading documents...</p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <Empty>
            <EmptyMedia variant="icon">
              <FileText className="h-10 w-10" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No documents found</EmptyTitle>
              <EmptyDescription>
                {searchQuery || typeFilter !== 'all' || statusFilter !== 'all' || projectFilter !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Create your first document to get started'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <Table>
              <TableHeader className="bg-slate-50/70">
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="w-12 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Type
                  </TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Title & ID
                  </TableHead>
                  <TableHead className="hidden sm:table-cell py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Last Updated
                  </TableHead>
                  <TableHead className="hidden md:table-cell py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Version
                  </TableHead>
                  <TableHead className="hidden lg:table-cell py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Reviewer Tracking
                  </TableHead>
                  <TableHead className="hidden lg:table-cell py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Internal State
                  </TableHead>
                  <TableHead className="hidden lg:table-cell py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    External State
                  </TableHead>
                  <TableHead className="w-10 py-4"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((doc) => {
                  const normalizedRowStatus: DocumentStatus =
                    doc.internal_status === 'in_review'
                      ? 'pending_review'
                      : doc.internal_status === 'pending_reviewer'
                        ? 'pending_review'
                        : doc.internal_status === 'revising'
                          ? 'revision_requested'
                          : (doc.internal_status as DocumentStatus)
                  return (
                  <TableRow key={doc.id} className="group border-slate-100 hover:bg-slate-50/60">
                    <TableCell className="py-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                        {getDocumentTypeIcon(doc.doc_type)}
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="text-[15px] font-semibold text-slate-900 transition-colors hover:text-primary"
                      >
                        {doc.title}
                      </Link>
                      <p className="mt-0.5 min-w-0 break-words text-xs text-slate-500">
                        {`${getProjectName(doc.project_id)} \u2022 ${formatDocumentCreatedAt(doc.created_at)}`}
                      </p>
                    </TableCell>
                    <TableCell className="hidden py-4 sm:table-cell">
                      <p className="text-sm font-medium text-slate-800">{formatRelativeUpdate(doc.updated_at)}</p>
                      <p className="text-xs text-slate-500">{`by ${getUserName(doc.created_by)}`}</p>
                    </TableCell>
                    <TableCell className="hidden py-4 md:table-cell">
                      <Badge
                        variant="secondary"
                        className="rounded-md border-0 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
                      >
                        {`v${doc.current_version_no}.0`}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden py-4 lg:table-cell">
                      <div className="flex flex-wrap gap-1.5">
                        {getReviewerTracking(doc.id, normalizedRowStatus).map((item) => (
                          <span key={`${doc.id}-${item}`}>{trackingBadge(item)}</span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="hidden py-4 lg:table-cell">
                      {internalStateBadge(doc.internal_status)}
                    </TableCell>
                    <TableCell className="hidden py-4 lg:table-cell">
                      {externalStateBadge(doc.external_status ?? 'draft')}
                    </TableCell>
                    <TableCell className="py-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/documents/${doc.id}`}>
                              <FileText className="mr-2 h-4 w-4" />
                              View
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={async () => {
                              await apiFetch('/api/documents/' + doc.id, { method: 'DELETE' })
                              setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DocumentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6 text-muted-foreground">
          <Spinner className="size-8" />
          <p className="text-sm">Loading...</p>
        </div>
      }
    >
      <DocumentsContent />
    </Suspense>
  )
}
