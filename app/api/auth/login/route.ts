import { z } from 'zod'
import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

export async function POST(req: Request) {
  const parsed = loginSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors
    const message = first.email?.[0] || first.password?.[0] || 'Invalid login payload'
    return badRequest(message)
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return serverError(
      'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.'
    )
  }

  const { email, password } = parsed.data
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return unauthorized(error.message)
  }

  return ok({ ok: true })
}
