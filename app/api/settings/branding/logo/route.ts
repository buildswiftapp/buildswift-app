import { randomUUID } from 'crypto'
import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAccountBranding, upsertAccountBranding } from '@/lib/server/account-branding'
import { getAuthContext } from '@/lib/server/auth'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

const MAX_LOGO_BYTES = 2_000_000
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])

function extensionForMime(mime: string) {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  return 'png'
}

export async function POST(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) {
    return badRequest(
      'Account context is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY and ensure your account row exists in the database.'
    )
  }

  const admin = createSupabaseAdminClient()
  if (!admin) {
    return serverError('SUPABASE_SERVICE_ROLE_KEY is required to upload branding logos.')
  }

  const form = await req.formData().catch(() => null)
  if (!form) return badRequest('Expected multipart form data')
  const file = form.get('logo')
  if (!file || typeof file === 'string') return badRequest('Missing file field "logo"')

  const blob = file as File
  const mime = (blob.type || '').split(';')[0].trim().toLowerCase()
  if (!ALLOWED_MIME.has(mime)) {
    return badRequest('Logo must be PNG, JPEG, or WebP')
  }
  const buf = Buffer.from(await blob.arrayBuffer())
  if (buf.length > MAX_LOGO_BYTES) return badRequest('Logo must be 2MB or smaller')

  const bucket = process.env.BRANDING_LOGO_BUCKET || process.env.REVIEW_SIGNATURES_BUCKET || 'document-attachments'
  const ext = extensionForMime(mime)
  const storagePath = `branding/${auth.accountId}/logo-${randomUUID()}.${ext}`

  const { error: uploadError } = await admin.storage.from(bucket).upload(storagePath, buf, {
    contentType: mime,
    upsert: false,
  })
  if (uploadError) return serverError(uploadError.message)

  const { data: publicData } = admin.storage.from(bucket).getPublicUrl(storagePath)
  const publicUrl = publicData.publicUrl || storagePath

  const supabase = admin ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const existing = await getAccountBranding(supabase, auth.accountId)
  if (existing.error) return serverError(existing.error.message)

  const { data, error } = await upsertAccountBranding(supabase, {
    accountId: auth.accountId,
    company_name: existing.data?.company_name ?? null,
    primary_color: existing.data?.primary_color ?? null,
    logo_url: publicUrl,
  })
  if (error) return serverError(error.message)

  return ok({ logo_url: data?.logo_url ?? publicUrl })
}

export async function DELETE(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) {
    return badRequest(
      'Account context is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY and ensure your account row exists in the database.'
    )
  }

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const existing = await getAccountBranding(supabase, auth.accountId)
  if (existing.error) return serverError(existing.error.message)

  const { data, error } = await upsertAccountBranding(supabase, {
    accountId: auth.accountId,
    company_name: existing.data?.company_name ?? null,
    primary_color: existing.data?.primary_color ?? null,
    logo_url: null,
  })
  if (error) return serverError(error.message)

  return ok({ logo_url: data?.logo_url ?? null })
}
