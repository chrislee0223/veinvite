begin;

-- Keep exactly one settlement-registration guard and make all low-level
-- financial/reporting helpers inaccessible to client database roles.
drop trigger if exists reward_payout_settlement_requires_registered_submission
  on public.reward_payout_transaction_settlements;
drop function if exists public.require_registered_reward_submission_before_settlement();

revoke all on function public.require_registered_reward_submission()
  from public, anon, authenticated, service_role;
revoke all on function public.get_veinvite_vebetter_round_report_v1_internal(text, text, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.prepare_reward_round(text, text, numeric)
  from public, anon, authenticated, service_role;
revoke all on function public.get_veinvite_vebetter_round_report(text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.get_veinvite_vebetter_round_report(text, text, bigint)
  to service_role;

commit;
