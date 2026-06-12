import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { config } from './config.js'

let client: SupabaseClient | null = null

export function sb(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      // Node.js 20 lacks native WebSocket; Supabase Realtime requires a transport.
      realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
    })
  }
  return client
}
