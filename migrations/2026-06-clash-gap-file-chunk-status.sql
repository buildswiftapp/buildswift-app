-- Per-file chunk status for reliable multi-PDF completion tracking.
-- Run in Supabase SQL editor after staged-pipeline migration.

BEGIN;

ALTER TABLE IF EXISTS public.clash_gap_analysis_files
  ADD COLUMN IF NOT EXISTS chunk_status text
    CHECK (chunk_status IS NULL OR chunk_status IN ('pending', 'running', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS chunk_error text;

CREATE INDEX IF NOT EXISTS idx_clash_gap_analysis_files_chunk_status
  ON public.clash_gap_analysis_files (analysis_id, chunk_status)
  WHERE chunk_status IS NOT NULL;

COMMIT;
