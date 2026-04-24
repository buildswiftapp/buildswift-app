import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { getStripeClient } from '@/lib/server/stripe'

export async function POST(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const stripe = getStripeClient()
  if (!stripe) return serverError('Stripe is not configured')
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const { data: account, error } = await supabase
    .from('accounts')
    .select('id,name,stripe_customer_id')
    .eq('id', auth.accountId)
    .maybeSingle()
  if (error) return serverError(error.message)
  if (!account) return badRequest('Account not found')

  let customerId =
    typeof account.stripe_customer_id === 'string' && account.stripe_customer_id.trim()
      ? account.stripe_customer_id
      : null
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: auth.user.email || undefined,
      name: typeof account.name === 'string' ? account.name : undefined,
      metadata: { account_id: auth.accountId, user_id: auth.user.id },
    })
    customerId = customer.id
    await (supabase.from('accounts' as any) as any)
      .update({ stripe_customer_id: customerId })
      .eq('id', auth.accountId)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/billing`,
  })
  return ok({ url: portal.url })
}

