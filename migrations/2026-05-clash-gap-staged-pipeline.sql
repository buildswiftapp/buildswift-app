-- Clash & Gap Detection: staged (gated) pipeline + per-page artifacts.
-- Run once in Supabase SQL editor after 2026-05-clash-gap-detection.sql.

BEGIN;

-- Per-stage execution state for the gated pipeline (chunk / ocr / merge / detect).
ALTER TABLE IF EXISTS public.clash_gap_analyses
  ADD COLUMN IF NOT EXISTS stages jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Allow the new processing_step values used by the staged pipeline.
ALTER TABLE public.clash_gap_analyses
  DROP CONSTRAINT IF EXISTS clash_gap_analyses_processing_step_check;

ALTER TABLE public.clash_gap_analyses
  ADD CONSTRAINT clash_gap_analyses_processing_step_check
  CHECK (
    processing_step IS NULL OR processing_step IN (
      'extract', 'classify', 'structure', 'analyze', 'done',
      'chunk', 'ocr', 'merge', 'detect'
    )
  );

-- Per-page artifacts: rendered page image + per-page OCR text, kept distinct
-- from the merged raw_text so each stage can be reviewed and downloaded.
ALTER TABLE IF EXISTS public.clash_gap_extracted_sheets
  ADD COLUMN IF NOT EXISTS image_path text,
  ADD COLUMN IF NOT EXISTS ocr_text text;

COMMIT;
