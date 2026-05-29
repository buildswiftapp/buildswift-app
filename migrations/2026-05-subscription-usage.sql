-- Subscription usage + free trial fields
-- Run once in Supabase SQL editor.

BEGIN;

ALTER TABLE IF EXISTS public.accounts
  ADD COLUMN IF NOT EXISTS trial_start_date timestamptz,
  ADD COLUMN IF NOT EXISTS trial_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS trial_expired boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storage_used_bytes bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz;

-- Monthly usage counters per account (UTC calendar month).
CREATE TABLE IF NOT EXISTS public.account_usage_monthly (
  account_id uuid NOT NULL,
  usage_month date NOT NULL,
  ai_generations_used int NOT NULL DEFAULT 0,
  clash_gap_reports_used int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, usage_month)
);

CREATE INDEX IF NOT EXISTS idx_account_usage_monthly_account_month
  ON public.account_usage_monthly (account_id, usage_month DESC);

ALTER TABLE public.account_usage_monthly ENABLE ROW LEVEL SECURITY;

-- Tenant policy: members of an account can read/write their usage row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'account_usage_monthly'
      AND policyname = 'account_usage_monthly_tenant'
  ) THEN
    CREATE POLICY account_usage_monthly_tenant ON public.account_usage_monthly
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

