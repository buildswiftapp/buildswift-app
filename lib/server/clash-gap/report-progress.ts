import {
  phaseToProcessingStep,
  summaryWithProgress,
  type ClashGapProcessingProgress,
} from '@/lib/clash-gap-processing-status'
import { updateAnalysisStep } from '@/lib/server/clash-gap/access'

export async function reportAnalysisProgress(
  supabase: Parameters<typeof updateAnalysisStep>[0],
  analysisId: string,
  progress: ClashGapProcessingProgress,
) {
  await updateAnalysisStep(supabase, analysisId, {
    status: 'processing',
    processing_step: phaseToProcessingStep(progress.phase),
    summary: summaryWithProgress(progress),
  })
}
