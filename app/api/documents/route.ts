import { badRequest, created, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { syncDocumentAttachments } from '@/lib/server/attachments'
import { insertDocument, listDocuments } from '@/lib/server/document-store'
import { writeAuditLog } from '@/lib/server/audit'
import {
  assertCanCreateDocument,
  incrementMonthlyDocumentUsage,
} from '@/lib/server/billing'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { createDocumentSchema } from '@/lib/server/validators'

export async function GET(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return ok({ documents: [] })

  // Match POST: prefer service role so RLS cannot hide rows for this account.
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const url = new URL(req.url)
  const docType = url.searchParams.get('doc_type')
  const projectId = url.searchParams.get('project_id')

  const { data, error } = await listDocuments({
    supabase,
    accountId: auth.accountId,
    docType,
    projectId,
  })
  if (error) return serverError(error.message)
  return ok({ documents: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) {
    return badRequest(
      'Account context is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY and ensure account bootstrap tables are migrated.'
    )
  }

  // Prefer service role when configured: avoids broken tenant RLS (e.g. policies
  // referencing subscription_status) while we still enforce account via this handler.
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const parsed = createDocumentSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten())
  const body = parsed.data

  const { data: projectRow, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('id', body.project_id)
    .eq('account_id', auth.accountId)
    .maybeSingle()
  if (projectError) return serverError(projectError.message)
  if (!projectRow) return badRequest('Project not found or access denied')

  const permission = await assertCanCreateDocument(supabase as any, auth.accountId)
  if (!permission.ok) return badRequest(permission.reason)

  const { data: doc, error } = await insertDocument({
    supabase,
    docType: body.doc_type,
    row: {
      account_id: auth.accountId,
      project_id: body.project_id,
      doc_number: body.doc_number || null,
      title: body.title,
      description: body.description,
      internal_status: body.save_as_draft ? 'draft' : 'in_review',
      external_status: body.save_as_draft ? 'draft' : 'sent',
      created_by: auth.user.id,
      current_version_no: 1,
    },
  })

  if (error) {
    const msg = error.message
    if (
      msg.includes('subscriptions') ||
      msg.includes('usage_counters_monthly') ||
      msg.includes('billing_events')
    ) {
      return serverError(
        `${msg} Run migrations 000006 and 000007 (drop stale RLS/triggers for removed billing tables), or set SUPABASE_SERVICE_ROLE_KEY to bypass RLS.`
      )
    }
    return serverError(msg)
  }

  const { data: version, error: versionError } = await supabase
    .from('document_versions')
    .insert({
      document_id: doc.id,
      version_no: 1,
      title: body.title,
      description: body.description,
      metadata: body.metadata,
      created_by: auth.user.id,
    })
    .select('id')
    .single()
  if (versionError) return serverError(versionError.message)

  const attachmentError = await syncDocumentAttachments({
    supabase,
    accountId: auth.accountId,
    documentId: doc.id,
    documentVersionId: version?.id ?? null,
    uploadedBy: auth.user.id,
    attachmentsRaw: body.metadata?.attachments,
  })
  if (attachmentError) return serverError(attachmentError.message)

  await incrementMonthlyDocumentUsage(supabase as any, auth.accountId)

  await writeAuditLog(
    {
      accountId: auth.accountId,
      actorType: 'user',
      actorUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      eventType: 'document.created',
      documentId: doc.id,
      projectId: doc.project_id,
      eventData: { doc_type: doc.doc_type, title: doc.title },
    },
    supabase
  )

  return created({ document: doc })
}
