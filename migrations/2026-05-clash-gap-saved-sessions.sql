-- Optional: dedicated columns for saved sessions (app also stores save state in summary jsonb).
-- Run once in Supabase SQL editor after 2026-05-clash-gap-staged-pipeline.sql.

BEGIN;

ALTER TABLE IF EXISTS public.clash_gap_analyses
  ADD COLUMN IF NOT EXISTS saved_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_clash_gap_analyses_saved
  ON public.clash_gap_analyses (account_id, saved_at DESC)
  WHERE saved_at IS NOT NULL;

COMMIT;
