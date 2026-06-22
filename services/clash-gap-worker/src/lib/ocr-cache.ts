import { config } from '../config.js'
import type { OcrStructuredData } from './sheet-structure.js'
import type { FileRole, PageKind } from './page-router.js'
import { sb } from '../supabase.js'

export type OcrCacheLookup = {
  sha256: string
  pageIndex: number
  fileRole: FileRole
  pageKind: PageKind
  dpi: number
}

export type OcrCacheEntry = {
  ocr_text: string
  structured: OcrStructuredData | null
}

function cacheEnabled(): boolean {
  const v = (process.env.OCR_CACHE_ENABLED ?? '1').toLowerCase()
  return v !== '0' && v !== 'false' && v !== 'off'
}

export function buildOcrCacheKey(params: OcrCacheLookup): string {
  return [
    params.sha256,
    params.pageIndex,
    params.fileRole,
    params.pageKind,
    params.dpi,
    config.ocrEngineVersion,
  ].join(':')
}

export async function lookupOcrCache(params: OcrCacheLookup): Promise<OcrCacheEntry | null> {
  if (!cacheEnabled() || !params.sha256) return null

  const cacheKey = buildOcrCacheKey(params)
  const { data, error } = await sb()
    .from('clash_gap_ocr_cache')
    .select('ocr_text, structured, hit_count')
    .eq('cache_key', cacheKey)
    .maybeSingle()

  if (error || !data) return null

  const hits = Number((data as { hit_count?: number }).hit_count ?? 0) + 1
  try {
    await sb()
      .from('clash_gap_ocr_cache')
      .update({ hit_count: hits, last_hit_at: new Date().toISOString() })
      .eq('cache_key', cacheKey)
  } catch {
    // non-fatal
  }

  return {
    ocr_text: String(data.ocr_text ?? ''),
    structured: (data.structured as OcrStructuredData | null) ?? null,
  }
}

export async function storeOcrCache(
  params: OcrCacheLookup,
  result: OcrCacheEntry,
): Promise<void> {
  if (!cacheEnabled() || !params.sha256) return

  const cacheKey = buildOcrCacheKey(params)
  const { error } = await sb()
    .from('clash_gap_ocr_cache')
    .upsert(
      {
        cache_key: cacheKey,
        sha256: params.sha256,
        page_index: params.pageIndex,
        file_role: params.fileRole,
        page_kind: params.pageKind,
        dpi: params.dpi,
        engine_version: config.ocrEngineVersion,
        ocr_text: result.ocr_text,
        structured: result.structured,
      },
      { onConflict: 'cache_key' },
    )

  if (error) {
    console.warn('[clash-gap ocr] cache store failed', cacheKey, error.message)
  }
}
