import { createHash } from 'crypto';
import pLimit from 'p-limit';
import { config } from '../config.js';
import { extractEmbeddedTextFromPage } from '../lib/embedded-text.js';
import { ocrImageWithVisionRegions } from '../lib/image-regions.js';
import { ocrImageWithVisionTiles } from '../lib/image-tiles.js';
import { lookupOcrCache, storeOcrCache } from '../lib/ocr-cache.js';
import { minTextLengthForKind, normalizeFileRole, ocrDpiForKind, resolvePageKind, shouldRunTiledEscalation, shouldUseRegionOcr, } from '../lib/page-router.js';
import { renderPageToPng } from '../lib/pdf.js';
import { PdfCache } from '../lib/pdf-cache.js';
import { buildStructuredFromBlocks, buildStructuredFromRegions, structuredForEmbeddedText, } from '../lib/sheet-structure.js';
import { mergePageTexts, ocrQualityPasses, isUsableEmbeddedText } from '../lib/text-quality.js';
import { normalizeEmbeddedText, normalizeOcrText } from '../lib/text-normalize.js';
import { ocrImageWithVisionDetailed } from '../lib/vision-ocr.js';
import { markStageCompleted, setProgress, setStage, updateAnalysisStep } from '../lib/stages.js';
import { fetchAllRows } from '../lib/storage.js';
import { sb } from '../supabase.js';
function sha256Buffer(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}
function isPdfFile(file) {
    const mime = (file.mime_type || '').toLowerCase();
    return mime.includes('pdf') || file.file_name.toLowerCase().endsWith('.pdf');
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
        .select('id, storage_path, file_name, mime_type, file_role, sha256')
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
        .select('id, analysis_file_id, page_index, ocr_text, structured')
        .in('analysis_file_id', fileIds)
        .order('analysis_file_id', { ascending: true })
        .order('page_index', { ascending: true })
        .range(from, to));
    const fileOrdinal = new Map(fileIds.map((id, index) => [id, index + 1]));
    const multipleFiles = fileIds.length > 1;
    for (const sheet of sheets) {
        const rawText = normalizeOcrText(sheet.ocr_text || '');
        const structured = sheet.structured;
        const hint = structured?.sheet_id_hint?.trim();
        const pageLabel = multipleFiles
            ? `Doc${fileOrdinal.get(sheet.analysis_file_id) ?? '?'}-Page-${sheet.page_index + 1}`
            : `Page-${sheet.page_index + 1}`;
        const { error } = await sb()
            .from('clash_gap_extracted_sheets')
            .update({
            raw_text: rawText,
            sheet_id: hint || pageLabel,
        })
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
async function loadPageImage(sheet, file, pdfCache, dpi) {
    if (pdfCache && file && isPdfFile(file)) {
        try {
            const { doc } = await pdfCache.get(file.id, file.storage_path);
            return await renderPageToPng(doc, sheet.page_index, dpi, {
                maxWidth: config.ocrMaxImageWidth,
            });
        }
        catch (e) {
            console.warn('[clash-gap ocr] render failed, using chunk image', sheet.id, e);
        }
    }
    return downloadFromStorage(sheet.image_path);
}
async function ocrPage(params) {
    const { sheet, file, pdfCache, embeddedText, fileSha256, onCacheHit } = params;
    const fileRole = normalizeFileRole(file.file_role);
    const kind = resolvePageKind(fileRole, embeddedText);
    const minLen = minTextLengthForKind(kind);
    const embedded = normalizeEmbeddedText(embeddedText);
    const dpi = ocrDpiForKind(kind);
    const sha256 = fileSha256 ?? file.sha256 ?? null;
    if (sha256) {
        const cached = await lookupOcrCache({
            sha256,
            pageIndex: sheet.page_index,
            fileRole,
            pageKind: kind,
            dpi,
        });
        if (cached) {
            onCacheHit?.();
            return { text: cached.ocr_text, structured: cached.structured };
        }
    }
    if (kind === 'TEXT') {
        const result = {
            text: embedded,
            structured: embedded ? structuredForEmbeddedText(embedded) : null,
        };
        if (sha256) {
            await storeOcrCache({ sha256, pageIndex: sheet.page_index, fileRole, pageKind: kind, dpi }, { ocr_text: result.text, structured: result.structured });
        }
        return result;
    }
    let merged = embedded;
    let structured = null;
    try {
        const buffer = await loadPageImage(sheet, file, pdfCache, dpi);
        if (shouldUseRegionOcr(fileRole, kind)) {
            const regionResult = await ocrImageWithVisionRegions(buffer, config.ocrRegionWorkers);
            merged = normalizeOcrText(mergePageTexts(merged, regionResult.text));
            structured = buildStructuredFromRegions({
                regions: regionResult.regions,
                fullText: merged,
            });
        }
        else {
            const detailed = await ocrImageWithVisionDetailed(buffer);
            merged = normalizeOcrText(mergePageTexts(merged, detailed.text));
            structured = buildStructuredFromBlocks({
                blocks: detailed.blocks,
                fullText: merged,
            });
        }
    }
    catch (e) {
        console.warn('[clash-gap ocr] Vision OCR failed', sheet.id, kind, e);
    }
    if (!ocrQualityPasses(merged, minLen) && shouldRunTiledEscalation(kind)) {
        try {
            const buffer = await loadPageImage(sheet, file, pdfCache, dpi);
            const tiled = normalizeOcrText(await ocrImageWithVisionTiles(buffer, config.ocrTileWorkers));
            if (tiled) {
                merged = normalizeOcrText(mergePageTexts(merged, tiled));
                if (structured) {
                    structured = {
                        ...structured,
                        blocks: [...structured.blocks, { label: 'tiled_fallback', text: tiled }],
                    };
                }
            }
        }
        catch (e) {
            console.warn('[clash-gap ocr] tiled Vision OCR failed', sheet.id, e);
        }
    }
    let result;
    if (merged) {
        result = { text: merged, structured };
    }
    else if (isUsableEmbeddedText(embedded)) {
        result = { text: embedded, structured: structuredForEmbeddedText(embedded) };
    }
    else {
        result = { text: '', structured: null };
    }
    if (sha256) {
        await storeOcrCache({ sha256, pageIndex: sheet.page_index, fileRole, pageKind: kind, dpi }, { ocr_text: result.text, structured: result.structured });
    }
    return result;
}
async function ocrPdfFile(file, sheets, pdfCache, onCacheHit) {
    const results = new Map();
    const { doc } = await pdfCache.get(file.id, file.storage_path);
    const fileSha256 = file.sha256;
    const pageLimit = pLimit(config.ocrPageWorkers);
    await Promise.all(sheets.map((sheet) => pageLimit(async () => {
        const embedded = await extractEmbeddedTextFromPage(doc, sheet.page_index);
        results.set(sheet.id, await ocrPage({
            sheet,
            file,
            pdfCache,
            embeddedText: embedded.fullText.trim(),
            fileSha256,
            onCacheHit,
        }));
    })));
    return results;
}
async function ocrImageSheets(sheets, file, pdfCache, onCacheHit) {
    const results = new Map();
    let fileSha256 = file.sha256;
    if (!fileSha256) {
        try {
            const buffer = await downloadFromStorage(file.storage_path);
            fileSha256 = sha256Buffer(buffer);
            await sb()
                .from('clash_gap_analysis_files')
                .update({ sha256: fileSha256 })
                .eq('id', file.id);
        }
        catch {
            fileSha256 = null;
        }
    }
    const pageLimit = pLimit(config.ocrPageWorkers);
    await Promise.all(sheets.map((sheet) => pageLimit(async () => {
        results.set(sheet.id, await ocrPage({
            sheet,
            file,
            pdfCache,
            embeddedText: '',
            fileSha256,
            onCacheHit,
        }));
    })));
    return results;
}
async function saveSheetOcr(sheetId, result) {
    const update = {
        ocr_text: result.text,
        structured: result.structured,
    };
    const { error } = await sb()
        .from('clash_gap_extracted_sheets')
        .update(update)
        .eq('id', sheetId);
    if (error)
        throw new Error(error.message);
}
export async function runOcrJob(analysisId) {
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
                .update({ ocr_text: null, raw_text: null, structured: null })
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
        let cacheHits = 0;
        await setProgress(analysisId, 'ocr', processed, totalWithImages, `page ${processed}/${totalWithImages}`);
        const limit = pLimit(config.ocrWorkers);
        let sinceProgress = 0;
        await Promise.all([...groupByFile(todo).entries()].map(([fileId, sheets]) => limit(async () => {
            const file = files.get(fileId);
            if (!file) {
                failedPages += sheets.length;
                return;
            }
            try {
                const onCacheHit = () => {
                    cacheHits += 1;
                };
                const results = isPdfFile(file)
                    ? await ocrPdfFile(file, sheets, pdfCache, onCacheHit)
                    : await ocrImageSheets(sheets, file, pdfCache, onCacheHit);
                for (const sheet of sheets) {
                    await saveSheetOcr(sheet.id, results.get(sheet.id) ?? { text: '', structured: null });
                }
            }
            catch (e) {
                failedPages += sheets.length;
                const message = e instanceof Error ? e.message : String(e);
                console.error('[clash-gap ocr] file failed', fileId, message);
                let recovered = false;
                if (isPdfFile(file)) {
                    try {
                        const { doc } = await pdfCache.get(file.id, file.storage_path);
                        for (const sheet of sheets) {
                            const embedded = await extractEmbeddedTextFromPage(doc, sheet.page_index);
                            const fallback = isUsableEmbeddedText(embedded.fullText)
                                ? normalizeEmbeddedText(embedded.fullText)
                                : '';
                            const structured = fallback ? structuredForEmbeddedText(fallback) : null;
                            await sb()
                                .from('clash_gap_extracted_sheets')
                                .update({ ocr_text: fallback, structured })
                                .eq('id', sheet.id);
                        }
                        recovered = true;
                    }
                    catch {
                    }
                }
                if (!recovered) {
                    for (const sheet of sheets) {
                        await sb()
                            .from('clash_gap_extracted_sheets')
                            .update({ ocr_text: '', structured: null })
                            .eq('id', sheet.id);
                    }
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
            ? `${totalWithImages} page(s) read via Google Vision OCR (${failedPages} with errors${cacheHits ? `, ${cacheHits} from cache` : ''}).`
            : cacheHits > 0
                ? `${totalWithImages} page(s) read via Google Vision OCR (${cacheHits} from cache).`
                : `${totalWithImages} page(s) read via Google Vision OCR.`;
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
