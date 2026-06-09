-- INSIGHT Workflow Integration — project-centric issues + scan lineage
-- Run after 2026-06-clash-gap-insight-engine.sql

BEGIN;

-- Canonical project issue (lifecycle survives across scans)
CREATE TABLE IF NOT EXISTS public.project_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  issue_key text,
  title text NOT NULL,
  issue_type_v2 text,
  insight_category text,
  csi_division_primary text,
  severity text NOT NULL DEFAULT 'medium',
  workflow_status text NOT NULL DEFAULT 'open'
    CHECK (workflow_status IN (
      'open', 'under_review', 'internal_review', 'field_verification',
      'rfi_drafting', 'rfi_sent', 'waiting_for_response', 'resolved', 'closed'
    )),
  recommended_action text,
  user_disposition text,
  priority text CHECK (priority IS NULL OR priority IN ('critical', 'high', 'medium', 'low', 'Critical', 'High', 'Medium', 'Low')),
  assigned_to uuid,
  due_date date,
  latest_summary text,
  insight_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_issues_project_status
  ON public.project_issues (project_id, workflow_status);

-- Each scan appearance of a project issue
CREATE TABLE IF NOT EXISTS public.project_issue_scan_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_issue_id uuid NOT NULL REFERENCES public.project_issues(id) ON DELETE CASCADE,
  analysis_id uuid NOT NULL REFERENCES public.clash_gap_analyses(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  finding_summary text,
  evidence_strength text,
  contractor_impact text,
  key_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  insight_metadata jsonb NOT NULL DEFAULT '[]'::jsonb,
  match_rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_issue_id, analysis_id)
);

CREATE INDEX IF NOT EXISTS idx_project_issue_scan_links_analysis
  ON public.project_issue_scan_links (analysis_id);

-- Link scan-level rows to project issues (backward compat for existing UI)
ALTER TABLE IF EXISTS public.clash_gap_issues
  ADD COLUMN IF NOT EXISTS project_issue_id uuid REFERENCES public.project_issues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_status text DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS user_disposition text,
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS match_rationale text,
  ADD COLUMN IF NOT EXISTS is_linked_to_existing boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clash_gap_issues_project_issue
  ON public.clash_gap_issues (project_issue_id);

ALTER TABLE public.project_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_issue_scan_links ENABLE ROW LEVEL SECURITY;

COMMIT;
