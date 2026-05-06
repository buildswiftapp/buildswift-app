-- Add reviewer_role to review_requests to preserve UI-selected roles.
-- Safe to run multiple times.

alter table if exists public.review_requests
  add column if not exists reviewer_role text;

-- Backfill missing roles to "Reviewer" for existing rows.
update public.review_requests
set reviewer_role = 'Reviewer'
where reviewer_role is null;

