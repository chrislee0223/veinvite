-- Restore the narrow execution privilege required by invitation/legacy projection triggers.
-- The projection remains private and derived; no anon/authenticated access is added.

begin;

grant execute on function public.sync_operator_fast_invitation_projection(uuid)
  to service_role;

commit;
