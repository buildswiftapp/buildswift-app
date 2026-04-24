import { ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

const MAX_QUERY_LEN = 120
const MAX_CYCLES = 500
const BATCH = 120
const MAX_RESULTS = 25

function sanitizeIlikeFragment(raw: string): string {
  return raw.replace(/[%_\\]/g, '').slice(0, MAX_QUERY_LEN).trim()
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function GET(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()

  const { searchParams } = new URL(req.url)
  const safe = sanitizeIlikeFragment(searchParams.get('q') ?? '')
  if (!safe) {
    return ok({ emails: [] as string[] })
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return serverError('Supabase is not configured')

  const { data: cycles, error: cycleError } = await supabase
    .from('review_cycles')
    .select('id')
    .eq('sent_by', auth.user.id)
    .order('sent_at', { ascending: false })
    .limit(MAX_CYCLES)

  if (cycleError) return serverError(cycleError.message)

  const cycleIds = (cycles ?? []).map((c) => c.id).filter(Boolean)
  if (cycleIds.length === 0) {
    return ok({ emails: [] as string[] })
  }

  const pattern = `%${safe}%`
  const seen = new Set<string>()

  for (const batch of chunk(cycleIds, BATCH)) {
    const { data: rows, error: reqError } = await supabase
      .from('review_requests')
      .select('reviewer_email')
      .in('review_cycle_id', batch)
      .ilike('reviewer_email', pattern)
      .limit(80)

    if (reqError) return serverError(reqError.message)
    for (const row of rows ?? []) {
      const e = row.reviewer_email?.toLowerCase().trim()
      if (e) seen.add(e)
      if (seen.size >= MAX_RESULTS * 2) break
    }
    if (seen.size >= MAX_RESULTS * 2) break
  }

  const emails = Array.from(seen).sort((a, b) => a.localeCompare(b)).slice(0, MAX_RESULTS)
  return ok({ emails })
}
