-- Keep the lifecycle audit table inaccessible to application service-role code
-- while allowing the invitation trigger itself to append evidence. Trigger
-- execution therefore runs with its postgres owner privileges.

begin;

alter function public.log_invitation_lifecycle_change()
  security definer;

alter function public.log_invitation_lifecycle_change()
  owner to postgres;

revoke all on function public.log_invitation_lifecycle_change()
  from public, anon, authenticated;
grant execute on function public.log_invitation_lifecycle_change()
  to service_role;

comment on function public.log_invitation_lifecycle_change() is
  'Security-definer trigger function owned by postgres so server-side invitation writes can append lifecycle audit evidence while the audit table itself remains inaccessible to service_role application code.';

commit;
