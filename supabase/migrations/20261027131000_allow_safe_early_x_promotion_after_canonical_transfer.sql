begin;
-- Production financial authority is unchanged. Only a manifest-verified
-- canonical broadcast can start an X participation clock before full finality.
-- The X payout intent is separately hard-gated by PAID + immutable receipt.
create or replace function public.reward_x_promotion_canonical_base_ready_v1(
  p_code text, p_network text, p_wallet text, p_base_wei numeric
) returns boolean
language sql stable security definer
set search_path to 'pg_catalog','public'
as $canonical$
  select exists (
    select 1
    from public.reward_payouts p
    join public.reward_rounds r
      on r.id=p.round_id and r.network=p_network
    join public.reward_payout_manifests m
      on m.round_id=r.id and m.network=r.network
    join public.reward_payout_transaction_submissions sub
      on sub.round_id=r.id and sub.manifest_id=m.id
    join public.reward_payout_signed_transactions sig
      on sig.round_id=r.id and sig.manifest_id=m.id
    where p.invite_code=p_code
      and p.recipient_wallet=lower(p_wallet)
      and p.amount_wei=p_base_wei
      and p.status='PENDING'
      and p.tx_id is null
      and r.status='CREATED'
      and r.broadcast_confirmed_at is not null
      and sub.network=p_network and sig.network=p_network
      and sub.manifest_hash=m.manifest_hash
      and sig.manifest_hash=m.manifest_hash
      and sub.tx_id=sig.tx_id
      and sub.operator_wallet=sig.operator_wallet
      and sig.operator_wallet=m.operator_wallet
  );
$canonical$;
revoke all on function public.reward_x_promotion_canonical_base_ready_v1(text,text,text,numeric) from public,anon,authenticated;
grant execute on function public.reward_x_promotion_canonical_base_ready_v1(text,text,text,numeric) to service_role;

CREATE OR REPLACE FUNCTION public.activate_reward_x_promotion_obligation_v1(p_invite_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_code text := upper(btrim(p_invite_code));
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_split public.reward_x_promotion_splits%rowtype;
  v_payout public.reward_payouts%rowtype;
  v_invitation public.invitations%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_code is null or v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_x_promotion_' || v_code,0)
  );

  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.invite_code=v_code
  for update;

  if not found then
    raise exception 'REWARD_X_PROMOTION_OBLIGATION_MISSING';
  end if;

  if v_obligation.financial_state='HELD' then
    return jsonb_build_object(
      'activated',true,'reason','ALREADY_HELD','inviteCode',v_code,
      'amountWei',v_obligation.promotion_amount_wei::text,
      'heldAt',v_obligation.held_at
    );
  end if;

  if v_obligation.financial_state<>'RESERVED' then
    raise exception 'REWARD_X_PROMOTION_OBLIGATION_NOT_RESERVABLE';
  end if;

  select * into v_split
  from public.reward_x_promotion_splits s
  where s.id=v_obligation.split_id and s.mode='LIVE';

  if not found then
    raise exception 'REWARD_X_PROMOTION_LIVE_SPLIT_MISSING';
  end if;

  select * into v_payout
  from public.reward_payouts p
  where p.invite_code=v_code and p.status='PAID';


  if not (
    (v_payout.id is not null
      and v_payout.amount_wei=v_split.base_amount_wei
      and v_payout.paid_at is not null
      and exists (
        select 1 from public.reward_receipts r
        where r.payout_id=v_payout.id
          and r.invite_code=v_code
          and r.network=v_obligation.network
          and r.recipient_wallet=v_obligation.recipient_wallet
          and r.amount_wei=v_split.base_amount_wei
          and r.paid_at is not null
      )
    )
    or public.reward_x_promotion_canonical_base_ready_v1(
    v_code,
    v_obligation.network,
    v_obligation.recipient_wallet,
    v_split.base_amount_wei
  )
  ) then
    raise exception 'REWARD_X_PROMOTION_BASE_PAYOUT_MISMATCH';
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code=v_code;

  if not found
     or public.is_sybil_v2_referral_invalidated(v_code,v_obligation.network)
     or exists (
       select 1
       from public.sybil_v2_wallet_restrictions r
       where r.network=v_obligation.network
         and r.status='ACTIVE'
         and r.wallet_address in (
           lower(v_obligation.recipient_wallet),
           lower(v_invitation.invitee_wallet)
         )
     ) then
    raise exception 'REWARD_X_PROMOTION_SECURITY_NOT_CLEAR';
  end if;

  -- Do not start a promotion hold while the referral is in a temporary
  -- Sybil HOLD/review state. The same current-clearance authority is used by
  -- final verification and payout signing, so the user-facing 24h offer is
  -- not opened before the referral is currently safe to reward.
  if not public.reward_x_promotion_security_clear_v1(
    v_code,
    v_obligation.network
  ) then
    raise exception 'REWARD_X_PROMOTION_SECURITY_NOT_CLEAR';
  end if;

  update public.reward_x_promotion_obligations o
  set financial_state='HELD',held_at=v_now,updated_at=v_now
  where o.id=v_obligation.id
  returning * into v_obligation;

  return jsonb_build_object(
    'activated',true,'reason','HELD','inviteCode',v_code,
    'amountWei',v_obligation.promotion_amount_wei::text,
    'heldAt',v_obligation.held_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_reward_x_promotion_opportunity_v1(p_invite_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_split public.reward_x_promotion_splits%rowtype;
  v_existing public.reward_x_promotion_opportunities%rowtype;
  v_created public.reward_x_promotion_opportunities%rowtype;
  v_payout public.reward_payouts%rowtype;
  v_cfg public.reward_runtime_config%rowtype;
  v_runtime jsonb;
  v_opened_at timestamptz := clock_timestamp();
  v_window_seconds constant integer := 86400;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_x_promotion_' || v_code,0)
  );

  select * into v_existing
  from public.reward_x_promotion_opportunities o
  where o.invite_code=v_code;

  if found then
    return jsonb_build_object(
      'created',false,
      'reason','ALREADY_EXISTS',
      'inviteCode',v_code,
      'opportunityId',v_existing.id,
      'openedAt',v_existing.opened_at,
      'postDeadlineAt',v_existing.post_deadline_at
    );
  end if;

  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.invite_code=v_code
  for update;

  if not found then
    raise exception 'REWARD_X_PROMOTION_OBLIGATION_MISSING';
  end if;

  if v_obligation.financial_state<>'HELD'
     or v_obligation.held_at is null then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_NOT_HELD';
  end if;

  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  -- Existing obligations remain preserved while new offer opening is paused.
  -- This prevents the 24-hour user clock from starting when payout signing or
  -- X verification is disabled, paused, or stale.
  if not v_cfg.reward_x_promotion_enabled
     or v_cfg.reward_x_promotion_live_started_at is null
     or not v_cfg.reward_x_promotion_payout_enabled
     or not v_cfg.reward_x_promotion_external_verification_ready
     or v_cfg.reward_x_promotion_external_verification_started_at is null then
    raise exception 'REWARD_X_PROMOTION_NEW_OFFERS_PAUSED';
  end if;

  v_runtime :=
    public.read_reward_x_promotion_external_runtime_readiness_v1(
      v_obligation.network,
      1200
    );

  if not coalesce((v_runtime->>'ready')::boolean,false) then
    raise exception 'REWARD_X_PROMOTION_EXTERNAL_RUNTIME_STALE';
  end if;

  select * into v_split
  from public.reward_x_promotion_splits s
  where s.id=v_obligation.split_id
    and s.invite_code=v_code
    and s.mode='LIVE';

  if not found
     or v_split.network<>v_obligation.network
     or v_split.recipient_wallet<>v_obligation.recipient_wallet
     or v_split.promotion_amount_wei<>v_obligation.promotion_amount_wei
     or v_split.policy_version<>v_obligation.policy_version
     or v_split.policy_version<>'x-promotion-additive-v2' then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_SPLIT_MISMATCH';
  end if;

  select * into v_payout
  from public.reward_payouts p
  where p.invite_code=v_code
    and p.status='PAID';


  if not (
    (v_payout.id is not null
      and v_payout.amount_wei=v_split.base_amount_wei
      and v_payout.paid_at is not null
      and exists (
        select 1 from public.reward_receipts r
        where r.payout_id=v_payout.id
          and r.invite_code=v_code
          and r.network=v_obligation.network
          and r.recipient_wallet=v_obligation.recipient_wallet
          and r.amount_wei=v_split.base_amount_wei
          and r.paid_at is not null
      )
    )
    or public.reward_x_promotion_canonical_base_ready_v1(
    v_code,
    v_obligation.network,
    v_obligation.recipient_wallet,
    v_split.base_amount_wei
  )
  ) then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_BASE_PROOF_MISSING';
  end if;

  insert into public.reward_x_promotion_opportunities(
    obligation_id,
    split_id,
    invite_code,
    network,
    recipient_wallet,
    promotion_amount_wei,
    policy_version,
    offer_window_seconds,
    opened_at,
    post_deadline_at
  ) values (
    v_obligation.id,
    v_split.id,
    v_code,
    v_obligation.network,
    v_obligation.recipient_wallet,
    v_obligation.promotion_amount_wei,
    v_obligation.policy_version,
    v_window_seconds,
    v_opened_at,
    v_opened_at + make_interval(secs => v_window_seconds)
  )
  returning * into v_created;

  return jsonb_build_object(
    'created',true,
    'reason','CREATED',
    'inviteCode',v_code,
    'opportunityId',v_created.id,
    'amountWei',v_created.promotion_amount_wei::text,
    'openedAt',v_created.opened_at,
    'postDeadlineAt',v_created.post_deadline_at,
    'offerWindowSeconds',v_created.offer_window_seconds
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_reward_x_promotion_opportunity_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_split public.reward_x_promotion_splits%rowtype;
  v_payout public.reward_payouts%rowtype;
  v_invitation public.invitations%rowtype;
begin
  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.id=new.obligation_id;

  if not found
     or v_obligation.invite_code<>new.invite_code
     or v_obligation.network<>new.network
     or v_obligation.recipient_wallet<>new.recipient_wallet
     or v_obligation.promotion_amount_wei<>new.promotion_amount_wei
     or v_obligation.policy_version<>new.policy_version
     or v_obligation.financial_state<>'HELD'
     or v_obligation.held_at is null
     or new.opened_at<v_obligation.held_at then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_OBLIGATION_MISMATCH';
  end if;

  select * into v_split
  from public.reward_x_promotion_splits x
  where x.id=new.split_id;

  if not found
     or v_split.id<>v_obligation.split_id
     or v_split.invite_code<>new.invite_code
     or v_split.network<>new.network
     or v_split.recipient_wallet<>new.recipient_wallet
     or v_split.promotion_amount_wei<>new.promotion_amount_wei
     or v_split.policy_version<>new.policy_version
     or v_split.policy_version<>'x-promotion-additive-v2'
     or v_split.mode<>'LIVE' then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_SPLIT_MISMATCH';
  end if;

  if new.offer_window_seconds<>86400
     or new.post_deadline_at<>
        new.opened_at+make_interval(secs=>new.offer_window_seconds) then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_WINDOW_MISMATCH';
  end if;

  select * into v_payout
  from public.reward_payouts p
  where p.invite_code=new.invite_code
    and p.status='PAID';


  if not (
    (v_payout.id is not null
      and v_payout.amount_wei=v_split.base_amount_wei
      and v_payout.paid_at is not null
      and exists (
        select 1 from public.reward_receipts r
        where r.payout_id=v_payout.id
          and r.invite_code=new.invite_code
          and r.network=new.network
          and r.recipient_wallet=new.recipient_wallet
          and r.amount_wei=v_split.base_amount_wei
          and r.paid_at is not null
      )
    )
    or public.reward_x_promotion_canonical_base_ready_v1(
      new.invite_code,new.network,new.recipient_wallet,v_split.base_amount_wei
    )
  ) then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_BASE_PROOF_MISSING';
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code=new.invite_code;

  if not found
     or public.is_sybil_v2_referral_invalidated(new.invite_code,new.network)
     or exists (
       select 1
       from public.sybil_v2_wallet_restrictions r
       where r.network=new.network
         and r.status='ACTIVE'
         and r.wallet_address in (
           lower(new.recipient_wallet),
           lower(v_invitation.invitee_wallet)
         )
     )
     or not public.reward_x_promotion_security_clear_v1(
       new.invite_code,
       new.network
     ) then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_SECURITY_NOT_CLEAR';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_reward_x_promotion_opportunities_v1(p_network text, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
        or public.reward_x_promotion_canonical_base_ready_v1(
          o.invite_code,o.network,o.recipient_wallet,s.base_amount_wei
        )
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

CREATE OR REPLACE FUNCTION public.validate_reward_x_promotion_payout_intent_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_cfg public.reward_runtime_config%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_verification public.reward_x_promotion_post_verifications%rowtype;
  v_invitation public.invitations%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_x_promotion_' || new.invite_code,0)
  );

  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  if not v_cfg.reward_x_promotion_enabled
     or v_cfg.reward_x_promotion_live_started_at is null then
    raise exception 'REWARD_X_PROMOTION_LIVE_DISABLED';
  end if;

  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.id=new.obligation_id
  for update;

  if not found
     or v_obligation.financial_state<>'HELD'
     or v_obligation.held_at is null
     or v_obligation.released_at is not null
     or v_obligation.paid_at is not null
     or v_obligation.split_id<>new.split_id
     or v_obligation.invite_code<>new.invite_code
     or v_obligation.network<>new.network
     or v_obligation.recipient_wallet<>new.recipient_wallet
     or v_obligation.promotion_amount_wei<>new.amount_wei
     or v_obligation.source_reward_cohort_round_id<>new.source_reward_cohort_round_id
     or v_obligation.source_allocation_receipt_id<>new.source_allocation_receipt_id
     or v_obligation.policy_version<>new.policy_version then
    raise exception 'REWARD_X_PROMOTION_PAYOUT_INTENT_OBLIGATION_MISMATCH';
  end if;

  select * into v_verification
  from public.reward_x_promotion_post_verifications p
  where p.id=new.verification_id;

  if not found
     or v_verification.verification_state<>'FINAL_VERIFIED'
     or v_verification.final_verified_at is null
     or v_verification.invalidated_at is not null
     or v_verification.obligation_id<>new.obligation_id
     or v_verification.split_id<>new.split_id
     or v_verification.invite_code<>new.invite_code
     or v_verification.network<>new.network
     or v_verification.recipient_wallet<>new.recipient_wallet
     or v_verification.x_post_id<>new.x_post_id
     or v_verification.x_author_id<>new.x_author_id then
    raise exception 'REWARD_X_PROMOTION_PAYOUT_INTENT_VERIFICATION_MISMATCH';
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code=new.invite_code;

  if not found
     or v_invitation.sybil_status<>'CLEAR'
     or public.is_sybil_v2_referral_invalidated(new.invite_code,new.network)
     or exists (
       select 1
       from public.sybil_v2_wallet_restrictions r
       where r.network=new.network
         and r.status='ACTIVE'
         and r.wallet_address in (
           new.recipient_wallet,
           lower(v_invitation.invitee_wallet)
         )
     )
     or (
       public.sybil_v2_enforcement_enabled()
       and not exists (
         select 1
         from public.sybil_v2_referral_assessments a
         join public.sybil_v2_reward_clearances c
           on c.invite_code=a.invite_code
          and c.network=a.network
          and c.assessment_revision=a.revision
          and c.verdict='CLEAR'
         where a.invite_code=new.invite_code
           and a.network=new.network
           and a.state='CLEAR'
       )
     ) then
    raise exception 'REWARD_X_PROMOTION_PAYOUT_INTENT_SECURITY_NOT_CLEAR';
  end if;

  -- A post may be submitted/verified during canonical confirmation, but
  -- bonus money must NEVER enter a payout intent until the base B3TR is
  -- irreversibly finalized and its immutable receipt exists.
  if not exists (
    select 1
    from public.reward_payouts p
    join public.reward_receipts r on r.payout_id=p.id
    where p.invite_code=new.invite_code
      and p.recipient_wallet=new.recipient_wallet
      and p.status='PAID'
      and p.paid_at is not null
      and p.amount_wei=(
        select s.base_amount_wei
        from public.reward_x_promotion_splits s
        where s.id=new.split_id and s.mode='LIVE'
      )
      and r.invite_code=new.invite_code
      and r.network=new.network
      and r.recipient_wallet=new.recipient_wallet
      and r.paid_at is not null
  ) then
    raise exception 'REWARD_X_PROMOTION_BASE_NOT_FINALIZED';
  end if;

  return new;
end;
$function$;
commit;
