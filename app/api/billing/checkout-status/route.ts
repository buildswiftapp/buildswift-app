import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { getStripeClient } from '@/lib/server/stripe'

export async function GET(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const sessionId = new URL(req.url).searchParams.get('session_id')?.trim() || ''
  if (!sessionId) return badRequest('session_id is required')

  const stripe = getStripeClient()
  if (!stripe) return serverError('Stripe is not configured')

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const { data: account, error } = await supabase
    .from('accounts')
    .select('stripe_customer_id')
    .eq('id', auth.accountId)
    .maybeSingle()
  if (error) return serverError(error.message)

  const session = await stripe.checkout.sessions.retrieve(sessionId)
  const sessionCustomer =
    typeof session.customer === 'string' ? session.customer : session.customer?.id || null
  const accountCustomer =
    typeof account?.stripe_customer_id === 'string' ? account.stripe_customer_id : null
  if (accountCustomer && sessionCustomer && sessionCustomer !== accountCustomer) {
    return unauthorized('Checkout session does not belong to this account')
  }

  const paid =
    session.status === 'complete' &&
    (session.payment_status === 'paid' || session.payment_status === 'no_payment_required')

  return ok({
    status: session.status,
    payment_status: session.payment_status,
    paid,
    mode: session.mode,
  })
}

