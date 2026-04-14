'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus,
  FileQuestion,
  FileCheck,
  FilePen,
  Calendar,
  MapPin,
  Users,
  FileText,
  MoreHorizontal,
  Trash2,
  Edit,
  Clock,
} from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { projects, documents, deleteDocument, updateProject } = useApp()

  const project = projects.find((p) => p.id === id)
  const projectDocuments = documents.filter((d) => d.projectId === id)
  const [editDrawerOpen, setEditDrawerOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editFormData, setEditFormData] = useState({
    name: project?.name || '',
    description: project?.description || '',
    clientName: project?.clientName || '',
    address: project?.address || '',
    status: (project?.status || 'active') as 'active' | 'on_hold' | 'completed',
    startDate: project?.startDate || '',
    endDate: project?.endDate || '',
  })

  const documentsByType = {
    rfi: projectDocuments.filter((d) => d.type === 'rfi'),
    submittal: projectDocuments.filter((d) => d.type === 'submittal'),
    change_order: projectDocuments.filter((d) => d.type === 'change_order'),
  }

  if (!project) {
    return (
      <div className="flex flex-col">
        <div className="flex-1 p-6">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Project not found</EmptyTitle>
              <EmptyDescription>
                The project you are looking for does not exist.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link href="/projects">Back to Projects</Link>
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      </div>
    )
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { className: string; label: string }> = {
      active: { className: 'bg-emerald-100 text-emerald-800', label: 'Active' },
      completed: { className: 'bg-primary/10 text-primary', label: 'Completed' },
      on_hold: { className: 'bg-slate-100 text-slate-800', label: 'On Hold' },
    }
    const style = styles[status] || styles.active
    return <Badge className={style.className}>{style.label}</Badge>
  }

  const getDocStatusBadge = (status: string) => {
    const styles: Record<string, { className: string; label: string }> = {
      draft: { className: 'bg-muted text-muted-foreground', label: 'Draft' },
      pending_review: { className: 'bg-slate-100 text-slate-800', label: 'Pending' },
      approved: { className: 'bg-emerald-100 text-emerald-800', label: 'Approved' },
      rejected: { className: 'bg-red-100 text-red-800', label: 'Rejected' },
      revision_requested: { className: 'bg-violet-100 text-violet-800', label: 'Revision' },
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

  const DocumentList = ({ docs, type }: { docs: typeof projectDocuments; type: string }) => {
    if (docs.length === 0) {
      return (
        <Empty>
          <EmptyMedia variant="icon">{getDocumentTypeIcon(type)}</EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              {`No ${type === 'rfi' ? 'RFIs' : type === 'submittal' ? 'Submittals' : 'Change Orders'} yet`}
            </EmptyTitle>
            <EmptyDescription>Create your first document to get started</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild size="sm">
              <Link href={`/documents/new?type=${type}&project=${id}`}>
                <Plus className="mr-2 h-4 w-4" />
                Create {type === 'rfi' ? 'RFI' : type === 'submittal' ? 'Submittal' : 'Change Order'}
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      )
    }

    return (
      <div className="space-y-3">
        {docs.map((doc) => (
          <Link
            key={doc.id}
            href={`/documents/${doc.id}`}
            className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {getDocumentTypeIcon(doc.type)}
              </div>
              <div>
                <p className="font-medium">{doc.title}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{formatDate(doc.updatedAt)}</span>
                  {doc.dueDate && (
                    <>
                      <span>·</span>
                      <span>Due {formatDate(doc.dueDate)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {getDocStatusBadge(doc.status)}
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault()
                      deleteDocument(doc.id)
                    }}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Link>
        ))}
      </div>
    )
  }

  const openEditDrawer = () => {
    setEditFormData({
      name: project.name,
      description: project.description || '',
      clientName: project.clientName || '',
      address: project.address || '',
      status: project.status,
      startDate: project.startDate || '',
      endDate: project.endDate || '',
    })
    setEditDrawerOpen(true)
  }

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editFormData.name.trim()) {
      toast.error('Project name is required')
      return
    }

    setIsSaving(true)
    try {
      updateProject(project.id, {
        name: editFormData.name,
        description: editFormData.description,
        clientName: editFormData.clientName,
        address: editFormData.address,
        status: editFormData.status,
        startDate: editFormData.startDate,
        endDate: editFormData.endDate || undefined,
      })
      toast.success('Project updated successfully')
      setEditDrawerOpen(false)
    } catch {
      toast.error('Failed to update project')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex-1 space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{project.name}</h1>
              {getStatusBadge(project.status)}
            </div>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              {project.description}
            </p>
          </div>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Document
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/documents/new?type=rfi&project=${id}`}>
                    <FileQuestion className="mr-2 h-4 w-4" />
                    New RFI
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/documents/new?type=submittal&project=${id}`}>
                    <FileCheck className="mr-2 h-4 w-4" />
                    New Submittal
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/change-orders/new?project=${id}`}>
                    <FilePen className="mr-2 h-4 w-4" />
                    New Change Order
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Client</p>
                <p className="font-semibold">{project.clientName || 'Not specified'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Location</p>
                <p className="font-semibold">{project.address || 'Not specified'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Timeline</p>
                <p className="font-semibold">
                  {formatDate(project.startDate)}
                  {project.endDate && ` - ${formatDate(project.endDate)}`}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">All ({projectDocuments.length})</TabsTrigger>
            <TabsTrigger value="rfi">RFIs ({documentsByType.rfi.length})</TabsTrigger>
            <TabsTrigger value="submittal">Submittals ({documentsByType.submittal.length})</TabsTrigger>
            <TabsTrigger value="change_order">Change Orders ({documentsByType.change_order.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <Card>
              <CardHeader>
                <CardTitle>All Documents</CardTitle>
                <CardDescription>All documents for this project</CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentList docs={projectDocuments} type="all" />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rfi">
            <Card>
              <CardHeader>
                <CardTitle>Requests for Information</CardTitle>
                <CardDescription>Questions and clarifications for the design team</CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentList docs={documentsByType.rfi} type="rfi" />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="submittal">
            <Card>
              <CardHeader>
                <CardTitle>Submittals</CardTitle>
                <CardDescription>Product and material submissions for approval</CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentList docs={documentsByType.submittal} type="submittal" />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="change_order">
            <Card>
              <CardHeader>
                <CardTitle>Change Orders</CardTitle>
                <CardDescription>Contract modifications and scope changes</CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentList docs={documentsByType.change_order} type="change_order" />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      </div>

      <Drawer direction="right" open={editDrawerOpen} onOpenChange={setEditDrawerOpen}>
        <DrawerContent className="max-w-[95vw] data-[vaul-drawer-direction=right]:w-[560px] sm:data-[vaul-drawer-direction=right]:max-w-none">
          <DrawerHeader>
            <DrawerTitle>Edit Project</DrawerTitle>
            <DrawerDescription>
              Update the original project information.
            </DrawerDescription>
          </DrawerHeader>
          <form onSubmit={handleUpdateProject} className="flex h-full flex-col px-4 pb-4">
            <div className="flex-1 overflow-y-auto">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="edit-name">Project Name *</FieldLabel>
                  <Input
                    id="edit-name"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-description">Description</FieldLabel>
                  <Textarea
                    id="edit-description"
                    value={editFormData.description}
                    onChange={(e) =>
                      setEditFormData((prev) => ({ ...prev, description: e.target.value }))
                    }
                    rows={4}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-client">Client Name</FieldLabel>
                  <Input
                    id="edit-client"
                    value={editFormData.clientName}
                    onChange={(e) =>
                      setEditFormData((prev) => ({ ...prev, clientName: e.target.value }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-address">Project Address</FieldLabel>
                  <Input
                    id="edit-address"
                    value={editFormData.address}
                    onChange={(e) => setEditFormData((prev) => ({ ...prev, address: e.target.value }))}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="edit-start-date">Start Date</FieldLabel>
                    <Input
                      id="edit-start-date"
                      type="date"
                      value={editFormData.startDate}
                      onChange={(e) =>
                        setEditFormData((prev) => ({ ...prev, startDate: e.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="edit-end-date">End Date (Optional)</FieldLabel>
                    <Input
                      id="edit-end-date"
                      type="date"
                      value={editFormData.endDate}
                      onChange={(e) => setEditFormData((prev) => ({ ...prev, endDate: e.target.value }))}
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="edit-status">Status</FieldLabel>
                  <Select
                    value={editFormData.status}
                    onValueChange={(value: 'active' | 'on_hold' | 'completed') =>
                      setEditFormData((prev) => ({ ...prev, status: value }))
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
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
