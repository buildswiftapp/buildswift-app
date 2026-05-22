import { badRequest, notFound, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { getAnalysisForAccount } from '@/lib/server/clash-gap/access'
import { generateClashGapReportPdf } from '@/lib/server/clash-gap/report-pdf'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  const auth = await getAuthContext(_req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id } = await params
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const analysis = await getAnalysisForAccount(supabase, id, auth.accountId)
  if (!analysis) return notFound('Analysis not found')

  const { data: project } = await supabase
    .from('projects')
    .select('name, address, job_number')
    .eq('id', analysis.project_id)
    .maybeSingle()

  const [{ data: issues }, { data: files }] = await Promise.all([
    supabase
      .from('clash_gap_issues')
      .select('*')
      .eq('analysis_id', id)
      .neq('status', 'dismissed')
      .order('created_at', { ascending: true }),
    supabase
      .from('clash_gap_analysis_files')
      .select('file_name')
      .eq('analysis_id', id),
  ])

  const summary = (analysis.summary as {
    total?: number
    by_type?: { clash?: number; gap?: number; mismatch?: number }
  }) || { total: 0, by_type: { clash: 0, gap: 0, mismatch: 0 } }

  const byType = summary.by_type || {}
  const pdfBuffer = await generateClashGapReportPdf({
    supabase,
    accountId: auth.accountId,
    project: {
      name: project?.name || 'Project',
      address: project?.address,
      job_number: project?.job_number,
    },
    summary: {
      total: summary.total ?? (issues?.length || 0),
      by_type: {
        clash: byType.clash ?? 0,
        gap: byType.gap ?? 0,
        mismatch: byType.mismatch ?? 0,
      },
    },
    issues: issues ?? [],
    files: files ?? [],
  })

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="clash-gap-report-${id.slice(0, 8)}.pdf"`,
    },
  })
}
