-- Restore the server-side privileges required by VeInvite wallet
-- authentication. The application uses the Supabase service role for these
-- tables; browser roles must not have direct row access.

begin;

revoke all on table public.wallet_auth_challenges
  from anon, authenticated;
revoke all on table public.wallet_auth_sessions
  from anon, authenticated;

revoke all on sequence public.wallet_auth_challenges_id_seq
  from anon, authenticated;
revoke all on sequence public.wallet_auth_sessions_id_seq
  from anon, authenticated;

grant select, insert, update, delete
  on table public.wallet_auth_challenges
  to service_role;
grant select, insert, update, delete
  on table public.wallet_auth_sessions
  to service_role;

grant usage, select
  on sequence public.wallet_auth_challenges_id_seq
  to service_role;
grant usage, select
  on sequence public.wallet_auth_sessions_id_seq
  to service_role;

commit;
