import type { User } from '@supabase/supabase-js'
import { bootstrapAccountForUser } from '@/lib/server/bootstrap-account'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

export type AuthContext = {
  user: User
  accountId: string | null
  isOwner: boolean
}

const accountCache = new Map<string, { accountId: string; isOwner: boolean; expiresAt: number }>()
const ACCOUNT_CACHE_TTL_MS = 60_000

function getCachedAccount(userId: string) {
  const cached = accountCache.get(userId)
  if (!cached) return null
  if (cached.expiresAt < Date.now()) {
    accountCache.delete(userId)
    return null
  }
  return cached
}

function setCachedAccount(userId: string, accountId: string, isOwner: boolean) {
  accountCache.set(userId, {
    accountId,
    isOwner,
    expiresAt: Date.now() + ACCOUNT_CACHE_TTL_MS,
  })
}

async function ensureUserAndAccount(user: User) {
  const cached = getCachedAccount(user.id)
  if (cached) {
    return { accountId: cached.accountId, isOwner: cached.isOwner as true | false }
  }

  const admin = createSupabaseAdminClient()
  const supabase = admin ?? (await createSupabaseServerClient())
  if (!supabase) return null

  const { data: ownerAccount, error: ownerLookupError } = await supabase
    .from('accounts')
    .select('id')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (ownerLookupError) {
    if (!admin) return null
  }

  if (ownerAccount?.id) {
    setCachedAccount(user.id, ownerAccount.id, true)
    return { accountId: ownerAccount.id, isOwner: true as const }
  }

  if (!admin) return null

  const bootstrapped = await bootstrapAccountForUser(supabase, user)
  if (!bootstrapped) return null

  setCachedAccount(user.id, bootstrapped.accountId, true)
  return { accountId: bootstrapped.accountId, isOwner: true as const }
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice('Bearer '.length).trim() || null
}

export async function getAuthContext(req: Request): Promise<AuthContext | null> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return null

  const {
    data: { session },
  } = await supabase.auth.getSession()

  let user: User | null = null
  if (session?.access_token) {
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser(session.access_token)
    user = sessionUser
  }

  if (!user) {
    const bearerToken = getBearerToken(req)
    if (bearerToken) {
      const {
        data: { user: tokenUser },
      } = await supabase.auth.getUser(bearerToken)
      user = tokenUser
    } else {
      const {
        data: { user: cookieUser },
      } = await supabase.auth.getUser()
      user = cookieUser
    }
  }

  if (!user) return null

  const account = await ensureUserAndAccount(user)
  if (!account) {
    return { user, accountId: null, isOwner: true }
  }
  return { user, accountId: account.accountId, isOwner: account.isOwner }
}
