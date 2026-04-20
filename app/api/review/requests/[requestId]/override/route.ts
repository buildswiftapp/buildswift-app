import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { writeAuditLog } from '@/lib/server/audit'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

type Params = { params: Promise<{ requestId: string }> }

export async function POST(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.isOwner) return forbidden('Only account owner can override reviewer status')

  const { requestId } = await params
  const supabase = await createSupabaseServerClient()
  if (!supabase) return serverError('Supabase is not configured')

  const body = (await req.json().catch(() => ({}))) as { reason?: string }
  if (!body.reason?.trim()) return badRequest('reason is required')

  const { data: row, error } = await supabase
    .from('review_requests')
    .select('id,review_cycle_id')
    .eq('id', requestId)
    .maybeSingle()
  if (error) return serverError(error.message)
  if (!row) return notFound('Review request not found')

  const { error: updateError } = await supabase
    .from('review_requests')
    .update({
      is_overridden: true,
      overridden_by: auth.user.id,
      overridden_at: new Date().toISOString(),
      decision_notes: body.reason,
    })
    .eq('id', requestId)
  if (updateError) return serverError(updateError.message)

  const { data: cycleData } = await supabase
    .from('review_cycles')
    .select('document_id')
    .eq('id', row.review_cycle_id)
    .single()

  await writeAuditLog({
    accountId: auth.accountId,
    actorType: 'user',
    actorUserId: auth.user.id,
    eventType: 'reviewer.overridden',
    documentId: cycleData?.document_id,
    eventData: { review_request_id: requestId, reason: body.reason },
  })

  return ok({ success: true })
}
