-- Guard the intended VeInvite reward authorization boundary.
-- Eligibility fixes the reward amount, but only an explicit inviter Claim may
-- move that reservation into the payout queue.

do $$
declare
  v_commit text := pg_get_functiondef(
    'public.commit_reward_reservation(text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb)'::regprocedure
  );
  v_claim text := pg_get_functiondef(
    'public.request_reward_claim(text,text)'::regprocedure
  );
  v_sync text := pg_get_functiondef(
    'public.sync_reward_queue_from_invitation()'::regprocedure
  );
  v_claim_compact text;
begin
  v_claim_compact := regexp_replace(v_claim, '\s+', '', 'g');

  if position('''AWAITING_CLAIM''' in v_commit) = 0 then
    raise exception 'REWARD_BOUNDARY_INVALID: reservation must enter AWAITING_CLAIM';
  end if;

  if position('claim_requested_at' in v_commit) > 0
     or position('claim_requested_by_wallet' in v_commit) > 0 then
    raise exception 'REWARD_BOUNDARY_INVALID: reservation must not forge Claim evidence';
  end if;

  if position('status=''QUEUED''' in v_claim_compact) = 0
     or position('claim_requested_at=now()' in v_claim_compact) = 0
     or position('claim_requested_by_wallet=v_wallet' in v_claim_compact) = 0 then
    raise exception 'REWARD_BOUNDARY_INVALID: Claim must authorize QUEUED state';
  end if;

  if position('''AWAITING_CLAIM''' in v_sync) = 0 then
    raise exception 'REWARD_BOUNDARY_INVALID: restored eligibility must support AWAITING_CLAIM';
  end if;
end
$$;

comment on function public.commit_reward_reservation(
  text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb
) is
  'Fixes a verified referral reward amount and leaves it AWAITING_CLAIM. It must not create Claim evidence or authorize payout.';

comment on function public.request_reward_claim(text,text) is
  'Explicit inviter authorization boundary. A valid Claim moves AWAITING_CLAIM to QUEUED and records claim_requested_* evidence.';

comment on function public.sync_reward_queue_from_invitation() is
  'Keeps reward eligibility and queue state synchronized without bypassing the explicit Claim requirement.';
