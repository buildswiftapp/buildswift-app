import { createHash } from 'crypto'
import { notFound, ok, serverError } from '@/lib/server/api-response'
import { findDocumentById } from '@/lib/server/document-store'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { writeAuditLog } from '@/lib/server/audit'

type Params = { params: Promise<{ token: string }> }

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function POST(req: Request, { params }: Params) {
  const { token } = await params
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

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  const { error: updateError } = await supabase
    .from('review_requests')
    .update({
      viewed_at: new Date().toISOString(),
      viewed_ip: ip,
      email_status: 'viewed',
    })
    .eq('id', requestRow.id)
  if (updateError) return serverError(updateError.message)

  const { data: cycleData } = await supabase
    .from('review_cycles')
    .select('document_id')
    .eq('id', requestRow.review_cycle_id)
    .single()

  const { data: docInfo } = await findDocumentById({
    supabase,
    id: cycleData?.document_id,
  })
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
