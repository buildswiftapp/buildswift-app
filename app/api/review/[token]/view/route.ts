import { createHash } from 'crypto'
import { notFound, ok, serverError } from '@/lib/server/api-response'
import { findDocumentById } from '@/lib/server/document-store'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { writeAuditLog } from '@/lib/server/audit'
import { isDocumentReviewFinal, isReviewCycleTerminal } from '@/lib/server/review-token-policy'

type Params = { params: Promise<{ token: string }> }

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function POST(req: Request, { params }: Params) {
  const { token } = await params
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

  const { data: cycleData, error: cycleErr } = await privilegedDb
    .from('review_cycles')
    .select('document_id,status')
    .eq('id', requestRow.review_cycle_id)
    .single()
  if (cycleErr) return serverError(cycleErr.message)

  const { data: docInfo } = await findDocumentById({
    supabase: privilegedDb,
    id: cycleData?.document_id,
  })

  const isSubmitted = Boolean(requestRow.decided_at)
  if (
    !isSubmitted &&
    docInfo &&
    (isDocumentReviewFinal(docInfo) || isReviewCycleTerminal(cycleData?.status))
  ) {
    return notFound('Invalid review token')
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  const { error: updateError } = await privilegedDb
    .from('review_requests')
    .update({
      viewed_at: new Date().toISOString(),
      viewed_ip: ip,
      email_status: 'viewed',
    })
    .eq('id', requestRow.id)
  if (updateError) return serverError(updateError.message)
  const accountId = docInfo?.account_id
  if (accountId) {
    await writeAuditLog({
      accountId,
      actorType: 'reviewer',
      actorEmail: requestRow.reviewer_email,
      eventType: 'reviewer.viewed',
      documentId: cycleData?.document_id,
      eventData: { review_request_id: requestRow.id },
      ip,
    })
  }

  return ok({ viewed: true })
}
