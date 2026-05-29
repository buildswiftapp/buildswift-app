export type ClashGapStage = 'chunk' | 'ocr' | 'merge' | 'detect'

export const CLASH_GAP_STAGES: ClashGapStage[] = ['chunk', 'ocr', 'merge', 'detect']

export type StageStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface StageState {
  status: StageStatus
  startedAt?: string | null
  completedAt?: string | null
  error?: string | null
  processed?: number
  total?: number
  detail?: string | null
}

export type StagesMap = Partial<Record<ClashGapStage, StageState>>

export function parseStages(raw: unknown): StagesMap {
  if (!raw || typeof raw !== 'object') return {}
  const out: StagesMap = {}
  for (const stage of CLASH_GAP_STAGES) {
    const v = (raw as Record<string, unknown>)[stage]
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      const status =
        o.status === 'running' || o.status === 'completed' || o.status === 'failed'
          ? o.status
          : 'pending'
      out[stage] = {
        status,
        startedAt: typeof o.startedAt === 'string' ? o.startedAt : null,
        completedAt: typeof o.completedAt === 'string' ? o.completedAt : null,
        error: typeof o.error === 'string' ? o.error : null,
        processed: typeof o.processed === 'number' ? o.processed : undefined,
        total: typeof o.total === 'number' ? o.total : undefined,
        detail: typeof o.detail === 'string' ? o.detail : null,
      }
    }
  }
  return out
}

export function stageStatus(stages: StagesMap, stage: ClashGapStage): StageStatus {
  return stages[stage]?.status ?? 'pending'
}

export function isStageComplete(stages: StagesMap, stage: ClashGapStage): boolean {
  return stageStatus(stages, stage) === 'completed'
}

export function isStageRunning(stages: StagesMap, stage: ClashGapStage): boolean {
  return stageStatus(stages, stage) === 'running'
}

export function previousStage(stage: ClashGapStage): ClashGapStage | null {
  const idx = CLASH_GAP_STAGES.indexOf(stage)
  return idx > 0 ? CLASH_GAP_STAGES[idx - 1]! : null
}

export function nextStage(stage: ClashGapStage): ClashGapStage | null {
  const idx = CLASH_GAP_STAGES.indexOf(stage)
  return idx >= 0 && idx < CLASH_GAP_STAGES.length - 1 ? CLASH_GAP_STAGES[idx + 1]! : null
}

export function stageGateMet(
  stages: StagesMap,
  stage: ClashGapStage,
  hasUploads: boolean,
): boolean {
  const prev = previousStage(stage)
  if (!prev) return hasUploads
  return isStageComplete(stages, prev)
}

export function allStagesComplete(stages: StagesMap): boolean {
  return CLASH_GAP_STAGES.every((s) => isStageComplete(stages, s))
}

export function anyStageRunning(stages: StagesMap): boolean {
  return CLASH_GAP_STAGES.some((s) => isStageRunning(stages, s))
}
