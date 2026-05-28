-- Fix "Database error saving new user" on signup.
-- Replaces legacy triggers that insert into removed/invalid billing tables.
-- Run once in Supabase SQL editor.

BEGIN;

ALTER TABLE IF EXISTS public.accounts
  ALTER COLUMN subscription_tier SET DEFAULT 'trial';

ALTER TABLE IF EXISTS public.accounts
  ALTER COLUMN billing_status SET DEFAULT 'active';

-- Sync auth user -> public.users only. Account bootstrap runs in the app (service role).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name text;
BEGIN
  v_full_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
    split_part(COALESCE(NEW.email, ''), '@', 1)
  );

  INSERT INTO public.users (id, email, full_name)
  VALUES (NEW.id, NEW.email, v_full_name)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.users.full_name);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMIT;
