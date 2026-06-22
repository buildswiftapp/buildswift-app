import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { config } from './config.js'

let client: SupabaseClient | null = null

const TRANSIENT_MARKERS = [
  'fetch failed',
  'econnreset',
  'etimedout',
  'eai_again',
  'socket hang up',
  'und_err',
]

function isTransientFetchError(error: unknown): boolean {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; current && depth < 5; depth++) {
    const e = current as { message?: unknown; code?: unknown; cause?: unknown }
    if (typeof e.message === 'string') parts.push(e.message)
    if (typeof e.code === 'string') parts.push(e.code)
    current = e.cause
  }
  const text = parts.join(' ').toLowerCase()
  return TRANSIENT_MARKERS.some((marker) => text.includes(marker))
}

async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(input, init)
    } catch (error) {
      lastError = error
      if (attempt < 2 && isTransientFetchError(error)) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)))
        continue
      }
      throw error
    }
  }
  throw lastError
}

export function sb(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: resilientFetch },
      realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
    })
  }
  return client
}
