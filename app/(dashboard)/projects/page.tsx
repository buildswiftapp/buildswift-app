'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Plus,
  Search,
  MoreHorizontal,
  FolderKanban,
  Calendar,
  Users,
  FileText,
  Trash2,
  Edit,
  Archive,
} from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

export default function ProjectsPage() {
  const { projects, deleteProject, updateProject, addProject, user } = useApp()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editDrawerOpen, setEditDrawerOpen] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [formData, setFormData] = useState(emptyForm)
  const [editFormData, setEditFormData] = useState(emptyForm)

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { className: string; label: string }> = {
      active: { className: 'bg-emerald-100 text-emerald-800', label: 'Active' },
      completed: { className: 'bg-primary/10 text-primary', label: 'Completed' },
      on_hold: { className: 'bg-slate-100 text-slate-800', label: 'On Hold' },
    }
    const style = styles[status] || styles.active
    return <Badge className={style.className}>{style.label}</Badge>
  }

  const handleDeleteProject = (id: string) => {
    setProjectToDelete(id)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (projectToDelete) {
      deleteProject(projectToDelete)
      setProjectToDelete(null)
    }
    setDeleteDialogOpen(false)
  }

  const handleArchiveProject = (id: string) => {
    updateProject(id, { status: 'completed' })
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
      updateProject(editingProjectId, {
        name: editFormData.name,
        description: editFormData.description,
        clientName: editFormData.clientName || undefined,
        address: editFormData.address || undefined,
        status: editFormData.status,
        startDate: editFormData.startDate,
        endDate: editFormData.endDate || undefined,
      })
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
      addProject({
        name: formData.name,
        description: formData.description,
        clientName: formData.clientName,
        address: formData.address,
        status: formData.status,
        startDate: formData.startDate,
        endDate: formData.endDate || undefined,
        companyId: user?.companyId || 'company-1',
        teamMembers: [user?.id || 'user-1'],
      })
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-4">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
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
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setDrawerOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Project
          </Button>
        </div>

        {filteredProjects.length === 0 ? (
          <Empty>
            <EmptyMedia variant="icon">
              <FolderKanban className="h-10 w-10" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No projects found</EmptyTitle>
              <EmptyDescription>
                {searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Create your first project to get started'}
              </EmptyDescription>
            </EmptyHeader>
            {!searchQuery && statusFilter === 'all' ? (
              <EmptyContent>
                <Button asChild>
                  <button type="button" onClick={() => setDrawerOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Project
                  </button>
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <Card key={project.id} className="group relative transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <Link href={`/projects/${project.id}`}>
                        <CardTitle className="text-lg hover:text-primary transition-colors">
                          {project.name}
                        </CardTitle>
                      </Link>
                      <CardDescription className="mt-1 line-clamp-2">
                        {project.description}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="h-4 w-4" />
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
                        {project.status !== 'completed' && (
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
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {project.clientName && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>{project.clientName}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>Started {formatDate(project.startDate)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      <span>{project.documentsCount} documents</span>
                    </div>
                    <div className="pt-2">
                      {getStatusBadge(project.status)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
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
