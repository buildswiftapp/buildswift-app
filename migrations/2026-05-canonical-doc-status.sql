-- =============================================================================
-- Canonical document status migration (Phase 1: dual-write)
-- =============================================================================
--
-- Adds a single canonical `status` column to each of the three document
-- tables (rfi_documents, submittal_documents, change_order_documents),
-- enforces a CHECK constraint per doc type's vocabulary, backfills the new
-- column from the legacy `internal_status` / `external_status` columns plus
-- the latest review_cycle.status, and adds an `outcome` column to
-- review_requests so reviewers can express the expanded outcome set
-- (approved / approved_as_noted / revise_and_resubmit / rejected / answered)
-- without breaking the legacy `decision` (approve / reject) check.
--
-- Run this once via the Supabase SQL editor (or `psql`). Application code
-- continues to dual-write `internal_status` / `external_status` after this
-- migration so the rollout is reversible.
--
-- Source-of-truth canonical vocabularies (mirrored in lib/status.ts):
--   RFI:           pending | answered | closed
--   Submittal:     pending_review | approved | approved_as_noted
--                  | revise_and_resubmit | rejected | closed
--   Change order:  draft | under_review | approved | rejected | closed
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Add the canonical column with a sensible default per doc type.
-- -----------------------------------------------------------------------------
ALTER TABLE rfi_documents
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

ALTER TABLE submittal_documents
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_review';

ALTER TABLE change_order_documents
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

-- -----------------------------------------------------------------------------
-- 2. Backfill from legacy fields + latest review_cycle.status
--    (mirrors lib/status.ts -> backfillFromLegacy)
-- -----------------------------------------------------------------------------

-- RFI: any decision => answered, otherwise pending.
UPDATE rfi_documents r
SET status = CASE
  WHEN COALESCE(LOWER(r.internal_status), '') IN ('approved', 'rejected')
    OR COALESCE(LOWER(r.external_status), '') IN ('approved', 'rejected')
    OR EXISTS (
      SELECT 1 FROM review_cycles c
      WHERE c.document_id = r.id
        AND LOWER(c.status::text) IN ('approved', 'rejected')
    )
  THEN 'answered'
  ELSE 'pending'
END
WHERE r.status IS NULL OR r.status = 'pending';

-- Submittal: approved / rejected / else pending_review.
-- (approved_as_noted and revise_and_resubmit cannot be inferred from the
--  legacy binary decision; admins can adjust manually post-migration.)
UPDATE submittal_documents s
SET status = CASE
  WHEN COALESCE(LOWER(s.internal_status), '') = 'approved'
    OR COALESCE(LOWER(s.external_status), '') = 'approved'
    OR EXISTS (
      SELECT 1 FROM review_cycles c
      WHERE c.document_id = s.id AND LOWER(c.status::text) = 'approved'
    )
  THEN 'approved'
  WHEN COALESCE(LOWER(s.internal_status), '') = 'rejected'
    OR COALESCE(LOWER(s.external_status), '') = 'rejected'
    OR EXISTS (
      SELECT 1 FROM review_cycles c
      WHERE c.document_id = s.id AND LOWER(c.status::text) = 'rejected'
    )
  THEN 'rejected'
  ELSE 'pending_review'
END
WHERE s.status IS NULL OR s.status = 'pending_review';

-- Change order: approved / rejected / under_review / draft.
UPDATE change_order_documents co
SET status = CASE
  WHEN COALESCE(LOWER(co.internal_status), '') = 'approved'
    OR COALESCE(LOWER(co.external_status), '') = 'approved'
    OR EXISTS (
      SELECT 1 FROM review_cycles c
      WHERE c.document_id = co.id AND LOWER(c.status::text) = 'approved'
    )
  THEN 'approved'
  WHEN COALESCE(LOWER(co.internal_status), '') = 'rejected'
    OR COALESCE(LOWER(co.external_status), '') = 'rejected'
    OR EXISTS (
      SELECT 1 FROM review_cycles c
      WHERE c.document_id = co.id AND LOWER(c.status::text) = 'rejected'
    )
  THEN 'rejected'
  WHEN COALESCE(LOWER(co.internal_status), '') IN ('in_review', 'pending_reviewer', 'revising')
    OR COALESCE(LOWER(co.external_status), '') IN ('sent', 'pending_reviewer')
  THEN 'under_review'
  ELSE 'draft'
END
WHERE co.status IS NULL OR co.status = 'draft';

-- -----------------------------------------------------------------------------
-- 3. Enforce per-table CHECK constraints (drop-then-add to be re-runnable).
-- -----------------------------------------------------------------------------
ALTER TABLE rfi_documents
  DROP CONSTRAINT IF EXISTS rfi_documents_status_chk;
ALTER TABLE rfi_documents
  ADD CONSTRAINT rfi_documents_status_chk
  CHECK (status IN ('pending', 'answered', 'closed'));

ALTER TABLE submittal_documents
  DROP CONSTRAINT IF EXISTS submittal_documents_status_chk;
ALTER TABLE submittal_documents
  ADD CONSTRAINT submittal_documents_status_chk
  CHECK (status IN (
    'pending_review',
    'approved',
    'approved_as_noted',
    'revise_and_resubmit',
    'rejected',
    'closed'
  ));

ALTER TABLE change_order_documents
  DROP CONSTRAINT IF EXISTS change_order_documents_status_chk;
ALTER TABLE change_order_documents
  ADD CONSTRAINT change_order_documents_status_chk
  CHECK (status IN ('draft', 'under_review', 'approved', 'rejected', 'closed'));

-- -----------------------------------------------------------------------------
-- 4. Helpful indexes for status filtering on lists/dashboards.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS rfi_documents_status_idx
  ON rfi_documents (account_id, status);
CREATE INDEX IF NOT EXISTS submittal_documents_status_idx
  ON submittal_documents (account_id, status);
CREATE INDEX IF NOT EXISTS change_order_documents_status_idx
  ON change_order_documents (account_id, status);

-- -----------------------------------------------------------------------------
-- 5. Reviewer outcome column on review_requests
--    (keeps legacy `decision` IN ('approve','reject') intact).
-- -----------------------------------------------------------------------------
ALTER TABLE review_requests
  ADD COLUMN IF NOT EXISTS outcome text NULL;

ALTER TABLE review_requests
  DROP CONSTRAINT IF EXISTS review_requests_outcome_chk;
ALTER TABLE review_requests
  ADD CONSTRAINT review_requests_outcome_chk
  CHECK (
    outcome IS NULL
    OR outcome IN (
      'approved',
      'approved_as_noted',
      'revise_and_resubmit',
      'rejected',
      'answered'
    )
  );

-- Backfill outcome from legacy decision (approve -> approved, reject -> rejected).
UPDATE review_requests
SET outcome = CASE
  WHEN decision = 'approve' THEN 'approved'
  WHEN decision = 'reject' THEN 'rejected'
  ELSE NULL
END
WHERE outcome IS NULL
  AND decision IS NOT NULL;

COMMIT;
