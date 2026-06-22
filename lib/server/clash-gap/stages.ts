import { formatClashGapError } from '@/lib/server/clash-gap/errors'
import { updateAnalysisStep } from '@/lib/server/clash-gap/access'
import {
  markStageCompleted,
  markStageFailed,
} from '@/lib/server/clash-gap/stage-state'
import {
  assertWorkerConfigured,
  triggerChunkStage,
  triggerOcrJob,
} from '@/lib/server/clash-gap/worker-client'

type StageParams = {
  supabase: any
  analysisId: string
  accountId: string
  userId: string
  userEmail: string | null
}

export async function runChunkStage(params: StageParams) {
  assertWorkerConfigured()

  try {
    await triggerChunkStage({
      analysisId: params.analysisId,
      accountId: params.accountId,
    })
    return { delegated: true }
  } catch (error) {
    const message = formatClashGapError(error)
    await markStageFailed(params.supabase, params.analysisId, 'chunk', message)
    await updateAnalysisStep(params.supabase, params.analysisId, {
      status: 'failed',
      error_message: message,
    })
    throw error
  }
}

export async function runOcrStage(params: StageParams) {
  assertWorkerConfigured()

  try {
    await triggerOcrJob(params.analysisId)
    return { delegated: true }
  } catch (error) {
    const message = formatClashGapError(error)
    await markStageFailed(params.supabase, params.analysisId, 'ocr', message)
    await updateAnalysisStep(params.supabase, params.analysisId, {
      status: 'failed',
      error_message: message,
    })
    throw error
  }
}
