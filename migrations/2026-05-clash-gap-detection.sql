-- Clash & Gap Detection tables + projects.job_number
-- Run once in Supabase SQL editor.

BEGIN;

ALTER TABLE IF EXISTS public.projects
  ADD COLUMN IF NOT EXISTS job_number text;

CREATE TABLE IF NOT EXISTS public.clash_gap_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'uploading', 'queued', 'processing', 'completed', 'failed')),
  processing_step text
    CHECK (processing_step IS NULL OR processing_step IN ('extract', 'classify', 'structure', 'analyze', 'done')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.clash_gap_analysis_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.clash_gap_analyses(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  file_role text NOT NULL CHECK (file_role IN ('plans', 'specs', 'addenda')),
  sha256 text,
  page_count int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clash_gap_extracted_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_file_id uuid NOT NULL REFERENCES public.clash_gap_analysis_files(id) ON DELETE CASCADE,
  sheet_id text,
  discipline text,
  page_index int NOT NULL,
  raw_text text,
  structured jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_file_id, page_index)
);

CREATE TABLE IF NOT EXISTS public.clash_gap_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.clash_gap_analyses(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  issue_key text,
  type text NOT NULL CHECK (type IN ('clash', 'gap', 'mismatch')),
  title text NOT NULL,
  description text NOT NULL,
  location text,
  sheet_reference text,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'Low', 'Medium', 'High')),
  suggested_action text,
  confidence_score numeric,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'dismissed', 'resolved')),
  resolved_document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clash_gap_issue_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.clash_gap_issues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('dismiss', 'review', 'create_rfi', 'create_co', 'resolve')),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clash_gap_analyses_account_project
  ON public.clash_gap_analyses (account_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clash_gap_analysis_files_analysis
  ON public.clash_gap_analysis_files (analysis_id);

CREATE INDEX IF NOT EXISTS idx_clash_gap_analysis_files_sha256
  ON public.clash_gap_analysis_files (sha256) WHERE sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clash_gap_issues_analysis_status
  ON public.clash_gap_issues (analysis_id, status);

CREATE INDEX IF NOT EXISTS idx_clash_gap_issue_actions_issue
  ON public.clash_gap_issue_actions (issue_id, created_at DESC);

ALTER TABLE public.clash_gap_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clash_gap_analysis_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clash_gap_extracted_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clash_gap_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clash_gap_issue_actions ENABLE ROW LEVEL SECURITY;

-- Tenant policies via account_members (same pattern as other tenant tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clash_gap_analyses' AND policyname = 'clash_gap_analyses_tenant'
  ) THEN
    CREATE POLICY clash_gap_analyses_tenant ON public.clash_gap_analyses
      FOR ALL
      USING (
        account_id IN (
          SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        account_id IN (
          SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clash_gap_analysis_files' AND policyname = 'clash_gap_analysis_files_tenant'
  ) THEN
    CREATE POLICY clash_gap_analysis_files_tenant ON public.clash_gap_analysis_files
      FOR ALL
      USING (
        account_id IN (
          SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        account_id IN (
          SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clash_gap_issues' AND policyname = 'clash_gap_issues_tenant'
  ) THEN
    CREATE POLICY clash_gap_issues_tenant ON public.clash_gap_issues
      FOR ALL
      USING (
        account_id IN (
          SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        account_id IN (
          SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

COMMIT;
