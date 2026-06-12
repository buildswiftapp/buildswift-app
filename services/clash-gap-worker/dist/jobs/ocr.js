import pLimit from 'p-limit';
import { config } from '../config.js';
import { processImageWithDocumentAi } from '../lib/document-ai.js';
import { extractEmbeddedTextFromPage } from '../lib/embedded-text.js';
import { renderPageToJpeg } from '../lib/pdf.js';
import { PdfCache } from '../lib/pdf-cache.js';
import { isUsableEmbeddedText, pickBestPageText } from '../lib/text-quality.js';
import { markStageCompleted, setProgress, setStage, updateAnalysisStep } from '../lib/stages.js';
import { fetchAllRows } from '../lib/storage.js';
import { sb } from '../supabase.js';
function normalizeWhitespace(text) {
    return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
function isPdfFile(file) {
    const mime = (file.mime_type || '').toLowerCase();
    return mime.includes('pdf') || file.file_name.toLowerCase().endsWith('.pdf');
}
function imageMimeType(fileName, buffer) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8)
        return 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50)
        return 'image/png';
    if (/\.jpe?g$/i.test(fileName))
        return 'image/jpeg';
    return 'image/png';
}
function groupByFile(todo) {
    const groups = new Map();
    for (const sheet of todo) {
        const list = groups.get(sheet.analysis_file_id) ?? [];
        list.push(sheet);
        groups.set(sheet.analysis_file_id, list);
    }
    return groups;
}
async function loadFiles(analysisId) {
    const { data, error } = await sb()
        .from('clash_gap_analysis_files')
        .select('id, storage_path, file_name, mime_type')
        .eq('analysis_id', analysisId)
        .order('created_at', { ascending: true });
    if (error)
        throw new Error(error.message);
    return new Map((data ?? []).map((f) => [f.id, f]));
}
async function countSheetsWithImages(analysisId) {
    const { data: files, error: filesError } = await sb()
        .from('clash_gap_analysis_files')
        .select('id')
        .eq('analysis_id', analysisId);
    if (filesError)
        throw new Error(filesError.message);
    const fileIds = (files ?? []).map((f) => f.id);
    if (!fileIds.length)
        return { total: 0, todo: [] };
    const rows = await fetchAllRows(async (from, to) => sb()
        .from('clash_gap_extracted_sheets')
        .select('id, analysis_file_id, page_index, image_path, ocr_text')
        .in('analysis_file_id', fileIds)
        .order('page_index', { ascending: true })
        .range(from, to));
    const withImages = rows.filter((r) => r.image_path);
    const todo = withImages
        .filter((r) => r.ocr_text == null)
        .map((r) => ({
        id: r.id,
        page_index: r.page_index,
        image_path: r.image_path,
        analysis_file_id: r.analysis_file_id,
    }));
    return { total: withImages.length, todo };
}
async function mergeSheets(analysisId) {
    const { data: files, error: filesError } = await sb()
        .from('clash_gap_analysis_files')
        .select('id')
        .eq('analysis_id', analysisId)
        .order('created_at', { ascending: true });
    if (filesError)
        throw new Error(filesError.message);
    const fileIds = (files ?? []).map((f) => f.id);
    if (!fileIds.length)
        return;
    const sheets = await fetchAllRows(async (from, to) => sb()
        .from('clash_gap_extracted_sheets')
        .select('id, analysis_file_id, page_index, ocr_text')
        .in('analysis_file_id', fileIds)
        .order('analysis_file_id', { ascending: true })
        .order('page_index', { ascending: true })
        .range(from, to));
    const fileOrdinal = new Map(fileIds.map((id, index) => [id, index + 1]));
    const multipleFiles = fileIds.length > 1;
    for (const sheet of sheets) {
        const rawText = normalizeWhitespace(sheet.ocr_text || '');
        const pageLabel = multipleFiles
            ? `Doc${fileOrdinal.get(sheet.analysis_file_id) ?? '?'}-Page-${sheet.page_index + 1}`
            : `Page-${sheet.page_index + 1}`;
        const { error } = await sb()
            .from('clash_gap_extracted_sheets')
            .update({ raw_text: rawText, sheet_id: pageLabel })
            .eq('id', sheet.id);
        if (error)
            throw new Error(error.message);
    }
}
async function downloadFromStorage(path) {
    const { data: blob, error } = await sb().storage.from(config.storageBucket).download(path);
    if (error || !blob)
        throw new Error(error?.message || `Download failed: ${path}`);
    return Buffer.from(await blob.arrayBuffer());
}
async function ocrPageImage(sheet, file, pdfCache) {
    let buffer;
    let mime;
    if (pdfCache && file && isPdfFile(file)) {
        const { doc } = await pdfCache.get(file.id, file.storage_path);
        buffer = await renderPageToJpeg(doc, sheet.page_index, config.ocrDpi, {
            maxWidth: config.ocrMaxImageWidth,
            jpegQuality: Math.max(config.chunkJpegQuality, 95),
        });
        mime = 'image/jpeg';
    }
    else {
        buffer = await downloadFromStorage(sheet.image_path);
        mime = imageMimeType(file?.file_name ?? sheet.image_path, buffer);
    }
    return normalizeWhitespace(await processImageWithDocumentAi(buffer, mime));
}
async function ocrPdfFile(file, sheets, pdfCache) {
    const results = new Map();
    const { doc } = await pdfCache.get(file.id, file.storage_path);
    const embeddedByPage = new Map();
    for (const sheet of sheets) {
        embeddedByPage.set(sheet.page_index, await extractEmbeddedTextFromPage(doc, sheet.page_index));
    }
    const needsImageOcr = [];
    for (const sheet of sheets) {
        const embedded = embeddedByPage.get(sheet.page_index);
        const embeddedText = embedded.fullText.trim();
        if (!config.ocrForceImage &&
            embeddedText.length >= config.ocrEmbeddedMinLen &&
            isUsableEmbeddedText(embeddedText)) {
            results.set(sheet.id, normalizeWhitespace(embeddedText));
        }
        else {
            needsImageOcr.push(sheet);
        }
    }
    if (!needsImageOcr.length)
        return results;
    const pageLimit = pLimit(config.ocrPageWorkers);
    await Promise.all(needsImageOcr.map((sheet) => pageLimit(async () => {
        const embeddedText = embeddedByPage.get(sheet.page_index).fullText;
        const imageText = await ocrPageImage(sheet, file, pdfCache);
        results.set(sheet.id, normalizeWhitespace(pickBestPageText(embeddedText, imageText)));
    })));
    return results;
}
async function ocrImageSheets(sheets, file, pdfCache) {
    const results = new Map();
    const pageLimit = pLimit(config.ocrPageWorkers);
    await Promise.all(sheets.map((sheet) => pageLimit(async () => {
        const text = await ocrPageImage(sheet, file, pdfCache);
        results.set(sheet.id, text);
    })));
    return results;
}
export async function runOcrJob(analysisId) {
    await setStage(analysisId, 'ocr', 'running');
    await updateAnalysisStep(analysisId, {
        status: 'processing',
        processing_step: 'ocr',
        error_message: null,
    });
    const pdfCache = new PdfCache();
    try {
        const { data: analysisFiles, error: analysisFilesError } = await sb()
            .from('clash_gap_analysis_files')
            .select('id')
            .eq('analysis_id', analysisId);
        if (analysisFilesError)
            throw new Error(analysisFilesError.message);
        const analysisFileIds = (analysisFiles ?? []).map((f) => f.id);
        if (analysisFileIds.length) {
            const { error: resetError } = await sb()
                .from('clash_gap_extracted_sheets')
                .update({ ocr_text: null, raw_text: null })
                .in('analysis_file_id', analysisFileIds);
            if (resetError)
                throw new Error(resetError.message);
        }
        const files = await loadFiles(analysisId);
        const { total: totalWithImages, todo } = await countSheetsWithImages(analysisId);
        if (!totalWithImages)
            throw new Error('No page images found — run the chunk stage first');
        let processed = totalWithImages - todo.length;
        let failedPages = 0;
        await setProgress(analysisId, 'ocr', processed, totalWithImages, `page ${processed}/${totalWithImages}`);
        const limit = pLimit(config.ocrWorkers);
        let sinceProgress = 0;
        await Promise.all([...groupByFile(todo).entries()].map(([fileId, sheets]) => limit(async () => {
            const file = files.get(fileId);
            try {
                const texts = file && isPdfFile(file)
                    ? await ocrPdfFile(file, sheets, pdfCache)
                    : await ocrImageSheets(sheets, file, pdfCache);
                for (const sheet of sheets) {
                    const { error } = await sb()
                        .from('clash_gap_extracted_sheets')
                        .update({ ocr_text: texts.get(sheet.id) ?? '' })
                        .eq('id', sheet.id);
                    if (error)
                        throw new Error(error.message);
                }
            }
            catch (e) {
                failedPages += sheets.length;
                const message = e instanceof Error ? e.message : String(e);
                console.error('[clash-gap ocr] file failed', fileId, message);
                for (const sheet of sheets) {
                    await sb()
                        .from('clash_gap_extracted_sheets')
                        .update({ ocr_text: '' })
                        .eq('id', sheet.id);
                }
            }
            processed += sheets.length;
            sinceProgress += sheets.length;
            if (sinceProgress >= config.ocrProgressEvery) {
                sinceProgress = 0;
                await setProgress(analysisId, 'ocr', processed, totalWithImages, `page ${processed}/${totalWithImages}`);
            }
        })));
        await setProgress(analysisId, 'ocr', totalWithImages, totalWithImages, 'Merging text per document…');
        await mergeSheets(analysisId);
        const detail = failedPages > 0
            ? `${totalWithImages} page(s) read via Document AI (${failedPages} with errors).`
            : `${totalWithImages} page(s) read via Document AI.`;
        await markStageCompleted(analysisId, 'ocr', {
            processed: totalWithImages,
            total: totalWithImages,
            detail,
        });
        await updateAnalysisStep(analysisId, {
            status: 'processing',
            processing_step: 'ocr',
            error_message: null,
        });
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await setStage(analysisId, 'ocr', 'failed', message);
        await updateAnalysisStep(analysisId, { status: 'failed', error_message: message });
        throw e;
    }
    finally {
        await pdfCache.destroyAll();
    }
}
