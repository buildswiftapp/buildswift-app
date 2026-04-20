import { notFound, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { findDocumentById } from '@/lib/server/document-store'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  const { id } = await params

  const supabase = await createSupabaseServerClient()
  if (!supabase) return serverError('Supabase is not configured')

  const { data: doc } = await findDocumentById({
    supabase,
    id,
    accountId: auth.accountId,
  })
  if (!doc) return notFound('Document not found')

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('account_id', auth.accountId)
    .eq('document_id', id)
    .order('created_at', { ascending: false })

  if (error) return serverError(error.message)
  return ok({ activity: data ?? [] })
}
