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
  Trash2,
  Eye,
  Search,
  RefreshCcw,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import type { DocumentStatus } from '@/lib/types'
import { mockTeamMembers } from '@/lib/mock-data'

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
  const [rowsPerPage, setRowsPerPage] = useState<number>(15)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [deletingDocumentIds, setDeletingDocumentIds] = useState<Record<string, boolean>>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [documentToDelete, setDocumentToDelete] = useState<{ id: string; title: string } | null>(null)

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
  const totalRows = filteredDocuments.length
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageStart = (safeCurrentPage - 1) * rowsPerPage
  const paginatedDocuments = filteredDocuments.slice(pageStart, pageStart + rowsPerPage)
  const paginationWindowSize = 5
  const halfWindow = Math.floor(paginationWindowSize / 2)
  const windowStart = Math.max(1, safeCurrentPage - halfWindow)
  const windowEnd = Math.min(totalPages, windowStart + paginationWindowSize - 1)
  const normalizedWindowStart = Math.max(1, windowEnd - paginationWindowSize + 1)
  const visiblePages = Array.from(
    { length: windowEnd - normalizedWindowStart + 1 },
    (_, idx) => normalizedWindowStart + idx
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter, projectFilter])

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

  const handleDeleteDocument = async (documentId: string) => {
    if (deletingDocumentIds[documentId]) return
    setDeletingDocumentIds((prev) => ({ ...prev, [documentId]: true }))
    try {
      await apiFetch('/api/documents/' + documentId, { method: 'DELETE' })
      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId))
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      // If already deleted in another tab/request, keep UI in sync and avoid unhandled rejections.
      if (message.toLowerCase().includes('document not found')) {
        setDocuments((prev) => prev.filter((doc) => doc.id !== documentId))
      } else {
        console.error('Failed to delete document', error)
      }
    } finally {
      setDeletingDocumentIds((prev) => {
        const next = { ...prev }
        delete next[documentId]
        return next
      })
    }
  }

  const handleRequestDeleteDocument = (documentId: string, title: string) => {
    if (deletingDocumentIds[documentId]) return
    setDocumentToDelete({ id: documentId, title })
    setDeleteDialogOpen(true)
  }

  const confirmDeleteDocument = () => {
    const target = documentToDelete
    setDeleteDialogOpen(false)
    if (!target) return
    void handleDeleteDocument(target.id)
    setDocumentToDelete(null)
  }

  const tableStatusBadge = (status: DocumentStatus) => {
    const map: Record<DocumentStatus, { label: string; className: string }> = {
      draft: { label: 'Draft', className: 'bg-slate-100 text-slate-600' },
      pending_review: { label: 'In Review', className: 'bg-violet-100 text-violet-600' },
      approved: { label: 'Approved', className: 'bg-emerald-100 text-emerald-700' },
      rejected: { label: 'Rejected', className: 'bg-rose-100 text-rose-700' },
      revision_requested: { label: 'Revision', className: 'bg-amber-100 text-amber-700' },
    }
    const style = map[status] ?? map.draft
    return (
      <Badge className={`rounded-full border-0 px-2.5 py-1 text-[10px] font-medium tracking-wide ${style.className}`}>
        {style.label}
      </Badge>
    )
  }


  const newDocCtaClassName =
    'w-full gap-2 rounded-xl px-5 py-2.5 h-auto min-h-10 min-w-fit text-sm font-semibold shadow-[0_8px_24px_rgba(63,99,243,0.28)] sm:w-auto shrink-0'

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
  const quickStatusFilters: Array<{ key: string; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'pending_review', label: 'In Review' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
  ]

  return (
    <div className="app-page space-y-6">
      <div className="space-y-4">
          <div className="app-surface bg-muted/45 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {quickStatusFilters.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setStatusFilter(filter.key)}
                    className={
                      statusFilter === filter.key
                        ? 'rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm'
                        : 'rounded-full bg-background/90 px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-white'
                    }
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search documents..."
                  className="h-10 rounded-xl bg-background pl-9"
                />
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger size="sm" className="w-[170px] bg-background">
                      <SelectValue placeholder="Sort By: Status" />
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
                    <SelectTrigger size="sm" className="w-[180px] bg-background">
                      <SelectValue placeholder="Sort By: Project" />
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
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="bg-background"
                    onClick={() => {
                      setSearchQuery('')
                      setStatusFilter('all')
                      setProjectFilter('all')
                    }}
                    disabled={!hasActiveFilters}
                  >
                    <RefreshCcw className="h-4 w-4" />
                  </Button>
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
          <div className="app-surface overflow-hidden bg-white">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      Name
                      <ChevronsUpDown className="h-3 w-3 opacity-70" />
                    </span>
                  </TableHead>
                  <TableHead className="hidden py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">
                    <span className="inline-flex items-center gap-1">
                      Project Name
                      <ChevronsUpDown className="h-3 w-3 opacity-70" />
                    </span>
                  </TableHead>
                  <TableHead className="hidden py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">
                    <span className="inline-flex items-center gap-1">
                      Last Updated
                      <ChevronsUpDown className="h-3 w-3 opacity-70" />
                    </span>
                  </TableHead>
                  <TableHead className="hidden py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground xl:table-cell">
                    <span className="inline-flex items-center gap-1">
                      Status
                      <ChevronsUpDown className="h-3 w-3 opacity-70" />
                    </span>
                  </TableHead>
                  <TableHead className="w-[150px] py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDocuments.map((doc, index) => {
                  const normalizedRowStatus: DocumentStatus =
                    doc.internal_status === 'in_review'
                      ? 'pending_review'
                      : doc.internal_status === 'pending_reviewer'
                        ? 'pending_review'
                        : doc.internal_status === 'revising'
                          ? 'revision_requested'
                          : (doc.internal_status as DocumentStatus)
                  return (
                  <TableRow
                    key={doc.id}
                    className={`group border-border/70 ${index % 2 === 0 ? 'bg-background' : 'bg-muted/35'} hover:bg-muted/55`}
                  >
                    <TableCell className="py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/documents/${doc.id}`}
                            className="block truncate text-[14px] font-semibold text-foreground transition-colors hover:text-primary"
                          >
                            {doc.title}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            <span className="text-sm font-normal uppercase tracking-wide text-foreground">
                              {doc.doc_type.replace('_', ' ')}
                            </span>
                            <span className="mx-1">•</span>
                            <span>{formatDocumentCreatedAt(doc.created_at)}</span>
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden py-3.5 md:table-cell">
                      <p className="truncate text-sm text-foreground">{getProjectName(doc.project_id)}</p>
                    </TableCell>
                    <TableCell className="hidden py-3.5 lg:table-cell">
                      <p className="text-sm font-medium text-foreground">{formatRelativeUpdate(doc.updated_at)}</p>
                    </TableCell>
                    <TableCell className="hidden py-3.5 xl:table-cell">
                      {tableStatusBadge(normalizedRowStatus)}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <div className="flex items-center justify-start gap-1.5">
                        <Button asChild variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100">
                          <Link href={`/documents/${doc.id}`}>
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button asChild variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100">
                          <Link href={`/documents/${doc.id}`}>
                            <FilePen className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            handleRequestDeleteDocument(doc.id, doc.title)
                          }}
                          disabled={Boolean(deletingDocumentIds[doc.id])}
                          className="h-7 w-7 cursor-pointer rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <div className="flex flex-col gap-3 border-t border-border/70 bg-background px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Show</span>
                <Select
                  value={String(rowsPerPage)}
                  onValueChange={(v) => {
                    setRowsPerPage(Number(v))
                    setCurrentPage(1)
                  }}
                >
                  <SelectTrigger size="sm" className="h-8 w-[74px] rounded-md border-border/70 bg-background text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="15">15</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="30">30</SelectItem>
                  </SelectContent>
                </Select>
                <span>{`of ${totalRows} entries`}</span>
              </div>
              <div className="flex items-center gap-1.5 self-end">
                  <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-md border border-border/70 bg-background text-muted-foreground hover:bg-muted/40"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {normalizedWindowStart > 1 ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 min-w-8 rounded-md border border-transparent px-2 text-muted-foreground hover:bg-muted/40"
                      onClick={() => setCurrentPage(1)}
                    >
                      1
                    </Button>
                    {normalizedWindowStart > 2 ? <span className="px-1 text-muted-foreground">...</span> : null}
                  </>
                ) : null}
                {visiblePages.map((pageNumber) => (
                  <Button
                    key={pageNumber}
                    type="button"
                    variant="ghost"
                    className={
                      safeCurrentPage === pageNumber
                        ? 'h-8 min-w-8 rounded-md border border-primary/20 bg-primary/15 px-2 font-medium text-primary'
                        : 'h-8 min-w-8 rounded-md border border-transparent px-2 text-muted-foreground hover:bg-muted/40'
                    }
                    onClick={() => setCurrentPage(pageNumber)}
                  >
                    {pageNumber}
                  </Button>
                ))}
                {windowEnd < totalPages ? (
                  <>
                    {windowEnd < totalPages - 1 ? <span className="px-1 text-muted-foreground">...</span> : null}
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 min-w-8 rounded-md border border-transparent px-2 text-muted-foreground hover:bg-muted/40"
                      onClick={() => setCurrentPage(totalPages)}
                    >
                      {totalPages}
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-md border border-border/70 bg-background text-muted-foreground hover:bg-muted/40"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
        <AlertDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            setDeleteDialogOpen(open)
            if (!open) setDocumentToDelete(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this document?</AlertDialogTitle>
              <AlertDialogDescription>
                {`This action cannot be undone. "${documentToDelete?.title ?? 'This document'}" will be permanently removed.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault()
                  confirmDeleteDocument()
                }}
                className="bg-rose-600 text-white hover:bg-rose-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
