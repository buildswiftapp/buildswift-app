import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { resilientFetch } from '@/lib/server/resilient-fetch'
import { getSupabaseEnv } from './shared'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const env = getSupabaseEnv()
  if (!env) {
    return { response, user: null, enabled: false as const }
  }
  const { supabaseUrl, supabaseAnonKey } = env

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: resilientFetch },
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return { response, user, enabled: true as const }
  } catch {
    // Supabase can be briefly unreachable during long worker jobs; don't break polling/API.
    return { response, user: null, enabled: false as const }
  }
}
