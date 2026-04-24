import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { writeAuditLog } from '@/lib/server/audit'
import { getAuthContext } from '@/lib/server/auth'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { getPriceIdForTier, getStripeClient } from '@/lib/server/stripe'

export async function POST(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const body = (await req.json().catch(() => ({}))) as { tier?: string }
  if (body.tier !== 'professional' && body.tier !== 'enterprise') {
    return badRequest('tier must be professional or enterprise')
  }

  const stripe = getStripeClient()
  if (!stripe) return serverError('Stripe is not configured')

  const priceId = getPriceIdForTier(body.tier)
  if (!priceId) return badRequest(`Missing Stripe price id for ${body.tier}`)

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null

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
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/billing?checkout=cancelled`,
    allow_promotion_codes: true,
    metadata: { account_id: auth.accountId, tier: body.tier },
  })
  await writeAuditLog(
    {
      accountId: auth.accountId,
      actorType: 'user',
      actorUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      eventType: 'billing.checkout_session_created',
      eventData: {
        tier: body.tier,
        stripe_customer_id: customerId,
        stripe_session_id: session.id,
        stripe_price_id: priceId,
      },
      ip,
    },
    supabase as any
  )
  if (!session.url) return serverError('Failed to create Stripe checkout URL')
  return ok({ url: session.url })
}

