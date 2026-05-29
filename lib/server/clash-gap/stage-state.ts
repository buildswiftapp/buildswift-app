import {
  parseStages,
  type ClashGapStage,
  type StageState,
  type StagesMap,
} from '@/lib/clash-gap-stages'

const MIGRATION_HINT =
  'Clash/Gap staged-pipeline migration is not applied. Run migrations/2026-05-clash-gap-staged-pipeline.sql in Supabase.'

function isMissingColumn(message: string | undefined): boolean {
  const m = (message || '').toLowerCase()
  return m.includes('column') && (m.includes('stages') || m.includes('does not exist'))
}

async function readStages(supabase: any, analysisId: string): Promise<StagesMap> {
  const { data, error } = await supabase
    .from('clash_gap_analyses')
    .select('stages')
    .eq('id', analysisId)
    .maybeSingle()
  if (error) {
    throw new Error(isMissingColumn(error.message) ? MIGRATION_HINT : error.message)
  }
  return parseStages(data?.stages)
}

export async function patchStageState(
  supabase: any,
  analysisId: string,
  stage: ClashGapStage,
  patch: Partial<StageState>,
): Promise<StagesMap> {
  const stages = await readStages(supabase, analysisId)
  const current: StageState = stages[stage] ?? { status: 'pending' }
  const merged: StageState = { ...current, ...patch }
  const next: StagesMap = { ...stages, [stage]: merged }
  const { error } = await supabase
    .from('clash_gap_analyses')
    .update({ stages: next, updated_at: new Date().toISOString() })
    .eq('id', analysisId)
  if (error) {
    throw new Error(isMissingColumn(error.message) ? MIGRATION_HINT : error.message)
  }
  return next
}

export async function markStageRunning(supabase: any, analysisId: string, stage: ClashGapStage) {
  return patchStageState(supabase, analysisId, stage, {
    status: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    processed: 0,
  })
}

export async function markStageCompleted(
  supabase: any,
  analysisId: string,
  stage: ClashGapStage,
  detail?: { processed?: number; total?: number; detail?: string },
) {
  const patch: Partial<StageState> = {
    status: 'completed',
    completedAt: new Date().toISOString(),
    error: null,
    detail: detail?.detail ?? null,
  }
  if (detail?.processed != null) patch.processed = detail.processed
  if (detail?.total != null) patch.total = detail.total
  return patchStageState(supabase, analysisId, stage, patch)
}

export async function markStageFailed(
  supabase: any,
  analysisId: string,
  stage: ClashGapStage,
  error: string,
) {
  return patchStageState(supabase, analysisId, stage, {
    status: 'failed',
    completedAt: new Date().toISOString(),
    error,
  })
}

export async function markStageProgress(
  supabase: any,
  analysisId: string,
  stage: ClashGapStage,
  progress: { processed?: number; total?: number; detail?: string },
) {
  try {
    return await patchStageState(supabase, analysisId, stage, progress)
  } catch {
    return undefined
  }
}
