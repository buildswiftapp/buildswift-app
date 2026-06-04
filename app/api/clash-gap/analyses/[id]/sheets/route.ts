import { badRequest, notFound, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { getAnalysisForAccount } from '@/lib/server/clash-gap/access'
import { fetchAllRows } from '@/lib/server/clash-gap/fetch-all-rows'
import { createClashGapSignedUrl } from '@/lib/server/clash-gap/storage'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

export const maxDuration = 300

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id } = await params

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const analysis = await getAnalysisForAccount(supabase, id, auth.accountId)
  if (!analysis) return notFound('Analysis not found')

  const { data: files } = await supabase
    .from('clash_gap_analysis_files')
    .select('id, file_name, file_role')
    .eq('analysis_id', id)
    .order('created_at', { ascending: true })
  if (!files?.length) return ok({ sheets: [] })

  const fileById = new Map((files as any[]).map((f) => [f.id, f]))
  const data = await fetchAllRows<any>((from, to) =>
    supabase
      .from('clash_gap_extracted_sheets')
      .select('id, analysis_file_id, page_index, image_path, ocr_text, raw_text, sheet_id')
      .in(
        'analysis_file_id',
        (files as any[]).map((f) => f.id),
      )
      .order('analysis_file_id', { ascending: true })
      .order('page_index', { ascending: true })
      .range(from, to),
  )

  const sheets = await Promise.all(
    data.map(async (row) => {
      const file = fileById.get(row.analysis_file_id)
      return {
        id: row.id,
        pageIndex: row.page_index,
        sheetId: row.sheet_id as string | null,
        fileName: (file?.file_name as string) ?? 'document',
        fileRole: (file?.file_role as string) ?? 'plans',
        imageUrl: row.image_path ? await createClashGapSignedUrl(row.image_path) : null,
        ocrText: (row.ocr_text as string | null) ?? '',
        rawText: (row.raw_text as string | null) ?? '',
      }
    }),
  )

  return ok({ sheets })
}
