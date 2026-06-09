import { sb } from '../supabase.js'

type StageName = 'chunk' | 'ocr'

type StageState = {
  status?: 'pending' | 'running' | 'completed' | 'failed'
  startedAt?: string | null
  completedAt?: string | null
  error?: string | null
  processed?: number
  total?: number
  detail?: string | null
}

type StagesMap = Partial<Record<StageName, StageState>>

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readStages(analysisId: string): Promise<StagesMap> {
  const { data, error } = await sb()
    .from('clash_gap_analyses')
    .select('stages')
    .eq('id', analysisId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const raw = data?.stages
  return raw && typeof raw === 'object' ? (raw as StagesMap) : {}
}

async function mergeStages(
  analysisId: string,
  merge: (current: StagesMap) => StagesMap,
  maxAttempts = 8,
): Promise<void> {
  let lastError: string | undefined
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const current = await readStages(analysisId)
    const next = merge(current)
    const { error } = await sb()
      .from('clash_gap_analyses')
      .update({ stages: next, updated_at: new Date().toISOString() })
      .eq('id', analysisId)
    if (!error) return
    lastError = error.message
    await sleep(30 * (attempt + 1))
  }
  throw new Error(lastError || 'Could not update stage state')
}

export async function markStageCompleted(
  analysisId: string,
  stage: StageName,
  detail?: { processed?: number; total?: number; detail?: string },
): Promise<void> {
  await mergeStages(analysisId, (stages) => {
    const current = stages[stage] ?? {}
    stages[stage] = {
      ...current,
      status: 'completed',
      completedAt: new Date().toISOString(),
      error: null,
      ...(detail?.processed != null ? { processed: detail.processed } : {}),
      ...(detail?.total != null ? { total: detail.total } : {}),
      ...(detail?.detail != null ? { detail: detail.detail } : {}),
    }
    return stages
  })
}

export async function setStage(
  analysisId: string,
  stage: StageName,
  status: StageState['status'],
  error?: string,
): Promise<void> {
  await mergeStages(analysisId, (stages) => {
    const current = stages[stage] ?? {}
    stages[stage] = {
      ...current,
      status,
      ...(status === 'running'
        ? {
            startedAt: current.startedAt ?? new Date().toISOString(),
            completedAt: null,
            error: null,
          }
        : {}),
      ...(status === 'completed'
        ? { completedAt: new Date().toISOString(), error: null }
        : {}),
      ...(status === 'failed'
        ? { completedAt: new Date().toISOString(), error: error ?? 'Unknown error' }
        : {}),
    }
    return stages
  })
}

export async function setProgress(
  analysisId: string,
  stage: StageName,
  processed: number,
  total: number,
  detail?: string,
): Promise<void> {
  await mergeStages(analysisId, (stages) => {
    const current = stages[stage] ?? { status: 'running' }
    if (current.status === 'completed') return stages
    stages[stage] = {
      ...current,
      status: 'running',
      processed: Math.max(current.processed ?? 0, processed),
      total: Math.max(current.total ?? 0, total),
      detail: detail ?? `page ${Math.max(current.processed ?? 0, processed)}/${Math.max(current.total ?? 0, total)}`,
    }
    return stages
  })
}

export async function updateAnalysisStep(
  analysisId: string,
  patch: { status?: string; processing_step?: string; error_message?: string | null },
): Promise<void> {
  const { error } = await sb()
    .from('clash_gap_analyses')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', analysisId)
  if (error) throw new Error(error.message)
}

export async function setFileChunkStatus(
  fileId: string,
  status: 'pending' | 'running' | 'completed' | 'failed',
  error?: string | null,
): Promise<void> {
  const { error: dbError } = await sb()
    .from('clash_gap_analysis_files')
    .update({
      chunk_status: status,
      chunk_error: status === 'failed' ? error ?? 'Chunk failed' : null,
    })
    .eq('id', fileId)
  if (dbError && !dbError.message.toLowerCase().includes('chunk_status')) {
    throw new Error(dbError.message)
  }
}
