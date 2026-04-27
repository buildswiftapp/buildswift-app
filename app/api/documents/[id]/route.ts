import { badRequest, notFound, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { syncDocumentAttachments } from '@/lib/server/attachments'
import {
  deleteDocument,
  findDocumentById,
  updateDocument,
} from '@/lib/server/document-store'
import { writeAuditLog } from '@/lib/server/audit'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { updateDocumentSchema } from '@/lib/server/validators'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) {
    return badRequest(
      'Account context is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY and ensure your account row exists in the database.'
    )
  }
  const { id } = await params

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const { data: document, error } = await findDocumentById({
    supabase,
    id,
    accountId: auth.accountId,
  })

  if (error) return serverError(error.message)
  if (!document) return notFound('Document not found')
  const { data: versions, error: versionsError } = await supabase
    .from('document_versions')
    .select('*')
    .eq('document_id', id)
    .order('version_no', { ascending: false })
  if (versionsError) return serverError(versionsError.message)
  const { data: attachments, error: attachmentsError } = await supabase
    .from('attachments')
    .select('*')
    .eq('document_id', id)
    .order('created_at', { ascending: false })
  if (attachmentsError) return serverError(attachmentsError.message)
  return ok({ document: { ...document, document_versions: versions ?? [], attachments: attachments ?? [] } })
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) {
    return badRequest(
      'Account context is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY and ensure your account row exists in the database.'
    )
  }
  const { id } = await params

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const parsed = updateDocumentSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten())
  const payload = parsed.data

  const { data: existing, error: existingError } = await findDocumentById({
    supabase,
    id,
    accountId: auth.accountId,
  })

  if (existingError) return serverError(existingError.message)
  if (!existing) return notFound('Document not found')

  const updates: Record<string, unknown> = {}
  if (typeof payload.title !== 'undefined') updates.title = payload.title
  if (typeof payload.doc_number !== 'undefined') updates.doc_number = payload.doc_number
  if (typeof payload.description !== 'undefined') updates.description = payload.description
  if (typeof payload.internal_status !== 'undefined') updates.internal_status = payload.internal_status
  if (typeof payload.external_status !== 'undefined') updates.external_status = payload.external_status

  let nextVersion = existing.current_version_no
  if (payload.increment_version) {
    nextVersion = existing.current_version_no + 1
    updates.current_version_no = nextVersion
  }

  const { data: updated, error: updateError } = await updateDocument({
    supabase,
    id,
    accountId: auth.accountId,
    updates,
  })

  if (updateError) return serverError(updateError.message)

  if (payload.increment_version || payload.description || payload.title || payload.metadata) {
    const { data: version, error: versionError } = await supabase
      .from('document_versions')
      .insert({
        document_id: id,
        version_no: nextVersion,
        title: payload.title ?? existing.title,
        description: payload.description ?? existing.description,
        metadata: payload.metadata ?? {},
        created_by: auth.user.id,
      })
      .select('id')
      .single()
    if (versionError) return serverError(versionError.message)

    if (payload.metadata && typeof payload.metadata === 'object' && 'attachments' in payload.metadata) {
      const attachmentError = await syncDocumentAttachments({
        supabase,
        accountId: auth.accountId,
        documentId: id,
        documentVersionId: version?.id ?? null,
        uploadedBy: auth.user.id,
        attachmentsRaw: payload.metadata.attachments,
      })
      if (attachmentError) return serverError(attachmentError.message)
    }
  }

  await writeAuditLog(
    {
      accountId: auth.accountId,
      actorType: 'user',
      actorUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      eventType: 'document.updated',
      documentId: id,
      projectId: existing.project_id,
      eventData: updates,
    },
    supabase
  )

  return ok({ document: updated })
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) {
    return badRequest(
      'Account context is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY and ensure your account row exists in the database.'
    )
  }
  const { id } = await params
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const { data, error } = await deleteDocument({
    supabase,
    id,
    accountId: auth.accountId,
  })
  if (error) return serverError(error.message)
  if (!data) return notFound('Document not found')

  await writeAuditLog(
    {
      accountId: auth.accountId,
      actorType: 'user',
      actorUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      eventType: 'document.deleted',
      documentId: id,
      projectId: data.project_id,
    },
    supabase
  )

  return ok({ success: true })
}
