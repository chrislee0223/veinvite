-- Include finalized X Promotion payouts in existing Sybil recovery obligations.

do $guard$
declare
  v_live boolean;
  v_payout boolean;
begin
  select reward_x_promotion_enabled,reward_x_promotion_payout_enabled
  into v_live,v_payout
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  if coalesce(v_live,false) or coalesce(v_payout,false) then
    raise exception 'REWARD_X_PROMOTION_RECOVERY_MIGRATION_REQUIRES_LIVE_AND_PAYOUT_DISABLED';
  end if;
end $guard$;

CREATE OR REPLACE FUNCTION public.upsert_reward_recovery_obligation_for_invalidation(p_invalidation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_invalidation public.sybil_v2_referral_invalidations%rowtype;
  v_settlement public.reward_recovery_settlements%rowtype;
  v_receipt public.reward_receipts%rowtype;
  v_promo_receipt public.reward_x_promotion_receipts%rowtype;
  v_existing public.reward_recovery_obligations%rowtype;
  v_obligation public.reward_recovery_obligations%rowtype;
  v_recipient_wallet text;
  v_desired numeric(78,0) := 0;
  v_previous_status text;
  v_event_kind text := 'ACTIVATED';
begin
  select * into v_invalidation
  from public.sybil_v2_referral_invalidations x
  where x.id=p_invalidation_id
  for update;

  if not found or v_invalidation.status<>'ACTIVE' then
    return null;
  end if;

  select * into v_settlement
  from public.reward_recovery_settlements s
  where s.network=lower(v_invalidation.network)
    and s.invite_code=v_invalidation.invite_code
  limit 1;

  select * into v_receipt
  from public.reward_receipts r
  where lower(r.network)=lower(v_invalidation.network)
    and r.invite_code=v_invalidation.invite_code
  order by r.id desc
  limit 1;

  select * into v_promo_receipt
  from public.reward_x_promotion_receipts r
  where lower(r.network)=lower(v_invalidation.network)
    and r.invite_code=v_invalidation.invite_code
  order by r.id desc
  limit 1;

  if v_promo_receipt.id is not null then
    if v_receipt.id is null
       or lower(v_promo_receipt.recipient_wallet)<>lower(v_receipt.recipient_wallet) then
      raise exception 'REWARD_X_PROMOTION_RECOVERY_RECEIPT_MISMATCH';
    end if;
  end if;

  if v_settlement.id is not null then
    v_desired :=
      v_settlement.offset_amount_wei +
      coalesce(v_receipt.amount_wei,0) +
      coalesce(v_promo_receipt.amount_wei,0);
    v_recipient_wallet := lower(v_settlement.recipient_wallet);
  elsif v_receipt.id is not null then
    v_desired :=
      v_receipt.amount_wei +
      coalesce(v_promo_receipt.amount_wei,0);
    v_recipient_wallet := lower(v_receipt.recipient_wallet);
  else
    return null;
  end if;

  if v_desired<=0 or v_recipient_wallet is null then
    return null;
  end if;

  -- Serialize every balance mutation with reservation-time recovery consumption.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_reward_recovery_' ||
      lower(v_invalidation.network) || '_' ||
      v_recipient_wallet,
      0
    )
  );

  select * into v_existing
  from public.reward_recovery_obligations o
  where o.source_invalidation_id=v_invalidation.id
     or (
       v_settlement.id is not null
       and o.source_settlement_id=v_settlement.id
     )
  order by
    case when o.source_invalidation_id=v_invalidation.id then 0 else 1 end,
    o.created_at,
    o.id
  limit 1
  for update;

  if found then
    v_previous_status := v_existing.status;
    v_event_kind := case
      when v_desired>v_existing.amount_wei then 'TOPPED_UP'
      else 'ACTIVATED'
    end;

    update public.reward_recovery_obligations o
    set
      recipient_wallet=v_recipient_wallet,
      source_invalidation_id=v_invalidation.id,
      source_restriction_id=null,
      source_receipt_id=case
        when v_settlement.id is null then v_receipt.id
        else null
      end,
      source_settlement_id=case
        when v_settlement.id is not null then v_settlement.id
        else null
      end,
      source_invite_code=v_invalidation.invite_code,
      amount_wei=greatest(o.amount_wei,v_desired),
      status='ACTIVE',
      status_reason='ACTIVE_REFERRAL_INVALIDATION',
      updated_at=clock_timestamp()
    where o.id=v_existing.id
    returning * into v_obligation;
  else
    insert into public.reward_recovery_obligations(
      network,recipient_wallet,source_invalidation_id,source_restriction_id,
      source_receipt_id,source_settlement_id,source_invite_code,
      amount_wei,status,status_reason
    ) values (
      lower(v_invalidation.network),
      v_recipient_wallet,
      v_invalidation.id,
      null,
      case when v_settlement.id is null then v_receipt.id else null end,
      case when v_settlement.id is not null then v_settlement.id else null end,
      v_invalidation.invite_code,
      v_desired,
      'ACTIVE',
      'ACTIVE_REFERRAL_INVALIDATION'
    )
    returning * into v_obligation;

    v_previous_status := null;
    v_event_kind := 'CREATED';
  end if;

  insert into public.reward_recovery_obligation_events(
    obligation_id,event_kind,previous_status,new_status,amount_wei,reason,details
  ) values (
    v_obligation.id,
    v_event_kind,
    v_previous_status,
    v_obligation.status,
    v_obligation.amount_wei,
    'ACTIVE_REFERRAL_INVALIDATION',
    jsonb_build_object(
      'invalidationId',v_invalidation.id::text,
      'inviteCode',v_invalidation.invite_code,
      'settlementId',case when v_settlement.id is not null then v_settlement.id::text else null end,
      'receiptId',case when v_receipt.id is not null then v_receipt.id::text else null end,
      'offsetWei',case when v_settlement.id is not null then v_settlement.offset_amount_wei::text else null end,
      'paidWei',case when v_receipt.id is not null then v_receipt.amount_wei::text else '0' end,
      'xPromotionReceiptId',case when v_promo_receipt.id is not null then v_promo_receipt.id::text else null end,
      'xPromotionPaidWei',case when v_promo_receipt.id is not null then v_promo_receipt.amount_wei::text else '0' end
    )
  );

  return v_obligation.id;
end;
$function$;


CREATE OR REPLACE FUNCTION public.upsert_reward_recovery_obligation_for_restriction(p_restriction_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_restriction public.sybil_v2_wallet_restrictions%rowtype;
  v_invitation public.invitations%rowtype;
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_settlement public.reward_recovery_settlements%rowtype;
  v_receipt public.reward_receipts%rowtype;
  v_promo_receipt public.reward_x_promotion_receipts%rowtype;
  v_existing public.reward_recovery_obligations%rowtype;
  v_obligation public.reward_recovery_obligations%rowtype;
  v_existing_invalidation_active boolean := false;
  v_desired numeric(78,0) := 0;
  v_previous_status text;
  v_event_kind text := 'ACTIVATED';
begin
  select * into v_restriction
  from public.sybil_v2_wallet_restrictions r
  where r.id=p_restriction_id
  for update;

  if not found
     or v_restriction.status<>'ACTIVE'
     or v_restriction.related_invite_code is null then
    return null;
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code=v_restriction.related_invite_code;

  if not found
     or lower(coalesce(v_invitation.activation_network,''))<>lower(v_restriction.network)
     or v_invitation.invitee_wallet is null
     or lower(v_invitation.invitee_wallet)<>lower(v_restriction.wallet_address) then
    return null;
  end if;

  select * into v_assessment
  from public.sybil_v2_referral_assessments a
  where a.invite_code=v_invitation.invite_code
    and a.network=lower(v_restriction.network);

  if not found or v_assessment.state<>'RESTRICTED' then
    return null;
  end if;

  select * into v_settlement
  from public.reward_recovery_settlements s
  where s.network=lower(v_restriction.network)
    and s.invite_code=v_invitation.invite_code
  limit 1;

  if not found then
    return null;
  end if;

  select * into v_receipt
  from public.reward_receipts r
  where lower(r.network)=lower(v_restriction.network)
    and r.invite_code=v_invitation.invite_code
  order by r.id desc
  limit 1;

  select * into v_promo_receipt
  from public.reward_x_promotion_receipts r
  where lower(r.network)=lower(v_restriction.network)
    and r.invite_code=v_invitation.invite_code
  order by r.id desc
  limit 1;

  if v_promo_receipt.id is not null then
    if v_receipt.id is null
       or lower(v_promo_receipt.recipient_wallet)<>lower(v_receipt.recipient_wallet)
       or lower(v_promo_receipt.recipient_wallet)<>lower(v_settlement.recipient_wallet) then
      raise exception 'REWARD_X_PROMOTION_RECOVERY_RECEIPT_MISMATCH';
    end if;
  end if;

  -- Restore only economic value already consumed: offset plus any actual
  -- finalized net transfer. A cancelled/unpaid net amount never becomes debt.
  v_desired :=
    v_settlement.offset_amount_wei +
    coalesce(v_receipt.amount_wei,0) +
    coalesce(v_promo_receipt.amount_wei,0);

  if v_desired<=0 then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_reward_recovery_' ||
      lower(v_restriction.network) || '_' ||
      lower(v_settlement.recipient_wallet),
      0
    )
  );

  select * into v_existing
  from public.reward_recovery_obligations o
  where o.source_restriction_id=v_restriction.id
     or o.source_settlement_id=v_settlement.id
  order by
    case when o.source_restriction_id=v_restriction.id then 0 else 1 end,
    o.created_at,
    o.id
  limit 1
  for update;

  if found and v_existing.source_invalidation_id is not null then
    select exists(
      select 1
      from public.sybil_v2_referral_invalidations x
      where x.id=v_existing.source_invalidation_id
        and x.status='ACTIVE'
    ) into v_existing_invalidation_active;
  end if;

  if found then
    v_previous_status := v_existing.status;
    v_event_kind := case
      when v_desired>v_existing.amount_wei then 'TOPPED_UP'
      else 'ACTIVATED'
    end;

    update public.reward_recovery_obligations o
    set
      recipient_wallet=lower(v_settlement.recipient_wallet),
      source_invalidation_id=case
        when v_existing_invalidation_active
          then v_existing.source_invalidation_id
        else null
      end,
      source_restriction_id=case
        when v_existing_invalidation_active
          then null
        else v_restriction.id
      end,
      source_receipt_id=null,
      source_settlement_id=v_settlement.id,
      source_invite_code=v_invitation.invite_code,
      amount_wei=greatest(o.amount_wei,v_desired),
      status='ACTIVE',
      status_reason=case
        when v_existing_invalidation_active
          then 'ACTIVE_REFERRAL_INVALIDATION'
        else 'ACTIVE_SETTLEMENT_REFERRAL_RESTRICTION'
      end,
      updated_at=clock_timestamp()
    where o.id=v_existing.id
    returning * into v_obligation;
  else
    insert into public.reward_recovery_obligations(
      network,recipient_wallet,source_invalidation_id,source_restriction_id,
      source_receipt_id,source_settlement_id,source_invite_code,
      amount_wei,status,status_reason
    ) values (
      lower(v_restriction.network),
      lower(v_settlement.recipient_wallet),
      null,
      v_restriction.id,
      null,
      v_settlement.id,
      v_invitation.invite_code,
      v_desired,
      'ACTIVE',
      'ACTIVE_SETTLEMENT_REFERRAL_RESTRICTION'
    )
    returning * into v_obligation;

    v_previous_status := null;
    v_event_kind := 'CREATED';
  end if;

  insert into public.reward_recovery_obligation_events(
    obligation_id,event_kind,previous_status,new_status,amount_wei,reason,details
  ) values (
    v_obligation.id,
    v_event_kind,
    v_previous_status,
    v_obligation.status,
    v_obligation.amount_wei,
    'ACTIVE_SETTLEMENT_REFERRAL_RESTRICTION',
    jsonb_build_object(
      'restrictionId',v_restriction.id::text,
      'inviteCode',v_invitation.invite_code,
      'assessmentRevision',v_assessment.revision,
      'settlementId',v_settlement.id::text,
      'receiptId',case when v_receipt.id is not null then v_receipt.id::text else null end,
      'offsetWei',v_settlement.offset_amount_wei::text,
      'paidWei',case when v_receipt.id is not null then v_receipt.amount_wei::text else '0' end,
      'xPromotionReceiptId',case when v_promo_receipt.id is not null then v_promo_receipt.id::text else null end,
      'xPromotionPaidWei',case when v_promo_receipt.id is not null then v_promo_receipt.amount_wei::text else '0' end
    )
  );

  return v_obligation.id;
end;
$function$;



CREATE OR REPLACE FUNCTION public.reconcile_reward_recovery_after_x_promotion_v1(p_invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
declare
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_promo public.reward_x_promotion_receipts%rowtype;
  v_core public.reward_receipts%rowtype;
  v_settlement public.reward_recovery_settlements%rowtype;
  v_invalidation public.sybil_v2_referral_invalidations%rowtype;
  v_restriction public.sybil_v2_wallet_restrictions%rowtype;
  v_existing public.reward_recovery_obligations%rowtype;
  v_desired numeric(78,0) := 0;
  v_obligation_id uuid;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  select * into v_promo
  from public.reward_x_promotion_receipts r
  where r.invite_code=v_code
  limit 1;

  if not found then
    return jsonb_build_object(
      'reconciled',false,
      'reason','NO_PAID_X_PROMOTION',
      'inviteCode',v_code
    );
  end if;

  select * into v_core
  from public.reward_receipts r
  where lower(r.network)=lower(v_promo.network)
    and r.invite_code=v_code
  order by r.id desc
  limit 1;

  if not found
     or lower(v_core.recipient_wallet)<>lower(v_promo.recipient_wallet) then
    raise exception 'REWARD_X_PROMOTION_RECOVERY_CORE_RECEIPT_MISMATCH';
  end if;

  select * into v_settlement
  from public.reward_recovery_settlements s
  where lower(s.network)=lower(v_promo.network)
    and s.invite_code=v_code
  limit 1;

  if v_settlement.id is not null
     and lower(v_settlement.recipient_wallet)<>lower(v_promo.recipient_wallet) then
    raise exception 'REWARD_X_PROMOTION_RECOVERY_SETTLEMENT_MISMATCH';
  end if;

  v_desired :=
    coalesce(v_settlement.offset_amount_wei,0) +
    v_core.amount_wei +
    v_promo.amount_wei;

  select * into v_invalidation
  from public.sybil_v2_referral_invalidations x
  where lower(x.network)=lower(v_promo.network)
    and x.invite_code=v_code
    and x.status='ACTIVE'
  limit 1;

  if v_invalidation.id is not null then
    select * into v_existing
    from public.reward_recovery_obligations o
    where o.source_invalidation_id=v_invalidation.id
      and o.status='ACTIVE'
    order by o.created_at desc,o.id
    limit 1;

    if v_existing.id is not null
       and v_existing.amount_wei>=v_desired then
      return jsonb_build_object(
        'reconciled',false,
        'reason','ALREADY_RECONCILED',
        'authority','INVALIDATION',
        'inviteCode',v_code,
        'obligationId',v_existing.id,
        'desiredWei',v_desired::text
      );
    end if;

    v_obligation_id :=
      public.upsert_reward_recovery_obligation_for_invalidation(
        v_invalidation.id
      );

    if v_obligation_id is null then
      raise exception 'REWARD_X_PROMOTION_INVALIDATION_RECOVERY_RECONCILE_FAILED';
    end if;

    return jsonb_build_object(
      'reconciled',true,
      'reason','INVALIDATION_RECONCILED',
      'authority','INVALIDATION',
      'inviteCode',v_code,
      'obligationId',v_obligation_id,
      'desiredWei',v_desired::text,
      'xPromotionPaidWei',v_promo.amount_wei::text
    );
  end if;

  select r.* into v_restriction
  from public.sybil_v2_wallet_restrictions r
  join public.invitations i
    on i.invite_code=r.related_invite_code
   and lower(i.invitee_wallet)=lower(r.wallet_address)
   and lower(i.activation_network)=lower(r.network)
  join public.sybil_v2_referral_assessments a
    on a.invite_code=i.invite_code
   and lower(a.network)=lower(r.network)
   and a.state='RESTRICTED'
  where lower(r.network)=lower(v_promo.network)
    and r.related_invite_code=v_code
    and r.status='ACTIVE'
  order by r.imposed_at desc,r.created_at desc
  limit 1;

  if v_restriction.id is not null
     and v_settlement.id is not null then
    select * into v_existing
    from public.reward_recovery_obligations o
    where o.source_restriction_id=v_restriction.id
      and o.status='ACTIVE'
    order by o.created_at desc,o.id
    limit 1;

    if v_existing.id is not null
       and v_existing.amount_wei>=v_desired then
      return jsonb_build_object(
        'reconciled',false,
        'reason','ALREADY_RECONCILED',
        'authority','RESTRICTION',
        'inviteCode',v_code,
        'obligationId',v_existing.id,
        'desiredWei',v_desired::text
      );
    end if;

    v_obligation_id :=
      public.upsert_reward_recovery_obligation_for_restriction(
        v_restriction.id
      );

    if v_obligation_id is null then
      raise exception 'REWARD_X_PROMOTION_RESTRICTION_RECOVERY_RECONCILE_FAILED';
    end if;

    return jsonb_build_object(
      'reconciled',true,
      'reason','RESTRICTION_RECONCILED',
      'authority','RESTRICTION',
      'inviteCode',v_code,
      'obligationId',v_obligation_id,
      'desiredWei',v_desired::text,
      'xPromotionPaidWei',v_promo.amount_wei::text
    );
  end if;

  return jsonb_build_object(
    'reconciled',false,
    'reason','NO_ACTIVE_RECOVERY_AUTHORITY',
    'inviteCode',v_code,
    'desiredWei',v_desired::text
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_reward_recovery_after_x_promotion_v1(text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_reward_recovery_after_x_promotion_v1(text)
TO service_role;



CREATE OR REPLACE FUNCTION public.reconcile_reward_x_promotion_recovery_batch_v1(
  p_network text,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
declare
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_limit integer := least(greatest(coalesce(p_limit,50),1),200);
  v_row record;
  v_result jsonb;
  v_checked integer := 0;
  v_reconciled integer := 0;
  v_failed integer := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'INVALID_X_PROMOTION_RECOVERY_NETWORK';
  end if;

  for v_row in
    with promo as (
      select
        xr.invite_code,
        xr.amount_wei as promo_wei,
        xr.recipient_wallet,
        xr.paid_at,
        coalesce(rs.offset_amount_wei,0) as offset_wei,
        rr.amount_wei as core_paid_wei,
        xi.id as invalidation_id,
        wr.id as restriction_id,
        case
          when xi.id is not null then xi.id
          else wr.id
        end as authority_id,
        case
          when xi.id is not null then 'INVALIDATION'
          when wr.id is not null then 'RESTRICTION'
          else null
        end as authority_kind
      from public.reward_x_promotion_receipts xr
      join public.reward_receipts rr
        on rr.network=xr.network
       and rr.invite_code=xr.invite_code
       and lower(rr.recipient_wallet)=lower(xr.recipient_wallet)
      left join public.reward_recovery_settlements rs
        on rs.network=xr.network
       and rs.invite_code=xr.invite_code
      left join public.sybil_v2_referral_invalidations xi
        on xi.network=xr.network
       and xi.invite_code=xr.invite_code
       and xi.status='ACTIVE'
      left join lateral (
        select r.id
        from public.sybil_v2_wallet_restrictions r
        join public.invitations i
          on i.invite_code=r.related_invite_code
         and lower(i.invitee_wallet)=lower(r.wallet_address)
         and lower(i.activation_network)=lower(r.network)
        join public.sybil_v2_referral_assessments a
          on a.invite_code=i.invite_code
         and lower(a.network)=lower(r.network)
         and a.state='RESTRICTED'
        where r.network=xr.network
          and r.related_invite_code=xr.invite_code
          and r.status='ACTIVE'
          and rs.id is not null
        order by r.imposed_at desc,r.created_at desc
        limit 1
      ) wr on xi.id is null
      where xr.network=v_network
    ),
    candidates as (
      select
        p.*,
        p.offset_wei+p.core_paid_wei+p.promo_wei as desired_wei,
        o.id as obligation_id,
        o.amount_wei as obligation_wei,
        o.status as obligation_status
      from promo p
      left join lateral (
        select o.*
        from public.reward_recovery_obligations o
        where (
          (p.authority_kind='INVALIDATION'
            and o.source_invalidation_id=p.authority_id)
          or
          (p.authority_kind='RESTRICTION'
            and o.source_restriction_id=p.authority_id)
        )
        order by
          case when o.status='ACTIVE' then 0 else 1 end,
          o.amount_wei desc,
          o.created_at desc,
          o.id
        limit 1
      ) o on true
      where p.authority_id is not null
        and (
          o.id is null
          or o.status<>'ACTIVE'
          or o.amount_wei <
            p.offset_wei+p.core_paid_wei+p.promo_wei
        )
    )
    select *
    from candidates
    order by paid_at asc,invite_code asc
    limit v_limit
  loop
    v_checked:=v_checked+1;
    begin
      v_result :=
        public.reconcile_reward_recovery_after_x_promotion_v1(
          v_row.invite_code
        );
      if coalesce((v_result->>'reconciled')::boolean,false) then
        v_reconciled:=v_reconciled+1;
      end if;
    exception when others then
      v_failed:=v_failed+1;
    end;
  end loop;

  return jsonb_build_object(
    'network',v_network,
    'checked',v_checked,
    'reconciled',v_reconciled,
    'failed',v_failed
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_reward_x_promotion_recovery_batch_v1(text,integer)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_reward_x_promotion_recovery_batch_v1(text,integer)
TO service_role;
