import { createHash } from 'crypto'
import { badRequest, notFound, ok, serverError } from '@/lib/server/api-response'
import { findDocumentById, updateDocumentStatusesById } from '@/lib/server/document-store'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { reviewDecisionSchema } from '@/lib/server/validators'
import { writeAuditLog } from '@/lib/server/audit'

type Params = { params: Promise<{ token: string }> }

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function POST(req: Request, { params }: Params) {
  const { token } = await params
  const payload = reviewDecisionSchema.safeParse(await req.json().catch(() => ({})))
  if (!payload.success) return badRequest('Invalid payload', payload.error.flatten())

  const supabase = await createSupabaseServerClient()
  if (!supabase) return serverError('Supabase is not configured')

  const hashed = hashToken(token)
  const { data: requestRow, error } = await supabase
    .from('review_requests')
    .select('id,review_cycle_id,reviewer_email')
    .eq('secure_token_hash', hashed)
    .maybeSingle()
  if (error) return serverError(error.message)
  if (!requestRow) return notFound('Invalid review token')

  const { data: cycleData, error: cycleError } = await supabase
    .from('review_cycles')
    .select('document_id')
    .eq('id', requestRow.review_cycle_id)
    .single()
  if (cycleError) return serverError(cycleError.message)

  const { data: docInfo, error: docInfoError } = await findDocumentById({
    supabase,
    id: cycleData.document_id,
  })
  if (docInfoError) return serverError(docInfoError.message)
  if (!docInfo) return notFound('Document not found')
  const docType = docInfo.doc_type
  if (docType === 'change_order' && !payload.data.signature_url) {
    return badRequest('Signature is required for change orders')
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const { error: updateError } = await supabase
    .from('review_requests')
    .update({
      decision: payload.data.decision,
      decision_notes: payload.data.decision_notes ?? null,
      full_name: payload.data.full_name,
      signature_url: payload.data.signature_url ?? null,
      decided_at: new Date().toISOString(),
      decision_ip: ip,
    })
    .eq('id', requestRow.id)
  if (updateError) return serverError(updateError.message)

  // Rollup review status.
  const { data: allRequests, error: allReqError } = await supabase
    .from('review_requests')
    .select('decision,is_overridden')
    .eq('review_cycle_id', requestRow.review_cycle_id)
  if (allReqError) return serverError(allReqError.message)

  const active = (allRequests ?? []).filter((r) => !r.is_overridden)
  const anyRejected = active.some((r) => r.decision === 'reject')
  const allApproved = active.length > 0 && active.every((r) => r.decision === 'approve')
  const pending = active.some((r) => !r.decision)

  const cycleStatus = anyRejected ? 'rejected' : allApproved ? 'approved' : pending ? 'pending' : 'pending'
  const { error: cycleUpdateError } = await supabase
    .from('review_cycles')
    .update({
      status: cycleStatus,
      completed_at: cycleStatus === 'pending' ? null : new Date().toISOString(),
    })
    .eq('id', requestRow.review_cycle_id)
  if (cycleUpdateError) return serverError(cycleUpdateError.message)

  const internalStatus = cycleStatus === 'approved' ? 'approved' : cycleStatus === 'rejected' ? 'rejected' : 'pending_reviewer'
  const externalStatus = cycleStatus === 'approved' ? 'approved' : cycleStatus === 'rejected' ? 'rejected' : 'pending_reviewer'

  const { error: docError } = await updateDocumentStatusesById({
    supabase,
    id: cycleData.document_id,
    internalStatus,
    externalStatus,
  })
  if (docError) return serverError(docError.message)

  const accountId = docInfo.account_id
  if (accountId) {
    await writeAuditLog({
      accountId,
      actorType: 'reviewer',
      actorEmail: requestRow.reviewer_email,
      eventType: 'reviewer.decision_submitted',
      documentId: cycleData.document_id,
      eventData: { decision: payload.data.decision, review_request_id: requestRow.id },
      ip,
    })
  }

  return ok({ success: true, cycle_status: cycleStatus })
}
