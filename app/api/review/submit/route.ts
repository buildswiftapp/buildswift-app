import { createHash, randomUUID } from 'crypto'
import { badRequest, notFound, ok, serverError } from '@/lib/server/api-response'
import { findDocumentById } from '@/lib/server/document-store'
import { writeAuditLog } from '@/lib/server/audit'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import {
  isDocumentReviewFinal,
  isReviewCycleTerminal,
  resolveReviewTokenExpiresAtMs,
} from '@/lib/server/review-token-policy'
import { reviewSubmitSchema } from '@/lib/server/validators'
type DocumentType = 'rfi' | 'submittal' | 'change_order'

const DOCUMENT_TABLE_BY_TYPE: Record<DocumentType, string> = {
  rfi: 'rfi_documents',
  submittal: 'submittal_documents',
  change_order: 'change_order_documents',
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function inferMimeType(dataUrlHeader: string) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64$/.exec(dataUrlHeader)
  return match?.[1] ?? 'image/png'
}

function extensionForMime(mime: string) {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  return 'png'
}

function parseDataUrl(raw: string): { mimeType: string; bytes: Buffer } | null {
  const trimmed = raw.trim()
  const comma = trimmed.indexOf(',')
  if (comma <= 0) return null
  const header = trimmed.slice(0, comma)
  const base64Part = trimmed.slice(comma + 1)
  if (!header.includes(';base64')) return null
  const mimeType = inferMimeType(header)
  const bytes = Buffer.from(base64Part, 'base64')
  if (!bytes.length) return null
  return { mimeType, bytes }
}

async function uploadSignatureImage(rawDataUrl: string, tokenHash: string) {
  const parsed = parseDataUrl(rawDataUrl)
  if (!parsed) return { url: null, error: 'Invalid signature_image format. Expected base64 data URL.' }
  if (parsed.bytes.length > 1_500_000) {
    return { url: null, error: 'Signature image is too large (max 1.5MB).' }
  }

  const admin = createSupabaseAdminClient()
  if (!admin) {
    return { url: null, error: 'SUPABASE_SERVICE_ROLE_KEY is required to upload signature images.' }
  }

  const bucket = process.env.REVIEW_SIGNATURES_BUCKET || 'document-attachments'
  const ext = extensionForMime(parsed.mimeType)
  const storagePath = `review-signatures/${tokenHash.slice(0, 12)}/${Date.now()}-${randomUUID()}.${ext}`

  const { error: uploadError } = await admin.storage.from(bucket).upload(storagePath, parsed.bytes, {
    contentType: parsed.mimeType,
    upsert: false,
  })
  if (uploadError) return { url: null, error: uploadError.message }

  const { data } = admin.storage.from(bucket).getPublicUrl(storagePath)
  return { url: data.publicUrl || storagePath, error: null }
}

export async function POST(req: Request) {
  const payload = reviewSubmitSchema.safeParse(await req.json().catch(() => ({})))
  if (!payload.success) return badRequest('Invalid payload', payload.error.flatten())

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  const limiter = enforceRateLimit({
    key: `review-submit:${ip}:${payload.data.token.slice(0, 24)}`,
    limit: 6,
    windowMs: 60_000,
  })
  if (!limiter.allowed) {
    return badRequest('Too many submission attempts. Please wait a minute and try again.')
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return serverError('Supabase is not configured')
  const privilegedDb = createSupabaseAdminClient() ?? supabase

  const tokenHash = hashToken(payload.data.token)
  const { data: requestRow, error: requestError } = await privilegedDb
    .from('review_requests')
    .select('id,review_cycle_id,reviewer_email,decided_at,token_expires_at,created_at')
    .eq('secure_token_hash', tokenHash)
    .maybeSingle()
  if (requestError) return serverError(requestError.message)
  if (!requestRow) return notFound('Invalid review token')
  if (requestRow.decided_at) return badRequest('This review has already been submitted')

  const { data: cycleForGuard, error: cycleGuardErr } = await privilegedDb
    .from('review_cycles')
    .select('document_id,status')
    .eq('id', requestRow.review_cycle_id)
    .single()
  if (cycleGuardErr) return serverError(cycleGuardErr.message)
  const { data: docForGuard, error: docGuardErr } = await findDocumentById({
    supabase: privilegedDb,
    id: cycleForGuard.document_id,
  })
  if (docGuardErr) return serverError(docGuardErr.message)
  if (
    docForGuard &&
    (isDocumentReviewFinal(docForGuard) || isReviewCycleTerminal(cycleForGuard.status))
  ) {
    return badRequest('This review is closed. The document is no longer accepting responses.')
  }

  const expiresAt = resolveReviewTokenExpiresAtMs({
    tokenExpiresAt: requestRow.token_expires_at,
    createdAt: requestRow.created_at,
  })
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    const admin = createSupabaseAdminClient()
    if (admin) {
      await (admin.from('review_requests' as any) as any).update({ email_status: 'expired' }).eq('id', requestRow.id)
    } else {
      await (privilegedDb.from('review_requests' as any) as any).update({ email_status: 'expired' }).eq('id', requestRow.id)
    }
    return badRequest('This review link has expired. Please contact the sender for a new link.')
  }

  let signatureImageUrl: string | null = null
  if (payload.data.signature_image) {
    const uploaded = await uploadSignatureImage(payload.data.signature_image, tokenHash)
    if (uploaded.error) return badRequest(uploaded.error)
    signatureImageUrl = uploaded.url
  }

  const mappedDecision = payload.data.decision === 'approved' ? 'approve' : 'reject'
  const { data: updatedRequest, error: updateError } = await privilegedDb
    .from('review_requests')
    .update({
      decision: mappedDecision,
      decision_notes: payload.data.notes ?? null,
      full_name: payload.data.signature_name,
      signature_url: signatureImageUrl,
      decision_ip: ip,
      decided_at: new Date().toISOString(),
    })
    .eq('id', requestRow.id)
    .is('decided_at', null)
    .select('id')
    .maybeSingle()
  if (updateError) return serverError(updateError.message)
  if (!updatedRequest) return badRequest('This review has already been submitted')

  const { data: cycleData, error: cycleError } = await privilegedDb
    .from('review_cycles')
    .select('document_id')
    .eq('id', requestRow.review_cycle_id)
    .single()
  if (cycleError) return serverError(cycleError.message)

  const { data: docInfo, error: docInfoError } = await findDocumentById({
    supabase: privilegedDb,
    id: cycleData.document_id,
  })
  if (docInfoError) return serverError(docInfoError.message)
  if (!docInfo) return notFound('Document not found')

  const { data: allRequests, error: allReqError } = await privilegedDb
    .from('review_requests')
    .select('decision,is_overridden')
    .eq('review_cycle_id', requestRow.review_cycle_id)
  if (allReqError) return serverError(allReqError.message)

  const active = (allRequests ?? []).filter((r) => !r.is_overridden)
  const anyRejected = active.some((r) => r.decision === 'reject')
  const anyPending = active.some((r) => !r.decision)
  const allApproved = active.length > 0 && !anyPending && active.every((r) => r.decision === 'approve')
  const cycleStatus = anyRejected ? 'rejected' : allApproved ? 'approved' : 'pending'

  const { error: cycleUpdateError } = await privilegedDb
    .from('review_cycles')
    .update({
      status: cycleStatus,
      completed_at: cycleStatus === 'pending' ? null : new Date().toISOString(),
    })
    .eq('id', requestRow.review_cycle_id)
  if (cycleUpdateError) return serverError(cycleUpdateError.message)

  // Rule 3: if not all responded yet and no rejection, keep current "sent/in_review" state.
  if (cycleStatus !== 'pending') {
    const internalStatus = cycleStatus === 'approved' ? 'approved' : 'rejected'
    const externalStatus = cycleStatus === 'approved' ? 'approved' : 'rejected'
    const { error: docError } = await privilegedDb
      .from(DOCUMENT_TABLE_BY_TYPE[docInfo.doc_type as DocumentType])
      .update({ internal_status: internalStatus, external_status: externalStatus })
      .eq('id', cycleData.document_id)
    if (docError) return serverError(docError.message)

    // Status history equivalent in this codebase: audit log transition row.
    await writeAuditLog({
      accountId: docInfo.account_id,
      actorType: 'reviewer',
      actorEmail: requestRow.reviewer_email,
      eventType: 'document.status_changed',
      documentId: cycleData.document_id,
      eventData: {
        from_internal_status: docInfo.internal_status,
        from_external_status: docInfo.external_status,
        to_internal_status: internalStatus,
        to_external_status: externalStatus,
        note: cycleStatus === 'approved' ? 'All reviewers approved' : 'At least one reviewer rejected',
      },
      ip,
    })
  }

  if (docInfo?.account_id) {
    await writeAuditLog({
      accountId: docInfo.account_id,
      actorType: 'reviewer',
      actorEmail: requestRow.reviewer_email,
      eventType: 'reviewer.decision_submitted',
      documentId: cycleData.document_id,
      eventData: { decision: mappedDecision, review_request_id: requestRow.id },
      ip,
    })
  }

  return ok({
    success: true,
    cycle_status: cycleStatus,
    document_status: cycleStatus === 'pending' ? 'sent' : 'final',
    signature_image_url: signatureImageUrl,
  })
}
