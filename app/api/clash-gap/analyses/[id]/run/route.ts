import { after } from 'next/server'
import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { assertCanUseAiAssist } from '@/lib/server/billing'
import { getAnalysisForAccount, updateAnalysisStep } from '@/lib/server/clash-gap/access'
import { formatClashGapError } from '@/lib/server/clash-gap/errors'
import { runClashGapPipeline } from '@/lib/server/clash-gap/pipeline'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

export const maxDuration = 300

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id } = await params
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const aiGate = await assertCanUseAiAssist(supabase as any, auth.accountId)
  if (!aiGate.ok) return badRequest(aiGate.reason)

  const analysis = await getAnalysisForAccount(supabase, id, auth.accountId)
  if (!analysis) return badRequest('Analysis not found')

  if (analysis.status === 'processing') {
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
