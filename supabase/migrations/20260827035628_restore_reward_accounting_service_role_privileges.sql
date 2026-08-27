-- Restore the minimum server-side privileges required by VeInvite reward
-- accounting while removing unnecessary browser-role access.

revoke all privileges on table
  public.invitations,
  public.eligibility_check_events,
  public.invite_impact_events,
  public.reward_queue_entries,
  public.reward_rounds,
  public.reward_payouts,
  public.wallet_auth_challenges,
  public.wallet_auth_sessions
from anon, authenticated;

revoke all privileges on sequence
  public.reward_rounds_id_seq,
  public.reward_payouts_id_seq
from anon, authenticated;

revoke truncate on table
  public.reward_rounds,
  public.reward_payouts
from service_role;

grant select, insert, update on table
  public.reward_rounds,
  public.reward_payouts
to service_role;

grant usage, select on sequence
  public.reward_rounds_id_seq,
  public.reward_payouts_id_seq
to service_role;
