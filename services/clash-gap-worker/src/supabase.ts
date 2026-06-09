import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from './config.js'

let client: SupabaseClient | null = null

export function sb(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}
