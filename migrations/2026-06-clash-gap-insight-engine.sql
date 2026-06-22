-- INSIGHT AI Review Engine — extended issue metadata
-- Run once in Supabase SQL editor after prior clash-gap migrations.

BEGIN;

ALTER TABLE IF EXISTS public.clash_gap_issues
  ADD COLUMN IF NOT EXISTS issue_type_v2 text,
  ADD COLUMN IF NOT EXISTS insight_category text,
  ADD COLUMN IF NOT EXISTS csi_division_primary text,
  ADD COLUMN IF NOT EXISTS csi_divisions_secondary jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence_strength text,
  ADD COLUMN IF NOT EXISTS contractor_impact text,
  ADD COLUMN IF NOT EXISTS recommended_action text,
  ADD COLUMN IF NOT EXISTS missing_information_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS impacted_trades jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS drawing_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS specification_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS addendum_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS why_it_matters text,
  ADD COLUMN IF NOT EXISTS decision_rationale text,
  ADD COLUMN IF NOT EXISTS suggested_resolution text,
  ADD COLUMN IF NOT EXISTS cost_risk text,
  ADD COLUMN IF NOT EXISTS schedule_risk text,
  ADD COLUMN IF NOT EXISTS field_risk text,
  ADD COLUMN IF NOT EXISTS procurement_risk text,
  ADD COLUMN IF NOT EXISTS related_issue_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS document_search_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS key_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS insight_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Allow Critical severity (stored internally for sorting; hidden from compact card)
ALTER TABLE public.clash_gap_issues
  DROP CONSTRAINT IF EXISTS clash_gap_issues_severity_check;

ALTER TABLE public.clash_gap_issues
  ADD CONSTRAINT clash_gap_issues_severity_check
  CHECK (severity IN ('low', 'medium', 'high', 'critical', 'Low', 'Medium', 'High', 'Critical'));

COMMIT;
