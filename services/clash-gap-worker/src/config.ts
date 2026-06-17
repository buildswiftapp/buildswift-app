import { loadWorkerEnv } from './load-env.js'

loadWorkerEnv()

function intEnv(name: string, fallback: number, min = 1): number {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback
}

export const config = {
  port: intEnv('PORT', 8080, 1),
  supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  workerSecret: process.env.WORKER_SECRET || '',
  storageBucket: process.env.CLASH_GAP_BUCKET || 'document-attachments',
  supabasePageSize: 1000,
  chunkDpi: intEnv('CHUNK_DPI', 180, 72),
  chunkJpegQuality: intEnv('CHUNK_JPEG_QUALITY', 85, 50),
  chunkMaxImageWidth: intEnv('CHUNK_MAX_IMAGE_WIDTH', 3200, 512),
  chunkRenderWorkers: intEnv('CHUNK_RENDER_WORKERS', 4, 1),
  chunkWorkers: intEnv('CHUNK_WORKERS', 8, 1),
  chunkBatchSize: intEnv('CHUNK_BATCH_SIZE', 5, 1),
  chunkPageBatchSize: intEnv('CHUNK_PAGE_BATCH_SIZE', 40, 1),
  chunkProgressEvery: intEnv('CHUNK_PROGRESS_EVERY', 5, 1),
  chunkFileWorkers: intEnv('CHUNK_FILE_WORKERS', 2, 1),
  maxPagesPerFile: intEnv('CLASH_GAP_MAX_PAGES_PER_FILE', 5000, 1),
  ocrWorkers: intEnv('OCR_WORKERS', 4, 1),
  ocrPageWorkers: intEnv('OCR_PAGE_WORKERS', 8, 1),
  ocrSpecDpi: intEnv('OCR_SPEC_DPI', 250, 72),
  ocrPlanDpi: intEnv('OCR_PLAN_DPI', 500, 72),
  ocrMaxImageWidth: intEnv('OCR_MAX_IMAGE_WIDTH', 8000, 512),
  ocrEmbeddedMinLen: intEnv('OCR_EMBEDDED_MIN_LEN', 120, 0),
  ocrSpecMinLen: intEnv('OCR_SPEC_MIN_LEN', 120, 0),
  ocrPlanMinLen: intEnv('OCR_PLAN_MIN_LEN', 400, 0),
  ocrPlanEmbeddedMinLen: intEnv('OCR_PLAN_EMBEDDED_MIN_LEN', 400, 0),
  ocrTileWorkers: intEnv('OCR_TILE_WORKERS', 3, 1),
  ocrRegionWorkers: intEnv('OCR_REGION_WORKERS', 6, 1),
  ocrProgressEvery: intEnv('OCR_PROGRESS_EVERY', 5, 1),
  ocrEngineVersion: process.env.OCR_ENGINE_VERSION?.trim() || 'vision-v3-region',
  googleCloudProject:
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    '',
}

export function isVisionOcrConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
      config.googleCloudProject ||
      process.env.K_SERVICE?.trim() ||
      process.env.GOOGLE_GCE_PROJECT?.trim(),
  )
}

export function assertConfig(): void {
  if (!config.supabaseUrl) throw new Error('SUPABASE_URL is required')
  if (!config.supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  if (!config.workerSecret) throw new Error('WORKER_SECRET is required')
  if (!isVisionOcrConfigured()) {
    throw new Error(
      'Google Cloud Vision OCR is required. Local dev: set GOOGLE_APPLICATION_CREDENTIALS and GOOGLE_CLOUD_PROJECT. ' +
        'Cloud Run: attach a service account with roles/vision.apiUser.',
    )
  }
}
