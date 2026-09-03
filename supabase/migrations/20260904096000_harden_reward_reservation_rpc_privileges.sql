-- Keep financial reservation/claim mutations and notification read-state
-- mutations server-only. Explicit grants avoid both accidental browser access
-- and fail-closed runtime errors after PUBLIC execution is revoked.

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

alter function public.acknowledge_invite_notification_v2(
  text,text,integer,integer,boolean
) set search_path to 'pg_catalog','public';
revoke all on function public.acknowledge_invite_notification_v2(
  text,text,integer,integer,boolean
) from public, anon, authenticated;
grant execute on function public.acknowledge_invite_notification_v2(
  text,text,integer,integer,boolean
) to service_role;

alter function public.release_invitation_slot_after_reward_reservation()
  set search_path to 'pg_catalog','public';
revoke all on function public.release_invitation_slot_after_reward_reservation()
  from public, anon, authenticated;

comment on function public.commit_reward_reservation(
  text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb
) is 'Server-only serialized commit of a finalized, fixed referral reward reservation.';
comment on function public.acknowledge_invite_notification_v2(
  text,text,integer,integer,boolean
) is 'Server-only additive acknowledgement for referral notification progress without renumbering legacy stages.';
