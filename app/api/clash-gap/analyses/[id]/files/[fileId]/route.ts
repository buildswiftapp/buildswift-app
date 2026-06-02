import { badRequest, notFound, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { getAnalysisForAccount } from '@/lib/server/clash-gap/access'
import { deleteClashGapFile } from '@/lib/server/clash-gap/storage'
import { incrementAccountStorageBytes } from '@/lib/server/storage-usage'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { z } from 'zod'

const patchSchema = z
  .object({
    file_role: z.enum(['plans', 'specs', 'addenda']).optional(),
    page_count: z.number().int().positive().optional(),
  })
  .refine((d) => d.file_role !== undefined || d.page_count !== undefined, {
    message: 'Nothing to update',
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

  const update: Record<string, unknown> = {}
  if (parsed.data.file_role !== undefined) update.file_role = parsed.data.file_role
  if (parsed.data.page_count !== undefined) update.page_count = parsed.data.page_count

  const { data, error } = await supabase
    .from('clash_gap_analysis_files')
    .update(update)
    .eq('id', fileId)
    .eq('analysis_id', analysisId)
    .eq('account_id', auth.accountId)
    .select('id, file_name, file_role, mime_type, page_count, created_at')
    .single()

  if (error) return serverError(error.message)
  if (!data) return notFound('File not found')

  return ok({ file: data })
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await getAuthContext(_req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id: analysisId, fileId } = await params
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const analysis = await getAnalysisForAccount(supabase, analysisId, auth.accountId)
  if (!analysis) return notFound('Analysis not found')

  const { data: file, error: fetchError } = await supabase
    .from('clash_gap_analysis_files')
    .select('id, storage_path, size_bytes')
    .eq('id', fileId)
    .eq('analysis_id', analysisId)
    .eq('account_id', auth.accountId)
    .maybeSingle()

  if (fetchError) return serverError(fetchError.message)
  if (!file) return notFound('File not found')

  await supabase.from('clash_gap_extracted_sheets').delete().eq('analysis_file_id', fileId)

  const { error: deleteError } = await supabase
    .from('clash_gap_analysis_files')
    .delete()
    .eq('id', fileId)
    .eq('analysis_id', analysisId)
    .eq('account_id', auth.accountId)

  if (deleteError) return serverError(deleteError.message)

  if (file.storage_path) {
    try {
      await deleteClashGapFile(file.storage_path)
    } catch (e) {
      console.error('[clash-gap] storage delete failed:', file.storage_path, e)
    }
  }

  try {
    const bytes =
      typeof (file as any).size_bytes === 'number' && Number.isFinite((file as any).size_bytes)
        ? Math.max(0, Math.floor((file as any).size_bytes))
        : 0
    if (bytes > 0) await incrementAccountStorageBytes(supabase as any, auth.accountId, -bytes)
  } catch {
  }

  return ok({ deleted: true, id: fileId })
}
