-- Keep the database invite-code invariant aligned with the public/API format.
-- Ambiguous characters (0, O, 1, I) are intentionally excluded so codes are
-- safe to read and type across mobile, chat, and translated UI surfaces.

alter table public.invitations
  drop constraint if exists invitations_code_check;

alter table public.invitations
  add constraint invitations_code_check
  check (invite_code ~ '^[A-HJ-NP-Z2-9]{7}$');
