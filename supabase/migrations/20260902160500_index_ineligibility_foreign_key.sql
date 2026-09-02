-- Keep the notification lookup index optimized for inviter/time while also
-- covering the audit foreign key itself. PostgreSQL does not automatically
-- index referencing foreign-key columns, and the composite notification index
-- cannot service lookups beginning with ineligibility_check_id.

create index if not exists invitations_ineligibility_check_id_idx
  on public.invitations (ineligibility_check_id)
  where ineligibility_check_id is not null;
