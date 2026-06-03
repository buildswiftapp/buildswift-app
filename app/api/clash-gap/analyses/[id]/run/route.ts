import { after } from 'next/server'
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { assertCanRunClashGapReport, assertCanUseAiAssist } from '@/lib/server/billing'
import { getAnalysisForAccount, updateAnalysisStep } from '@/lib/server/clash-gap/access'
import { formatClashGapError, isStaleClashGapProcessing } from '@/lib/server/clash-gap/errors'
import { runClashGapPipeline } from '@/lib/server/clash-gap/pipeline'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

export const maxDuration = 800

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id } = await params
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const aiGate = await assertCanUseAiAssist(supabase as any, auth.accountId)
  if (!aiGate.ok) return forbidden(aiGate.reason)

  const reportGate = await assertCanRunClashGapReport(supabase as any, auth.accountId)
  if (!reportGate.ok) return forbidden(reportGate.reason)

  const analysis = await getAnalysisForAccount(supabase, id, auth.accountId)
  if (!analysis) return notFound('Analysis not found')

  if (
    (analysis.status === 'processing' || analysis.status === 'queued') &&
    !isStaleClashGapProcessing(analysis.status, analysis.updated_at)
  ) {
    return ok({ analysisId: id, status: 'processing' })
  }

  await updateAnalysisStep(supabase, id, {
    status: 'processing',
    processing_step: 'extract',
    error_message: null,
  })

  const job = {
    supabase,
    analysisId: id,
    accountId: auth.accountId,
    userId: auth.user.id,
    userEmail: auth.user.email ?? null,
  }

  after(async () => {
    try {
      await runClashGapPipeline(job)
    } catch (e) {
      const message = formatClashGapError(e)
      await updateAnalysisStep(job.supabase, job.analysisId, {
        status: 'failed',
        processing_step: 'done',
        error_message: message,
      })
    }
  })

  return ok({ analysisId: id, status: 'processing' })
}
