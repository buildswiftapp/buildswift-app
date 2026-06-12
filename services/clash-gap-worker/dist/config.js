import { loadWorkerEnv } from './load-env.js';
loadWorkerEnv();
function intEnv(name, fallback, min = 1) {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}
export const config = {
    port: intEnv('PORT', 8080, 1),
    supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    workerSecret: process.env.WORKER_SECRET || '',
    storageBucket: process.env.CLASH_GAP_BUCKET || 'document-attachments',
    supabasePageSize: 1000,
    chunkDpi: intEnv('CHUNK_DPI', 300, 72),
    chunkJpegQuality: intEnv('CHUNK_JPEG_QUALITY', 92, 50),
    chunkMaxImageWidth: intEnv('CHUNK_MAX_IMAGE_WIDTH', 4800, 512),
    chunkRenderWorkers: intEnv('CHUNK_RENDER_WORKERS', 3, 1),
    chunkWorkers: intEnv('CHUNK_WORKERS', 6, 1),
    chunkBatchSize: intEnv('CHUNK_BATCH_SIZE', 1, 1),
    chunkPageBatchSize: intEnv('CHUNK_PAGE_BATCH_SIZE', 40, 1),
    maxPagesPerFile: intEnv('CLASH_GAP_MAX_PAGES_PER_FILE', 5000, 1),
    ocrWorkers: intEnv('OCR_WORKERS', 4, 1),
    ocrPageWorkers: intEnv('OCR_PAGE_WORKERS', 6, 1),
    /** DPI for OCR-only re-renders (higher than chunk preview for readable small text). */
    ocrDpi: intEnv('OCR_DPI', 400, 72),
    ocrMaxImageWidth: intEnv('OCR_MAX_IMAGE_WIDTH', 6400, 512),
    ocrEmbeddedMinLen: intEnv('OCR_EMBEDDED_MIN_LEN', 120, 0),
    /** Default true: CAD/architectural PDFs often have garbled embedded text layers. */
    ocrForceImage: process.env.OCR_FORCE_IMAGE !== '0' && process.env.OCR_FORCE_IMAGE !== 'false',
    ocrProgressEvery: intEnv('OCR_PROGRESS_EVERY', 5, 1),
    documentAiProjectId: process.env.DOCUMENT_AI_PROJECT_ID?.trim() ||
        process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
        '',
    documentAiLocation: process.env.DOCUMENT_AI_LOCATION?.trim() || 'us',
    documentAiProcessorId: process.env.DOCUMENT_AI_PROCESSOR_ID?.trim() || '',
};
export function isDocumentAiConfigured() {
    return Boolean(config.documentAiProjectId && config.documentAiProcessorId);
}
export function assertConfig() {
    if (!config.supabaseUrl)
        throw new Error('SUPABASE_URL is required');
    if (!config.supabaseServiceKey)
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
    if (!config.workerSecret)
        throw new Error('WORKER_SECRET is required');
    if (!isDocumentAiConfigured()) {
        throw new Error('Document AI is required. Set DOCUMENT_AI_PROJECT_ID and DOCUMENT_AI_PROCESSOR_ID. ' +
            'Local dev: also set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON key.');
    }
}
