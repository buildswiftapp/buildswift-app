-- Clash & Gap Detection: persistent OCR result cache keyed by file hash + page + engine.
-- Run once in Supabase SQL editor after prior clash-gap migrations.

BEGIN;

CREATE TABLE IF NOT EXISTS public.clash_gap_ocr_cache (
  cache_key text PRIMARY KEY,
  sha256 text NOT NULL,
  page_index int NOT NULL,
  file_role text NOT NULL,
  page_kind text NOT NULL,
  dpi int NOT NULL,
  engine_version text NOT NULL,
  ocr_text text NOT NULL DEFAULT '',
  structured jsonb,
  hit_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_hit_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_clash_gap_ocr_cache_sha256_page
  ON public.clash_gap_ocr_cache (sha256, page_index, engine_version);

ALTER TABLE public.clash_gap_ocr_cache ENABLE ROW LEVEL SECURITY;

COMMIT;
