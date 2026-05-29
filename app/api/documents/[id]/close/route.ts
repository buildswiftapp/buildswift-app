import {
  badRequest,
  notFound,
  ok,
  serverError,
  unauthorized,
} from '@/lib/server/api-response'
import { writeAuditLog } from '@/lib/server/audit'
import { getAuthContext } from '@/lib/server/auth'
import {
  findDocumentById,
  updateDocumentStatusOnly,
} from '@/lib/server/document-store'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { closeDocumentSchema } from '@/lib/server/validators'
import { canClose, statusOnClose, type DocType } from '@/lib/status'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) {
    return badRequest(
      'Account context is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY and ensure your account row exists in the database.'
    )
  }

  const { id } = await params

  const parsed = closeDocumentSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten())

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const { data: existing, error: existingError } = await findDocumentById({
    supabase,
    id,
    accountId: auth.accountId,
  })
  if (existingError) return serverError(existingError.message)
  if (!existing) return notFound('Document not found')

  const docType = existing.doc_type as DocType
  const previousStatus = (existing as { status?: string | null }).status ?? null

  if (!canClose(docType, previousStatus)) {
    return badRequest('Document is already closed.')
  }

  const nextStatus = statusOnClose(docType)

  const { data: updated, error: updateError } = await updateDocumentStatusOnly({
    supabase,
    id,
    accountId: auth.accountId,
    status: nextStatus,
  })
  if (updateError) return serverError(updateError.message)
  if (!updated) return serverError('Failed to close document')

  await writeAuditLog(
    {
      accountId: auth.accountId,
      actorType: 'user',
      actorUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      eventType: 'document.closed',
      documentId: id,
      projectId: existing.project_id,
      eventData: {
        from_status: previousStatus,
        to_status: nextStatus,
        note: parsed.data.note ?? null,
      },
    },
    supabase
  )

  if (previousStatus !== nextStatus) {
    await writeAuditLog(
      {
        accountId: auth.accountId,
        actorType: 'user',
        actorUserId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        eventType: 'document.status_changed',
        documentId: id,
        projectId: existing.project_id,
        eventData: {
          from_status: previousStatus,
          to_status: nextStatus,
          reason: 'manual_close',
          note: parsed.data.note ?? null,
        },
      },
      supabase
    )
  }

  return ok({ document: updated })
}
