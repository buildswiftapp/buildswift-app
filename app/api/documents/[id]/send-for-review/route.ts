import { createHash, randomUUID } from 'crypto'
import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { findDocumentById, updateDocumentStatusesById } from '@/lib/server/document-store'
import { writeAuditLog } from '@/lib/server/audit'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { sendForReviewSchema } from '@/lib/server/validators'

type Params = { params: Promise<{ id: string }> }

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function POST(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()

  const { id } = await params
  const payload = sendForReviewSchema.safeParse(await req.json().catch(() => ({})))
  if (!payload.success) return badRequest('Invalid payload', payload.error.flatten())

  const supabase = await createSupabaseServerClient()
  if (!supabase) return serverError('Supabase is not configured')

  const { data: document, error: docError } = await findDocumentById({
    supabase,
    id,
    accountId: auth.accountId,
  })
  if (docError) return serverError(docError.message)
  if (!document) return badRequest('Document not found')

  const { data: version, error: versionError } = await supabase
    .from('document_versions')
    .select('id')
    .eq('document_id', id)
    .eq('version_no', document.current_version_no)
    .single()
  if (versionError) return serverError(versionError.message)

  const { data: lastCycle } = await supabase
    .from('review_cycles')
    .select('cycle_no')
    .eq('document_id', id)
    .order('cycle_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  const cycleNo = (lastCycle?.cycle_no ?? 0) + 1
  const { data: cycle, error: cycleError } = await supabase
    .from('review_cycles')
    .insert({
      document_id: id,
      document_version_id: version.id,
      cycle_no: cycleNo,
      status: 'sent',
      sent_by: auth.user.id,
      sent_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (cycleError) return serverError(cycleError.message)

  const requestRows = payload.data.reviewers.map((email) => {
    const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')
    return {
      review_cycle_id: cycle.id,
      reviewer_email: email.toLowerCase(),
      secure_token_hash: hashToken(token),
      token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      email_status: 'sent',
      _token: token,
    }
  })

  const { error: requestError } = await supabase.from('review_requests').insert(
    requestRows.map((row) => ({
      review_cycle_id: row.review_cycle_id,
      reviewer_email: row.reviewer_email,
      secure_token_hash: row.secure_token_hash,
      token_expires_at: row.token_expires_at,
      email_status: row.email_status,
    }))
  )
  if (requestError) return serverError(requestError.message)

  const { error: docUpdateError } = await updateDocumentStatusesById({
    supabase,
    id,
    internalStatus: 'in_review',
    externalStatus: 'sent',
  })
  if (docUpdateError) return serverError(docUpdateError.message)

  await writeAuditLog({
    accountId: auth.accountId,
    actorType: 'user',
    actorUserId: auth.user.id,
    eventType: 'document.sent_for_review',
    documentId: id,
    projectId: document.project_id,
    eventData: { reviewer_count: payload.data.reviewers.length, cycle_no: cycleNo },
  })

  return ok({
    cycle_id: cycle.id,
    reviewers: requestRows.map(({ reviewer_email, _token }) => ({ reviewer_email, token: _token })),
  })
}
