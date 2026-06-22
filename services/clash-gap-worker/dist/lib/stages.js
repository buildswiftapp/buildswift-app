import { sb } from '../supabase.js';
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function readStages(analysisId) {
    const { data, error } = await sb()
        .from('clash_gap_analyses')
        .select('stages')
        .eq('id', analysisId)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    const raw = data?.stages;
    return raw && typeof raw === 'object' ? raw : {};
}
async function mergeStages(analysisId, merge, maxAttempts = 8) {
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const current = await readStages(analysisId);
        const next = merge(current);
        const { error } = await sb()
            .from('clash_gap_analyses')
            .update({ stages: next, updated_at: new Date().toISOString() })
            .eq('id', analysisId);
        if (!error)
            return;
        lastError = error.message;
        await sleep(30 * (attempt + 1));
    }
    throw new Error(lastError || 'Could not update stage state');
}
export async function markStageCompleted(analysisId, stage, detail) {
    await mergeStages(analysisId, (stages) => {
        const current = stages[stage] ?? {};
        stages[stage] = {
            ...current,
            status: 'completed',
            completedAt: new Date().toISOString(),
            error: null,
            ...(detail?.processed != null ? { processed: detail.processed } : {}),
            ...(detail?.total != null ? { total: detail.total } : {}),
            ...(detail?.detail != null ? { detail: detail.detail } : {}),
        };
        return stages;
    });
}
export async function setStage(analysisId, stage, status, error) {
    await mergeStages(analysisId, (stages) => {
        const current = stages[stage] ?? {};
        stages[stage] = {
            ...current,
            status,
            ...(status === 'running'
                ? {
                    startedAt: current.status === 'completed' || current.status === 'failed'
                        ? new Date().toISOString()
                        : (current.startedAt ?? new Date().toISOString()),
                    completedAt: null,
                    error: null,
                    ...(current.status === 'completed' || current.status === 'failed'
                        ? { processed: 0, total: undefined, detail: null }
                        : {}),
                }
                : {}),
            ...(status === 'completed'
                ? { completedAt: new Date().toISOString(), error: null }
                : {}),
            ...(status === 'failed'
                ? { completedAt: new Date().toISOString(), error: error ?? 'Unknown error' }
                : {}),
        };
        return stages;
    });
}
export async function setProgress(analysisId, stage, processed, total, detail) {
    await mergeStages(analysisId, (stages) => {
        const current = stages[stage] ?? { status: 'running' };
        if (current.status === 'completed')
            return stages;
        stages[stage] = {
            ...current,
            status: 'running',
            processed: Math.max(current.processed ?? 0, processed),
            total: Math.max(current.total ?? 0, total),
            detail: detail ?? `page ${Math.max(current.processed ?? 0, processed)}/${Math.max(current.total ?? 0, total)}`,
        };
        return stages;
    });
}
export async function updateAnalysisStep(analysisId, patch) {
    const { error } = await sb()
        .from('clash_gap_analyses')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', analysisId);
    if (error)
        throw new Error(error.message);
}
export async function setFileChunkStatus(fileId, status, error) {
    const { error: dbError } = await sb()
        .from('clash_gap_analysis_files')
        .update({
        chunk_status: status,
        chunk_error: status === 'failed' ? error ?? 'Chunk failed' : null,
    })
        .eq('id', fileId);
    if (dbError && !dbError.message.toLowerCase().includes('chunk_status')) {
        throw new Error(dbError.message);
    }
}
