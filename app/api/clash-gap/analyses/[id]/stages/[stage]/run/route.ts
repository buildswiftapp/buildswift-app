import { after } from 'next/server'
import {
  badRequest,
  forbidden,
  notFound,
  ok,
  serverError,
  unauthorized,
} from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { assertCanRunClashGapReport, assertCanUseAiAssist } from '@/lib/server/billing'
import { getAnalysisForAccount } from '@/lib/server/clash-gap/access'
import { formatClashGapError, isStaleClashGapProcessing } from '@/lib/server/clash-gap/errors'
import { runDetectStage } from '@/lib/server/clash-gap/pipeline'
import { runChunkStage, runMergeStage, runOcrStage } from '@/lib/server/clash-gap/stages'
import { markStageFailed, markStageRunning } from '@/lib/server/clash-gap/stage-state'
import {
  CLASH_GAP_STAGES,
  parseStages,
  stageGateMet,
  stageStatus,
  type ClashGapStage,
} from '@/lib/clash-gap-stages'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

export const maxDuration = 300

type Params = { params: Promise<{ id: string; stage: string }> }

const STAGE_RUNNERS = {
  chunk: runChunkStage,
  ocr: runOcrStage,
  merge: runMergeStage,
  detect: runDetectStage,
} as const

export async function POST(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id, stage } = await params
  if (!CLASH_GAP_STAGES.includes(stage as ClashGapStage)) {
    return badRequest('Unknown stage')
  }
  const stageName = stage as ClashGapStage

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  if (stageName === 'ocr' || stageName === 'detect') {
    const aiGate = await assertCanUseAiAssist(supabase as any, auth.accountId)
    if (!aiGate.ok) return forbidden(aiGate.reason)
  }
  if (stageName === 'detect') {
    const reportGate = await assertCanRunClashGapReport(supabase as any, auth.accountId)
    if (!reportGate.ok) return forbidden(reportGate.reason)
  }

  const analysis = await getAnalysisForAccount(supabase, id, auth.accountId)
  if (!analysis) return notFound('Analysis not found')

  const stageMap = parseStages((analysis as any).stages)

  if (
    stageStatus(stageMap, stageName) === 'running' &&
    !isStaleClashGapProcessing('processing', analysis.updated_at)
  ) {
    return ok({ analysisId: id, stage: stageName, status: 'running' })
  }

  const { count } = await supabase
    .from('clash_gap_analysis_files')
    .select('id', { count: 'exact', head: true })
    .eq('analysis_id', id)
  const hasUploads = (count ?? 0) > 0

  if (!stageGateMet(stageMap, stageName, hasUploads)) {
    return badRequest(
      stageName === 'chunk'
        ? 'Upload at least one document before chunking.'
        : 'Complete the previous stage before running this one.',
    )
  }

  const job = {
    supabase,
    analysisId: id,
    accountId: auth.accountId,
    userId: auth.user.id,
    userEmail: auth.user.email ?? null,
  }

  const runner = STAGE_RUNNERS[stageName]

  try {
    await markStageRunning(job.supabase, job.analysisId, stageName)
  } catch (e) {
    return serverError(formatClashGapError(e))
  }

  after(async () => {
    try {
      await runner(job)
    } catch (e) {
      const message = formatClashGapError(e)
      try {
        await markStageFailed(job.supabase, job.analysisId, stageName, message)
      } catch (markErr) {
        console.error('[clash-gap stage] could not record failure', stageName, markErr)
      }
    }
  })

  return ok({ analysisId: id, stage: stageName, status: 'running' })
}
