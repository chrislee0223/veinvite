begin;

-- Recovery obligations can originate either from an explicit historical
-- referral invalidation or from a current Sybil restriction on a referral
-- whose economic reward was already settled through recovery offset.
alter table public.reward_recovery_obligations
  alter column source_invalidation_id drop not null;

alter table public.reward_recovery_obligations
  add column if not exists source_restriction_id uuid
    references public.sybil_v2_wallet_restrictions(id) on delete restrict;

alter table public.reward_recovery_obligations
  drop constraint if exists reward_recovery_obligations_authority_source_check;

alter table public.reward_recovery_obligations
  add constraint reward_recovery_obligations_authority_source_check
  check (num_nonnulls(source_invalidation_id,source_restriction_id)=1);

create unique index if not exists reward_recovery_obligations_restriction_uidx
  on public.reward_recovery_obligations(source_restriction_id)
  where source_restriction_id is not null;

create unique index if not exists reward_recovery_obligations_settlement_uidx
  on public.reward_recovery_obligations(source_settlement_id)
  where source_settlement_id is not null;

alter table public.reward_recovery_review_queue
  drop constraint if exists reward_recovery_review_queue_reason_kind_check;

alter table public.reward_recovery_review_queue
  add constraint reward_recovery_review_queue_reason_kind_check
  check (reason_kind = any(array[
    'SOURCE_INVALIDATION_REINSTATED_AFTER_CONSUMPTION'::text,
    'SOURCE_RESTRICTION_REINSTATED_AFTER_CONSUMPTION'::text,
    'SETTLEMENT_INVALIDATION_REINSTATED'::text
  ]));

create or replace function public.upsert_reward_recovery_obligation_for_invalidation(
  p_invalidation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_invalidation public.sybil_v2_referral_invalidations%rowtype;
  v_settlement public.reward_recovery_settlements%rowtype;
  v_receipt public.reward_receipts%rowtype;
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

  if v_settlement.id is not null then
    v_desired :=
      v_settlement.offset_amount_wei +
      coalesce(v_receipt.amount_wei,0);
    v_recipient_wallet := lower(v_settlement.recipient_wallet);
  elsif v_receipt.id is not null then
    v_desired := v_receipt.amount_wei;
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
      'paidWei',case when v_receipt.id is not null then v_receipt.amount_wei::text else '0' end
    )
  );

  return v_obligation.id;
end;
$$;

revoke all on function public.upsert_reward_recovery_obligation_for_invalidation(uuid)
  from public,anon,authenticated;
grant execute on function public.upsert_reward_recovery_obligation_for_invalidation(uuid)
  to service_role;

create or replace function public.upsert_reward_recovery_obligation_for_restriction(
  p_restriction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_restriction public.sybil_v2_wallet_restrictions%rowtype;
  v_invitation public.invitations%rowtype;
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_settlement public.reward_recovery_settlements%rowtype;
  v_receipt public.reward_receipts%rowtype;
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

  -- Restore only economic value already consumed: offset plus any actual
  -- finalized net transfer. A cancelled/unpaid net amount never becomes debt.
  v_desired :=
    v_settlement.offset_amount_wei +
    coalesce(v_receipt.amount_wei,0);

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
      'paidWei',case when v_receipt.id is not null then v_receipt.amount_wei::text else '0' end
    )
  );

  return v_obligation.id;
end;
$$;

revoke all on function public.upsert_reward_recovery_obligation_for_restriction(uuid)
  from public,anon,authenticated;
grant execute on function public.upsert_reward_recovery_obligation_for_restriction(uuid)
  to service_role;

create or replace function public.sync_reward_recovery_receipt()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $
declare
  v_invalidation_id uuid;
  v_restriction_id uuid;
begin
  select x.id
  into v_invalidation_id
  from public.sybil_v2_referral_invalidations x
  where x.network=lower(new.network)
    and x.invite_code=new.invite_code
    and x.status='ACTIVE'
  order by x.decided_at desc,x.id desc
  limit 1;

  if v_invalidation_id is not null then
    perform public.upsert_reward_recovery_obligation_for_invalidation(
      v_invalidation_id
    );
    return new;
  end if;

  select r.id
  into v_restriction_id
  from public.sybil_v2_wallet_restrictions r
  join public.invitations i
    on i.invite_code=new.invite_code
   and i.invitee_wallet is not null
   and lower(i.invitee_wallet)=r.wallet_address
  join public.sybil_v2_referral_assessments a
    on a.invite_code=i.invite_code
   and a.network=r.network
   and a.state='RESTRICTED'
  where r.network=lower(new.network)
    and r.related_invite_code=new.invite_code
    and r.status='ACTIVE'
    and r.resolved_at is null
  order by r.imposed_at desc,r.id desc
  limit 1;

  if v_restriction_id is not null then
    perform public.upsert_reward_recovery_obligation_for_restriction(
      v_restriction_id
    );
  end if;

  return new;
end;
$;

revoke all on function public.sync_reward_recovery_receipt()
  from public,anon,authenticated,service_role;

create or replace function public.sync_reward_recovery_invalidation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_obligation public.reward_recovery_obligations%rowtype;
  v_consumed numeric(78,0) := 0;
  v_previous_status text;
  v_wallet text;
  v_network text;
begin
  if new.status='ACTIVE' then
    perform public.upsert_reward_recovery_obligation_for_invalidation(new.id);
    return new;
  end if;

  if new.status='REINSTATED' then
    select o.recipient_wallet,o.network
    into v_wallet,v_network
    from public.reward_recovery_obligations o
    where o.source_invalidation_id=new.id
    order by o.created_at,o.id
    limit 1;

    if v_wallet is not null then
      perform pg_advisory_xact_lock(
        hashtextextended(
          'veinvite_reward_recovery_' ||
          v_network || '_' || v_wallet,
          0
        )
      );
    end if;

    for v_obligation in
      select *
      from public.reward_recovery_obligations o
      where o.source_invalidation_id=new.id
      for update
    loop
      select coalesce(sum(a.amount_wei),0)
      into v_consumed
      from public.reward_recovery_allocations a
      where a.obligation_id=v_obligation.id;

      v_previous_status := v_obligation.status;

      if v_consumed>0 then
        update public.reward_recovery_obligations
        set
          status='FROZEN',
          status_reason='SOURCE_INVALIDATION_REINSTATED_AFTER_CONSUMPTION',
          updated_at=clock_timestamp()
        where id=v_obligation.id
        returning * into v_obligation;

        insert into public.reward_recovery_review_queue(
          network,recipient_wallet,invite_code,obligation_id,settlement_id,
          reason_kind,details
        ) values (
          v_obligation.network,
          v_obligation.recipient_wallet,
          v_obligation.source_invite_code,
          v_obligation.id,
          v_obligation.source_settlement_id,
          'SOURCE_INVALIDATION_REINSTATED_AFTER_CONSUMPTION',
          jsonb_build_object(
            'consumedWei',v_consumed::text,
            'obligationWei',v_obligation.amount_wei::text,
            'invalidationId',new.id::text
          )
        )
        on conflict do nothing;

        insert into public.reward_recovery_obligation_events(
          obligation_id,event_kind,previous_status,new_status,amount_wei,reason,details
        ) values (
          v_obligation.id,'FROZEN',v_previous_status,'FROZEN',
          v_obligation.amount_wei,
          'SOURCE_INVALIDATION_REINSTATED_AFTER_CONSUMPTION',
          jsonb_build_object('consumedWei',v_consumed::text)
        );
      else
        update public.reward_recovery_obligations
        set
          status='REVERSED',
          status_reason='SOURCE_INVALIDATION_REINSTATED_BEFORE_CONSUMPTION',
          updated_at=clock_timestamp()
        where id=v_obligation.id
        returning * into v_obligation;

        insert into public.reward_recovery_obligation_events(
          obligation_id,event_kind,previous_status,new_status,amount_wei,reason,details
        ) values (
          v_obligation.id,'REVERSED',v_previous_status,'REVERSED',
          v_obligation.amount_wei,
          'SOURCE_INVALIDATION_REINSTATED_BEFORE_CONSUMPTION',
          jsonb_build_object('consumedWei','0')
        );
      end if;
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_reward_recovery_invalidation()
  from public,anon,authenticated,service_role;

create or replace function public.sync_reward_recovery_restriction()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_obligation public.reward_recovery_obligations%rowtype;
  v_consumed numeric(78,0) := 0;
  v_previous_status text;
begin
  if new.status='ACTIVE' then
    perform public.upsert_reward_recovery_obligation_for_restriction(new.id);
    return new;
  end if;

  if new.status='REINSTATED' then
    select * into v_obligation
    from public.reward_recovery_obligations o
    where o.source_restriction_id=new.id
    limit 1;

    if not found then
      return new;
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(
        'veinvite_reward_recovery_' ||
        v_obligation.network || '_' ||
        v_obligation.recipient_wallet,
        0
      )
    );

    select * into v_obligation
    from public.reward_recovery_obligations o
    where o.id=v_obligation.id
    for update;

    select coalesce(sum(a.amount_wei),0)
    into v_consumed
    from public.reward_recovery_allocations a
    where a.obligation_id=v_obligation.id;

    v_previous_status := v_obligation.status;

    if v_consumed>0 then
      update public.reward_recovery_obligations
      set
        status='FROZEN',
        status_reason='SOURCE_RESTRICTION_REINSTATED_AFTER_CONSUMPTION',
        updated_at=clock_timestamp()
      where id=v_obligation.id
      returning * into v_obligation;

      insert into public.reward_recovery_review_queue(
        network,recipient_wallet,invite_code,obligation_id,settlement_id,
        reason_kind,details
      ) values (
        v_obligation.network,
        v_obligation.recipient_wallet,
        v_obligation.source_invite_code,
        v_obligation.id,
        v_obligation.source_settlement_id,
        'SOURCE_RESTRICTION_REINSTATED_AFTER_CONSUMPTION',
        jsonb_build_object(
          'consumedWei',v_consumed::text,
          'obligationWei',v_obligation.amount_wei::text,
          'restrictionId',new.id::text
        )
      )
      on conflict do nothing;

      insert into public.reward_recovery_obligation_events(
        obligation_id,event_kind,previous_status,new_status,amount_wei,reason,details
      ) values (
        v_obligation.id,'FROZEN',v_previous_status,'FROZEN',
        v_obligation.amount_wei,
        'SOURCE_RESTRICTION_REINSTATED_AFTER_CONSUMPTION',
        jsonb_build_object('consumedWei',v_consumed::text)
      );
    else
      update public.reward_recovery_obligations
      set
        status='REVERSED',
        status_reason='SOURCE_RESTRICTION_REINSTATED_BEFORE_CONSUMPTION',
        updated_at=clock_timestamp()
      where id=v_obligation.id
      returning * into v_obligation;

      insert into public.reward_recovery_obligation_events(
        obligation_id,event_kind,previous_status,new_status,amount_wei,reason,details
      ) values (
        v_obligation.id,'REVERSED',v_previous_status,'REVERSED',
        v_obligation.amount_wei,
        'SOURCE_RESTRICTION_REINSTATED_BEFORE_CONSUMPTION',
        jsonb_build_object('consumedWei','0')
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_reward_recovery_restriction()
  from public,anon,authenticated,service_role;

drop trigger if exists sybil_v2_reward_recovery_restriction_sync
  on public.sybil_v2_wallet_restrictions;
create trigger sybil_v2_reward_recovery_restriction_sync
after insert or update of status
on public.sybil_v2_wallet_restrictions
for each row execute function public.sync_reward_recovery_restriction();

create or replace function public.sync_reward_recovery_restricted_assessment()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_invitation public.invitations%rowtype;
  v_restriction_id uuid;
begin
  if new.state<>'RESTRICTED' then
    return new;
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code=new.invite_code;

  if not found or v_invitation.invitee_wallet is null then
    return new;
  end if;

  select r.id
  into v_restriction_id
  from public.sybil_v2_wallet_restrictions r
  where r.network=new.network
    and r.wallet_address=lower(v_invitation.invitee_wallet)
    and r.related_invite_code=new.invite_code
    and r.status='ACTIVE'
    and r.resolved_at is null
  order by r.imposed_at desc,r.id desc
  limit 1;

  if v_restriction_id is not null then
    perform public.upsert_reward_recovery_obligation_for_restriction(
      v_restriction_id
    );
  end if;

  return new;
end;
$$;

revoke all on function public.sync_reward_recovery_restricted_assessment()
  from public,anon,authenticated,service_role;

drop trigger if exists sybil_v2_reward_recovery_restricted_assessment_sync
  on public.sybil_v2_referral_assessments;
create trigger sybil_v2_reward_recovery_restricted_assessment_sync
after insert or update of state
on public.sybil_v2_referral_assessments
for each row execute function public.sync_reward_recovery_restricted_assessment();

commit;
