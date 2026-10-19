-- Deployment interlock: the old permission bug left already-paid referrals
-- in RESERVED without an offer. Never open a new 24h promotion for them by
-- accident. Review and explicitly dispose of those historical obligations
-- using the existing audited release RPC before applying this migration.
-- This check is read-only and aborts the whole migration if any remain.
do $historical_offer_guard$
begin
  if exists (
    select 1
    from public.reward_x_promotion_obligations o
    join public.reward_x_promotion_splits s
      on s.id=o.split_id
     and s.mode='LIVE'
    join public.reward_payouts p
      on p.invite_code=o.invite_code
     and p.recipient_wallet=o.recipient_wallet
     and p.status='PAID'
     and p.amount_wei=s.base_amount_wei
     and p.paid_at is not null
    where o.network='mainnet'
      and o.financial_state in ('RESERVED','HELD')
      and not exists (
        select 1
        from public.reward_x_promotion_opportunities x
        where x.obligation_id=o.id
      )
      and exists (
        select 1
        from public.reward_receipts r
        where r.payout_id=p.id
          and r.invite_code=o.invite_code
          and r.network=o.network
          and r.recipient_wallet=o.recipient_wallet
          and r.amount_wei=s.base_amount_wei
          and r.paid_at is not null
      )
  ) then
    raise exception
      'X_PROMOTION_HISTORICAL_BASE_PAID_RESERVATIONS_NEED_DISPOSITION';
  end if;
end;
$historical_offer_guard$;

-- X promotion server-only lifecycle: column-scoped UPDATE is needed for
-- SELECT ... FOR UPDATE and guarded financial state transitions.
-- Never grant blanket UPDATE of immutable payout recipient or amount.
grant update (financial_state,held_at,released_at,release_reason,updated_at)
  on table public.reward_x_promotion_obligations to service_role;
grant update (submission_state,verified_at,invalidated_at,state_reason,updated_at)
  on table public.reward_x_promotion_post_submissions to service_role;
grant update (verification_state,final_verified_at,invalidated_at,state_reason,updated_at)
  on table public.reward_x_promotion_post_verifications to service_role;

-- Preserve the isolated base payout path but expose per-candidate failures to
-- the maintenance worker instead of hiding errors behind a successful cron.
create or replace function public.sync_reward_x_promotion_opportunities_v1(
  p_network text,
  p_limit integer default 25
)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
declare
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_limit integer := greatest(1,least(coalesce(p_limit,25),100));
  v_candidate record;
  v_activation jsonb;
  v_creation jsonb;
  v_considered integer := 0;
  v_activated integer := 0;
  v_candidate_activated boolean := false;
  v_created integer := 0;
  v_already integer := 0;
  v_failed integer := 0;
  v_failures jsonb := '[]'::jsonb;
  v_failure_message text;
  v_failure_sqlstate text;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;

  for v_candidate in
    select o.invite_code,o.financial_state
    from public.reward_x_promotion_obligations o
    join public.reward_x_promotion_splits s
      on s.id=o.split_id and s.mode='LIVE'
    where o.network=v_network
      and o.financial_state in ('RESERVED','HELD')
      and not exists (
        select 1 from public.reward_x_promotion_opportunities x
        where x.obligation_id=o.id
      )
      and (
        o.financial_state='HELD'
        or exists (
          select 1
          from public.reward_payouts p
          join public.reward_receipts r on r.payout_id=p.id
          where p.invite_code=o.invite_code
            and p.recipient_wallet=o.recipient_wallet
            and p.status='PAID'
            and p.amount_wei=s.base_amount_wei
            and p.paid_at is not null
            and r.invite_code=o.invite_code
            and r.network=o.network
            and r.recipient_wallet=o.recipient_wallet
            and r.amount_wei=s.base_amount_wei
            and r.paid_at is not null
        )
      )
    order by o.id
    limit v_limit
  loop
    v_considered:=v_considered+1;
    v_candidate_activated:=false;
    begin
      if v_candidate.financial_state='RESERVED' then
        v_activation :=
          public.activate_reward_x_promotion_obligation_v1(v_candidate.invite_code);
        v_candidate_activated:=coalesce((v_activation->>'activated')::boolean,false);
      end if;

      v_creation :=
        public.create_reward_x_promotion_opportunity_v1(v_candidate.invite_code);

      if coalesce((v_creation->>'created')::boolean,false) then
        v_created:=v_created+1;
      else
        v_already:=v_already+1;
      end if;
      -- An exception rolls back the per-candidate DB subtransaction, but
      -- PL/pgSQL variables are not rolled back. Count activations only once
      -- the opportunity creation step has also succeeded.
      if v_candidate_activated then
        v_activated:=v_activated+1;
      end if;
    exception when others then
      get stacked diagnostics
        v_failure_message = MESSAGE_TEXT,
        v_failure_sqlstate = RETURNED_SQLSTATE;
      v_failed:=v_failed+1;
      v_failures:=v_failures || jsonb_build_array(jsonb_build_object(
        'inviteCode',v_candidate.invite_code,
        'sqlstate',v_failure_sqlstate,
        'reason',left(v_failure_message,240)
      ));
    end;
  end loop;

  return jsonb_build_object(
    'network',v_network,
    'consideredCount',v_considered,
    'activatedCount',v_activated,
    'createdCount',v_created,
    'alreadyExistsCount',v_already,
    'failedCount',v_failed,
    'failures',v_failures
  );
end;
$function$;

revoke all on function public.sync_reward_x_promotion_opportunities_v1(text,integer)
  from public,anon,authenticated;
grant execute on function public.sync_reward_x_promotion_opportunities_v1(text,integer)
  to service_role;
