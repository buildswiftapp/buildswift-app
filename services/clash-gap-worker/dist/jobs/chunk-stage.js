import { createHash } from 'crypto';
import pLimit from 'p-limit';
import { config } from '../config.js';
import { runChunkJob, tryCompleteChunkStage } from './chunk.js';
import { setStage, updateAnalysisStep } from '../lib/stages.js';
import { sb } from '../supabase.js';
function sha256Buffer(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}
function isPdfFile(file) {
    const mime = (file.mime_type || '').toLowerCase();
    return mime.includes('pdf') || file.file_name.toLowerCase().endsWith('.pdf');
}
function isImageUpload(mimeType, fileName) {
    const mime = mimeType.toLowerCase();
    if (mime.startsWith('image/'))
        return true;
    return /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(fileName);
}
async function loadFiles(analysisId) {
    const { data, error } = await sb()
        .from('clash_gap_analysis_files')
        .select('id, storage_path, file_name, mime_type, page_count')
        .eq('analysis_id', analysisId)
        .order('created_at', { ascending: true });
    if (error)
        throw new Error(error.message);
    return (data ?? []);
}
async function registerImageUploads(files) {
    let registered = 0;
    for (const file of files) {
        if (!isImageUpload(file.mime_type || '', file.file_name))
            continue;
        const { data: existingRows } = await sb()
            .from('clash_gap_extracted_sheets')
            .select('id, page_index, image_path')
            .eq('analysis_file_id', file.id)
            .eq('page_index', 0)
            .maybeSingle();
        if (existingRows?.image_path) {
            registered++;
            continue;
        }
        let sha256 = null;
        try {
            const { data: blob, error: dlError } = await sb()
                .storage.from(config.storageBucket)
                .download(file.storage_path);
            if (!dlError && blob) {
                sha256 = sha256Buffer(Buffer.from(await blob.arrayBuffer()));
            }
        }
        catch {
        }
        await sb()
            .from('clash_gap_analysis_files')
            .update({ page_count: 1, ...(sha256 ? { sha256 } : {}) })
            .eq('id', file.id);
        if (existingRows?.id) {
            await sb()
                .from('clash_gap_extracted_sheets')
                .update({ image_path: file.storage_path })
                .eq('id', existingRows.id);
        }
        else {
            await sb().from('clash_gap_extracted_sheets').insert({
                analysis_file_id: file.id,
                sheet_id: 'Page-1',
                page_index: 0,
                image_path: file.storage_path,
            });
        }
        registered++;
    }
    return registered;
}
async function pdfNeedsChunking(file) {
    const { count } = await sb()
        .from('clash_gap_extracted_sheets')
        .select('id', { count: 'exact', head: true })
        .eq('analysis_file_id', file.id)
        .not('image_path', 'is', null);
    const expected = file.page_count ?? 0;
    if (expected > 0 && (count ?? 0) >= expected)
        return false;
    return true;
}
export async function runChunkStageForAnalysis(params) {
    const { analysisId, accountId } = params;
    try {
        const files = await loadFiles(analysisId);
        if (!files.length)
            throw new Error('No files uploaded');
        const processable = files.filter((f) => isPdfFile(f) || isImageUpload(f.mime_type || '', f.file_name));
        if (!processable.length)
            throw new Error('No PDF or image files to chunk');
        await registerImageUploads(processable);
        const pdfJobs = [];
        for (const file of processable) {
            if (!isPdfFile(file))
                continue;
            if (await pdfNeedsChunking(file))
                pdfJobs.push(file);
        }
        if (!pdfJobs.length) {
            await tryCompleteChunkStage(analysisId);
            return;
        }
        const limit = pLimit(config.chunkFileWorkers);
        await Promise.all(pdfJobs.map((file) => limit(() => runChunkJob({
            analysisId,
            fileId: file.id,
            pdfStoragePath: file.storage_path,
            accountId,
        }))));
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await setStage(analysisId, 'chunk', 'failed', message);
        await updateAnalysisStep(analysisId, { status: 'failed', error_message: message });
        throw e;
    }
}
