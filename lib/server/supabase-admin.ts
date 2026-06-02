import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/supabase/shared'
import { resilientFetch } from '@/lib/server/resilient-fetch'

let adminClient: ReturnType<typeof createClient> | null = null

export function createSupabaseAdminClient() {
  if (adminClient) return adminClient

  const env = getSupabaseEnv()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!env || !serviceRoleKey) return null

  adminClient = createClient(env.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: resilientFetch },
  })
  return adminClient
}
