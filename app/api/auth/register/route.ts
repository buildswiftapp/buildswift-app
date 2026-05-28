import { z } from 'zod'
import { badRequest, created, serverError } from '@/lib/server/api-response'
import { bootstrapAccountForUser } from '@/lib/server/bootstrap-account'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required'),
  email: z.string().trim().email('Enter a valid email'),
  company: z.string().trim().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function POST(req: Request) {
  const parsed = registerSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors
    const message =
      first.name?.[0] ||
      first.email?.[0] ||
      first.password?.[0] ||
      'Invalid registration payload'
    return badRequest(message)
  }

  const admin = createSupabaseAdminClient()
  if (!admin) {
    return serverError(
      'Registration is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and run migrations/2026-05-auth-signup-bootstrap.sql in Supabase.'
    )
  }

  const { name, email, company, password } = parsed.data
  const companyName = company?.trim() || name.trim()

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: {
      full_name: name.trim(),
      company_name: companyName,
      company: companyName,
    },
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      return badRequest('An account with this email already exists. Try signing in instead.')
    }
    if (msg.includes('database error saving new user') || msg.includes('database error creating new user')) {
      return serverError(
        'Signup database trigger failed. In Supabase SQL editor, run migrations/2026-05-auth-signup-bootstrap.sql (and 2026-05-subscription-usage.sql if needed), then try again.'
      )
    }
    return badRequest(error.message)
  }

  const user = data.user
  if (!user) return serverError('User was not created')

  try {
    await bootstrapAccountForUser(admin as any, user)
  } catch (e) {
    console.error('[auth/register] bootstrap failed:', e)
  }

  return created({
    user_id: user.id,
    message: 'Account created. Check your email to verify your account before signing in.',
  })
}
