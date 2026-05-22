import { badRequest, notFound, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { getAnalysisForAccount } from '@/lib/server/clash-gap/access'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { z } from 'zod'

const patchSchema = z.object({
  file_role: z.enum(['plans', 'specs', 'addenda']),
})

type Params = { params: Promise<{ id: string; fileId: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id: analysisId, fileId } = await params
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const analysis = await getAnalysisForAccount(supabase, analysisId, auth.accountId)
  if (!analysis) return notFound('Analysis not found')

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten())

  const { data, error } = await supabase
    .from('clash_gap_analysis_files')
    .update({ file_role: parsed.data.file_role })
    .eq('id', fileId)
    .eq('analysis_id', analysisId)
    .eq('account_id', auth.accountId)
    .select('id, file_name, file_role, mime_type, page_count, created_at')
    .single()

  if (error) return serverError(error.message)
  if (!data) return notFound('File not found')

  return ok({ file: data })
}
