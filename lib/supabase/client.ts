'use client'

import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseEnv } from './shared'

export function createSupabaseBrowserClient() {
  const env = getSupabaseEnv()
  if (!env) return null
  const { supabaseUrl, supabaseAnonKey } = env
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
