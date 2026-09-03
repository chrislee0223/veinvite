-- Keep all financial reservation and claim mutations server-only. The initial
-- reservation migration intentionally revoked PUBLIC execution from the new
-- commit RPC; this follow-up explicitly grants the application service role and
-- narrows helper RPCs so deployment cannot fail closed from a missing grant or
-- accidentally expose a financial mutation to anon/authenticated clients.

alter function public.commit_reward_reservation(
  text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb
) set search_path to 'pg_catalog','public';
revoke all on function public.commit_reward_reservation(
  text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb
) from public, anon, authenticated;
grant execute on function public.commit_reward_reservation(
  text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb
) to service_role;

alter function public.read_reward_reservation_candidates(
  text,integer
) set search_path to 'pg_catalog','public';
revoke all on function public.read_reward_reservation_candidates(
  text,integer
) from public, anon, authenticated;
grant execute on function public.read_reward_reservation_candidates(
  text,integer
) to service_role;

alter function public.request_reward_claim(
  text,text
) set search_path to 'pg_catalog','public';
revoke all on function public.request_reward_claim(
  text,text
) from public, anon, authenticated;
grant execute on function public.request_reward_claim(
  text,text
) to service_role;

alter function public.prepare_predictive_reward_batch(
  text,text,numeric,bigint,integer,integer,numeric,text,jsonb
) set search_path to 'pg_catalog','public';
revoke all on function public.prepare_predictive_reward_batch(
  text,text,numeric,bigint,integer,integer,numeric,text,jsonb
) from public, anon, authenticated;
grant execute on function public.prepare_predictive_reward_batch(
  text,text,numeric,bigint,integer,integer,numeric,text,jsonb
) to service_role;

alter function public.release_invitation_slot_after_reward_reservation()
  set search_path to 'pg_catalog','public';
revoke all on function public.release_invitation_slot_after_reward_reservation()
  from public, anon, authenticated;

comment on function public.commit_reward_reservation(
  text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb
) is 'Server-only serialized commit of a finalized, fixed referral reward reservation.';
