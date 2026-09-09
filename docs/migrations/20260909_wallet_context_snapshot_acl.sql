-- Preserve the production-only operator view and RPC access boundary after
-- replacing wallet-context reporting definitions.

alter view public.operator_accepted_wallet_languages
  set (security_invoker = true);
revoke all on public.operator_accepted_wallet_languages
  from public, anon, authenticated;
grant select on public.operator_accepted_wallet_languages
  to service_role;

alter view public.operator_accepted_language_summary
  set (security_invoker = true);
revoke all on public.operator_accepted_language_summary
  from public, anon, authenticated;
grant select on public.operator_accepted_language_summary
  to service_role;

revoke all on function public.get_public_country_leaderboard(text,bigint,integer)
  from public, anon, authenticated;
grant execute on function public.get_public_country_leaderboard(text,bigint,integer)
  to service_role;
