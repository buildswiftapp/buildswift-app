import { createHash } from 'crypto'
import { badRequest, notFound, ok, serverError } from '@/lib/server/api-response'
import { findDocumentById } from '@/lib/server/document-store'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { reviewDecisionSchema } from '@/lib/server/validators'
import { writeAuditLog } from '@/lib/server/audit'
import { isDocumentReviewFinal, isReviewCycleTerminal } from '@/lib/server/review-token-policy'
import {
  legacyDecisionForOutcome,
  normalizeReviewerOutcome,
  statusOnReviewerOutcome,
  type DocType,
} from '@/lib/status'

type Params = { params: Promise<{ token: string }> }
type DocumentType = 'rfi' | 'submittal' | 'change_order'

const DOCUMENT_TABLE_BY_TYPE: Record<DocumentType, string> = {
  rfi: 'rfi_documents',
  submittal: 'submittal_documents',
  change_order: 'change_order_documents',
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function POST(req: Request, { params }: Params) {
  const { token } = await params
  const payload = reviewDecisionSchema.safeParse(await req.json().catch(() => ({})))
  if (!payload.success) return badRequest('Invalid payload', payload.error.flatten())

  const supabase = await createSupabaseServerClient()
  if (!supabase) return serverError('Supabase is not configured')
  const privilegedDb = createSupabaseAdminClient() ?? supabase

  const hashed = hashToken(token)
  const { data: requestRow, error } = await privilegedDb
    .from('review_requests')
    .select('id,review_cycle_id,reviewer_email,decided_at')
    .eq('secure_token_hash', hashed)
    .maybeSingle()
  if (error) return serverError(error.message)
  if (!requestRow) return notFound('Invalid review token')
  if (requestRow.decided_at) return badRequest('This review has already been submitted')

  const { data: cycleData, error: cycleError } = await privilegedDb
    .from('review_cycles')
    .select('document_id,status')
    .eq('id', requestRow.review_cycle_id)
    .single()
  if (cycleError) return serverError(cycleError.message)

  const { data: docInfo, error: docInfoError } = await findDocumentById({
    supabase: privilegedDb,
    id: cycleData.document_id,
  })
  if (docInfoError) return serverError(docInfoError.message)
  if (!docInfo) return notFound('Document not found')
  if (isDocumentReviewFinal(docInfo) || isReviewCycleTerminal(cycleData.status)) {
    return badRequest('This review is closed. The document is no longer accepting responses.')
  }
  const docType = docInfo.doc_type as DocType
  if (docType === 'change_order' && !payload.data.signature_url) {
    return badRequest('Signature is required for change orders')
  }

  const canonicalOutcome = normalizeReviewerOutcome(docType, payload.data.decision)
  if (!canonicalOutcome) {
    return badRequest(
      `Invalid decision "${payload.data.decision}" for ${docType}. Allowed reviewer outcomes vary by document type.`
    )
  }
  const legacyDecision = legacyDecisionForOutcome(canonicalOutcome)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const { error: updateError } = await privilegedDb
    .from('review_requests')
    .update({
      decision: legacyDecision,
      outcome: canonicalOutcome,
      decision_notes: payload.data.decision_notes ?? null,
      full_name: payload.data.full_name,
      signature_url: payload.data.signature_url ?? null,
      decided_at: new Date().toISOString(),
      decision_ip: ip,
    })
    .eq('id', requestRow.id)
  if (updateError) return serverError(updateError.message)

  const { data: allRequests, error: allReqError } = await privilegedDb
    .from('review_requests')
    .select('decision,is_overridden')
    .eq('review_cycle_id', requestRow.review_cycle_id)
  if (allReqError) return serverError(allReqError.message)

  const active = (allRequests ?? []).filter((r) => !r.is_overridden)
  const anyRejected = active.some((r) => r.decision === 'reject')
  const allApproved = active.length > 0 && active.every((r) => r.decision === 'approve')
  const pending = active.some((r) => !r.decision)

  const cycleStatus = anyRejected ? 'rejected' : allApproved ? 'approved' : pending ? 'pending' : 'pending'
  const { error: cycleUpdateError } = await privilegedDb
    .from('review_cycles')
    .update({
      status: cycleStatus,
      completed_at: cycleStatus === 'pending' ? null : new Date().toISOString(),
    })
    .eq('id', requestRow.review_cycle_id)
  if (cycleUpdateError) return serverError(cycleUpdateError.message)

  const internalStatus =
    cycleStatus === 'approved' ? 'approved' : cycleStatus === 'rejected' ? 'rejected' : 'pending_reviewer'
  const externalStatus =
    cycleStatus === 'approved' ? 'approved' : cycleStatus === 'rejected' ? 'rejected' : 'pending_reviewer'

  const previousDocStatus = (docInfo as { status?: string | null }).status ?? null
  const canonicalDocStatus = statusOnReviewerOutcome(docType, canonicalOutcome)

  const { error: docError } = await privilegedDb
    .from(DOCUMENT_TABLE_BY_TYPE[docInfo.doc_type as DocumentType])
    .update({
      status: canonicalDocStatus,
      internal_status: internalStatus,
      external_status: externalStatus,
    })
    .eq('id', cycleData.document_id)
  if (docError) return serverError(docError.message)

  const accountId = docInfo.account_id
  if (accountId) {
    await writeAuditLog({
      accountId,
      actorType: 'reviewer',
      actorEmail: requestRow.reviewer_email,
      eventType: 'reviewer.decision_submitted',
      documentId: cycleData.document_id,
      eventData: {
        decision: legacyDecision,
        outcome: canonicalOutcome,
        review_request_id: requestRow.id,
        from_status: previousDocStatus,
        to_status: canonicalDocStatus,
      },
      ip,
    })

    if (previousDocStatus !== canonicalDocStatus) {
      await writeAuditLog({
        accountId,
        actorType: 'reviewer',
        actorEmail: requestRow.reviewer_email,
        eventType: 'document.status_changed',
        documentId: cycleData.document_id,
        eventData: {
          from_status: previousDocStatus,
          to_status: canonicalDocStatus,
          reason: 'reviewer_decision',
          outcome: canonicalOutcome,
        },
        ip,
      })
    }
  }

  return ok({
    success: true,
    cycle_status: cycleStatus,
    outcome: canonicalOutcome,
    document_status: canonicalDocStatus,
  })
}
