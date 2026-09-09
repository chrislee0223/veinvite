-- Keep all existing permanent referral keys valid while allowing shorter
-- 16-character keys for future issuances. No existing referral rows are
-- rewritten, rotated, or deleted by this migration.

alter table public.referral_links
  drop constraint if exists referral_links_key_check;

alter table public.referral_links
  add constraint referral_links_key_check
  check (referral_key ~ '^[A-Za-z0-9_-]{16,64}$');
