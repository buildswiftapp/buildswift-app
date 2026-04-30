import { badRequest, notFound, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { findDocumentById } from '@/lib/server/document-store'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

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

  const { data: doc, error: docError } = await findDocumentById({
    supabase,
    id,
    accountId: auth.accountId,
  })
  if (docError) return serverError(docError.message)
  if (!doc) return notFound('Document not found')

  const { data: cycle } = await supabase
    .from('review_cycles')
    .select('id,cycle_no,status,sent_at,created_at')
    .eq('document_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!cycle?.id) return ok({ cycle: null, invitations: [] as any[] })

  const { data: requests, error: reqError } = await supabase
    .from('review_requests')
    .select('id,review_cycle_id,reviewer_email,full_name,decision,decided_at,viewed_at,email_status,created_at')
    .eq('review_cycle_id', cycle.id)
    .order('created_at', { ascending: true })

  if (reqError) return serverError(reqError.message)

  return ok({
    cycle,
    invitations: (requests ?? []).map((r) => ({
      id: r.id,
      reviewer_email: r.reviewer_email,
      full_name: (r as any).full_name ?? null,
      decision: r.decision ?? null,
      decided_at: r.decided_at ?? null,
      viewed_at: (r as any).viewed_at ?? null,
      email_status: (r as any).email_status ?? null,
      created_at: r.created_at ?? null,
    })),
  })
}

