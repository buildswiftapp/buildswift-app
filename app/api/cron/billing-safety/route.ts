import { ok, unauthorized } from '@/lib/server/api-response'
import { downgradeAccountToFree } from '@/lib/server/billing'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'

function isAuthorized(req: Request) {
  const secret = process.env.BILLING_CRON_SECRET?.trim()
  if (!secret) return false
  const authHeader = req.headers.get('authorization') || ''
  return authHeader === `Bearer ${secret}`
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized('Unauthorized cron request')

  const supabase = createSupabaseAdminClient()
  if (!supabase) return new Response('Supabase admin not configured', { status: 500 })

  const nowIso = new Date().toISOString()
  const { data: rows, error } = await (supabase.from('accounts' as any) as any)
    .select('id,subscription_tier,billing_status,current_period_end')
    .neq('subscription_tier', 'free')
    .not('current_period_end', 'is', null)
    .lt('current_period_end', nowIso)
    .neq('billing_status', 'canceled')
  if (error) return new Response(error.message, { status: 500 })

  let downgraded = 0
  for (const row of rows ?? []) {
    await downgradeAccountToFree(supabase as any, String(row.id))
    downgraded += 1
  }

  return ok({ scanned: rows?.length ?? 0, downgraded })
}

