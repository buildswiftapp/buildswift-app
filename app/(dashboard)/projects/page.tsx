'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  FolderKanban,
  Calendar,
  FileText,
  Trash2,
  Edit,
  Archive,
  Building2,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import type { Project } from '@/lib/types'

function toDateInputValue(iso: string | undefined) {
  if (!iso) return ''
  return iso.includes('T') ? iso.split('T')[0] : iso.slice(0, 10)
}

const emptyForm = {
  name: '',
  description: '',
  clientName: '',
  address: '',
  status: 'active' as 'active' | 'on_hold' | 'completed',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
}

function projectCardStatusBadge(project: Project) {
  const pill =
    'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium leading-none'
  if (project.isArchived) {
    return <span className={`${pill} bg-slate-100 text-slate-600`}>Archived</span>
  }
  if (project.status === 'active') {
    return <span className={`${pill} bg-[#d1fae5] text-[#065f46]`}>Active</span>
  }
  if (project.status === 'on_hold') {
    return <span className={`${pill} bg-slate-100 text-slate-600`}>On Hold</span>
  }
  return <span className={`${pill} bg-slate-100 text-slate-700`}>Completed</span>
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editDrawerOpen, setEditDrawerOpen] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await apiFetch<{
          projects: Array<{
            id: string
            name: string
            description: string | null
            address: string | null
            client_owner_name: string | null
            status: 'active' | 'archived' | 'deleted'
            created_at: string
            updated_at: string
          }>
        }>('/api/projects')
        setProjects(
          data.projects
            .filter((p) => p.status !== 'deleted')
            .map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description ?? '',
              companyId: '',
              isArchived: p.status === 'archived',
              status: p.status === 'archived' ? 'completed' : 'active',
              address: p.address ?? undefined,
              clientName: p.client_owner_name ?? undefined,
              startDate: p.created_at,
              endDate: undefined,
              documentsCount: 0,
              teamMembers: [],
              createdAt: p.created_at,
              updatedAt: p.updated_at,
            }))
        )
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load projects')
      } finally {
        setIsLoadingProjects(false)
      }
    }
    void loadProjects()
  }, [])

  const [formData, setFormData] = useState(emptyForm)
  const [editFormData, setEditFormData] = useState(emptyForm)

  const filteredProjects = projects.filter((project) => {
    if (statusFilter !== 'all' && project.status !== statusFilter) return false
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      const inName = project.name.toLowerCase().includes(q)
      const inDesc = project.description.toLowerCase().includes(q)
      if (!inName && !inDesc) return false
    }
    return true
  })

  const handleDeleteProject = (id: string) => {
    setProjectToDelete(id)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    const id = projectToDelete
    setDeleteDialogOpen(false)
    if (!id) {
      setProjectToDelete(null)
      return
    }
    void (async () => {
      try {
        await apiFetch('/api/projects/' + id, { method: 'DELETE' })
        setProjects((prev) => prev.filter((p) => p.id !== id))
        toast.success('Project deleted')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to delete project')
      } finally {
        setProjectToDelete(null)
      }
    })()
  }

  const handleArchiveProject = (id: string) => {
    void (async () => {
      try {
        await apiFetch<{ project: { status: string } }>('/api/projects/' + id, {
          method: 'PATCH',
          json: { status: 'archived' },
        })
        setProjects((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, status: 'completed', isArchived: true, updatedAt: new Date().toISOString() }
              : p
          )
        )
        toast.success('Project archived')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to archive project')
      }
    })()
  }

  const openEditDrawer = (project: Project) => {
    setEditingProjectId(project.id)
    setEditFormData({
      name: project.name,
      description: project.description,
      clientName: project.clientName ?? '',
      address: project.address ?? '',
      status: project.status,
      startDate: toDateInputValue(project.startDate),
      endDate: toDateInputValue(project.endDate),
    })
    setEditDrawerOpen(true)
  }

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProjectId) return
    if (!editFormData.name.trim()) {
      toast.error('Project name is required')
      return
    }

    setIsUpdating(true)
    try {
      await apiFetch('/api/projects/' + editingProjectId, {
        method: 'PATCH',
        json: {
          name: editFormData.name,
          description: editFormData.description,
          address: editFormData.address,
          client_owner: editFormData.clientName,
          status: editFormData.status === 'completed' ? 'archived' : 'active',
        },
      })
      setProjects((prev) =>
        prev.map((p) =>
          p.id === editingProjectId
            ? {
                ...p,
                name: editFormData.name,
                description: editFormData.description,
                clientName: editFormData.clientName || undefined,
                address: editFormData.address || undefined,
                status: editFormData.status,
                isArchived: editFormData.status === 'completed' ? true : false,
                updatedAt: new Date().toISOString(),
              }
            : p
        )
      )
      toast.success('Project updated')
      setEditDrawerOpen(false)
      setEditingProjectId(null)
    } catch {
      toast.error('Failed to update project')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast.error('Project name is required')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await apiFetch<{
        project: {
          id: string
          name: string
          description: string | null
          address: string | null
          client_owner_name: string | null
          status: string
          created_at: string
          updated_at: string
        }
      }>('/api/projects', {
        method: 'POST',
        json: {
          name: formData.name,
          description: formData.description,
          address: formData.address,
          client_owner: formData.clientName,
        },
      })
      setProjects((prev) => [
        {
          id: result.project.id,
          name: result.project.name,
          description: result.project.description ?? '',
          companyId: '',
          isArchived: result.project.status === 'archived',
          status: result.project.status === 'archived' ? 'completed' : 'active',
          address: result.project.address ?? undefined,
          clientName: result.project.client_owner_name ?? undefined,
          startDate: result.project.created_at,
          endDate: undefined,
          documentsCount: 0,
          teamMembers: [],
          createdAt: result.project.created_at,
          updatedAt: result.project.updated_at,
        },
        ...prev,
      ])
      toast.success('Project created successfully')
      setDrawerOpen(false)
      setFormData({
        ...emptyForm,
        startDate: new Date().toISOString().split('T')[0],
      })
    } catch {
      toast.error('Failed to create project')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex-1 space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Projects</h1>
            <p className="text-sm text-slate-500">Manage and track your construction projects</p>
          </div>
          <Button type="button" onClick={() => setDrawerOpen(true)} className="shrink-0 gap-2 self-start">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>

        {!isLoadingProjects && projects.length > 0 ? (
          <div className="rounded-lg border border-slate-200/90 bg-slate-50 px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 border-slate-200 bg-white pl-9 shadow-xs"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger size="sm" className="w-full sm:w-44 sm:shrink-0">
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <Filter className="h-4 w-4 shrink-0 text-slate-500" />
                    <SelectValue placeholder="All Status" />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        {isLoadingProjects ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
            <Spinner className="size-8" />
            <p className="text-sm">Loading projects...</p>
          </div>
        ) : projects.length === 0 ? (
          <Empty>
            <EmptyMedia variant="icon">
              <FolderKanban className="h-10 w-10" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No projects yet</EmptyTitle>
              <EmptyDescription>Create your first project to get started.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" onClick={() => setDrawerOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            </EmptyContent>
          </Empty>
        ) : filteredProjects.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-800">No projects match your filters</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Try adjusting your search or status filter.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setSearchQuery('')
                setStatusFilter('all')
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.map((project) => {
              const hasDesc = Boolean(project.description?.trim())
              return (
                <Card
                  key={project.id}
                  className="group min-w-0 gap-0 overflow-hidden rounded-xl border border-slate-200 bg-white py-0 shadow-sm transition-shadow duration-200 hover:shadow-md"
                >
                  <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
                    <div className="flex gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100"
                        aria-hidden
                      >
                        <Building2 className="h-5 w-5 text-[#0f172a]" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 space-y-0.5 pr-1">
                            <Link
                              href={`/projects/${project.id}`}
                              className="block rounded-sm outline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                              <span className="block break-words text-[17px] font-semibold leading-snug tracking-[-0.015em] text-[#0f172a]">
                                {project.name}
                              </span>
                            </Link>
                            <p className="truncate text-[13px] leading-normal text-slate-600">
                              {project.clientName?.trim() ? project.clientName : '—'}
                            </p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="-mr-1 -mt-0.5 h-8 w-8 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                aria-label="Project actions"
                              >
                                <MoreVertical className="h-4 w-4" strokeWidth={2} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/projects/${project.id}`}>
                                  <FolderKanban className="mr-2 h-4 w-4" />
                                  View Project
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openEditDrawer(project)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {!project.isArchived && project.status !== 'completed' && (
                                <DropdownMenuItem onClick={() => handleArchiveProject(project.id)}>
                                  <Archive className="mr-2 h-4 w-4" />
                                  Mark Complete
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => handleDeleteProject(project.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>

                    <p
                      className={`mt-3.5 text-[13px] leading-relaxed ${
                        hasDesc ? 'text-slate-600' : 'text-slate-400'
                      } line-clamp-1`}
                    >
                      {hasDesc ? project.description : '—'}
                    </p>

                    <div className="mt-4 space-y-2.5">
                      <div className="flex items-center gap-2 text-[13px] font-normal text-slate-500">
                        <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2} />
                        <span>Started {formatDate(project.startDate)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[13px] font-normal text-slate-500">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2} />
                        <span>
                          {project.documentsCount}{' '}
                          {project.documentsCount === 1 ? 'document' : 'documents'}
                        </span>
                      </div>
                      <div className="pt-0.5">{projectCardStatusBadge(project)}</div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this project? This will also delete all documents
              associated with this project. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Drawer direction="right" open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-w-[95vw] data-[vaul-drawer-direction=right]:w-[560px] sm:data-[vaul-drawer-direction=right]:max-w-none">
          <DrawerHeader>
            <DrawerTitle>Create New Project</DrawerTitle>
            <DrawerDescription>
              Add a new construction project without leaving this page.
            </DrawerDescription>
          </DrawerHeader>
          <form onSubmit={handleCreateProject} className="flex h-full flex-col px-4 pb-4">
            <div className="flex-1 overflow-y-auto">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">Project Name *</FieldLabel>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Downtown Office Tower"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="description">Description</FieldLabel>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the project..."
                    rows={4}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="clientName">Client Name</FieldLabel>
                  <Input
                    id="clientName"
                    value={formData.clientName}
                    onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                    placeholder="e.g., Metropolitan Development Corp"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="address">Project Address</FieldLabel>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="e.g., 123 Main Street, New York, NY 10001"
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="startDate">Start Date</FieldLabel>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="endDate">End Date (Optional)</FieldLabel>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    />
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="status">Status</FieldLabel>
                  <Select
                    value={formData.status}
                    onValueChange={(value: 'active' | 'on_hold' | 'completed') =>
                      setFormData({ ...formData, status: value })
                    }
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
            </div>
            <DrawerFooter className="px-0 pb-0">
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setDrawerOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>

      <Drawer
        direction="right"
        open={editDrawerOpen}
        onOpenChange={(open) => {
          setEditDrawerOpen(open)
          if (!open) setEditingProjectId(null)
        }}
      >
        <DrawerContent className="max-w-[95vw] data-[vaul-drawer-direction=right]:w-[560px] sm:data-[vaul-drawer-direction=right]:max-w-none">
          <DrawerHeader>
            <DrawerTitle>Edit Project</DrawerTitle>
            <DrawerDescription>Update this project&apos;s details. Changes apply immediately.</DrawerDescription>
          </DrawerHeader>
          <form onSubmit={handleUpdateProject} className="flex h-full flex-col px-4 pb-4">
            <div className="flex-1 overflow-y-auto">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="edit-name">Project Name *</FieldLabel>
                  <Input
                    id="edit-name"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    placeholder="e.g., Downtown Office Tower"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-description">Description</FieldLabel>
                  <Textarea
                    id="edit-description"
                    value={editFormData.description}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, description: e.target.value })
                    }
                    placeholder="Brief description of the project..."
                    rows={4}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-clientName">Client Name</FieldLabel>
                  <Input
                    id="edit-clientName"
                    value={editFormData.clientName}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, clientName: e.target.value })
                    }
                    placeholder="e.g., Metropolitan Development Corp"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-address">Project Address</FieldLabel>
                  <Input
                    id="edit-address"
                    value={editFormData.address}
                    onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                    placeholder="e.g., 123 Main Street, New York, NY 10001"
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="edit-startDate">Start Date</FieldLabel>
                    <Input
                      id="edit-startDate"
                      type="date"
                      value={editFormData.startDate}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, startDate: e.target.value })
                      }
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="edit-endDate">End Date (Optional)</FieldLabel>
                    <Input
                      id="edit-endDate"
                      type="date"
                      value={editFormData.endDate}
                      onChange={(e) => setEditFormData({ ...editFormData, endDate: e.target.value })}
                    />
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="edit-status">Status</FieldLabel>
                  <Select
                    value={editFormData.status}
                    onValueChange={(value: 'active' | 'on_hold' | 'completed') =>
                      setEditFormData({ ...editFormData, status: value })
                    }
                  >
                    <SelectTrigger id="edit-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
            </div>
            <DrawerFooter className="px-0 pb-0">
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setEditDrawerOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isUpdating}>
                  {isUpdating ? 'Saving...' : 'Save changes'}
                </Button>
              </div>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
