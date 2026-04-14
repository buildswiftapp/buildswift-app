'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Plus,
  Search,
  FileText,
  FileQuestion,
  FileCheck,
  FilePen,
  MoreHorizontal,
  Trash2,
  CheckCircle2,
  Eye,
  XCircle,
  Send,
  Clock3,
  CircleAlert,
} from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
  EmptyContent,
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

  const { documents, projects, deleteDocument } = useApp()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.content.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = typeFilter === 'all' || doc.type === typeFilter
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter
    const matchesProject = projectFilter === 'all' || doc.projectId === projectFilter
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

  const getDocumentTypeName = (type: string) => {
    switch (type) {
      case 'rfi':
        return 'RFI'
      case 'submittal':
        return 'Submittal'
      case 'change_order':
        return 'Change Order'
      default:
        return type
    }
  }

  const getStatusBadge = (status: DocumentStatus) => {
    const styles: Record<string, { className: string; label: string }> = {
      draft: { className: 'bg-slate-100 text-slate-700 hover:bg-slate-100', label: 'Draft Pending' },
      pending_review: { className: 'bg-blue-100 text-blue-700 hover:bg-blue-100', label: 'In Review' },
      approved: { className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100', label: 'Pending Close' },
      rejected: { className: 'bg-rose-100 text-rose-700 hover:bg-rose-100', label: 'Action Required' },
      revision_requested: { className: 'bg-rose-100 text-rose-700 hover:bg-rose-100', label: 'Action Required' },
    }
    const style = styles[status] || styles.draft
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
        <Badge className="rounded-md border-0 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50">
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
          SENT
        </Badge>
      )
    }
    if (key === 'viewed') {
      return (
        <Badge className="rounded-md border-0 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50">
          <Eye className="mr-1 h-3.5 w-3.5" />
          VIEWED
        </Badge>
      )
    }
    return (
      <Badge className="rounded-md border-0 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50">
        <XCircle className="mr-1 h-3.5 w-3.5" />
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

  return (
    <div className="flex flex-col">
      <div className="flex-1 space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="revision_requested">Revision Requested</SelectItem>
              </SelectContent>
            </Select>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
                {newDocumentCtaLabel}
              </Link>
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className={newDocCtaClassName}>
                  <Plus className="size-4" />
                  {newDocumentCtaLabel}
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

        {filteredDocuments.length === 0 ? (
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
            {!searchQuery && statusFilter === 'all' && projectFilter === 'all' ? (
              <EmptyContent>
                <Button asChild className={newDocCtaClassName}>
                  <Link href={newDocumentHref}>
                    <Plus className="size-4" />
                    {newDocumentCtaLabel}
                  </Link>
                </Button>
              </EmptyContent>
            ) : null}
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
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </TableHead>
                  <TableHead className="w-10 py-4"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((doc) => (
                  <TableRow key={doc.id} className="group border-slate-100 hover:bg-slate-50/60">
                    <TableCell className="py-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                        {getDocumentTypeIcon(doc.type)}
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="text-[15px] font-semibold text-slate-900 transition-colors hover:text-primary"
                      >
                        {doc.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {`${doc.id.toUpperCase()} \u2022 ${getDocumentTypeName(doc.type)} \u2022 ${getProjectName(doc.projectId)}`}
                      </p>
                    </TableCell>
                    <TableCell className="hidden py-4 sm:table-cell">
                      <p className="text-sm font-medium text-slate-800">{formatRelativeUpdate(doc.updatedAt)}</p>
                      <p className="text-xs text-slate-500">{`by ${getUserName(doc.createdBy)}`}</p>
                    </TableCell>
                    <TableCell className="hidden py-4 md:table-cell">
                      <Badge
                        variant="secondary"
                        className="rounded-md border-0 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
                      >
                        {`v${doc.version}.0`}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden py-4 lg:table-cell">
                      <div className="flex flex-wrap gap-1.5">
                        {getReviewerTracking(doc.id, doc.status).map((item) => (
                          <span key={`${doc.id}-${item}`}>{trackingBadge(item)}</span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="py-4">{getStatusBadge(doc.status)}</TableCell>
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
                            onClick={() => deleteDocument(doc.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
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
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <DocumentsContent />
    </Suspense>
  )
}
