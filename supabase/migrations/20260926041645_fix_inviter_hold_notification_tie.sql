begin;

create or replace function public.notify_sybil_v2_inviter_incident_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_posture record;
  v_new_strong boolean := false;
  v_previous_count bigint := 0;
  v_previous_strong bigint := 0;
  v_previous_hold boolean := false;
  v_previous_latest_incident_id uuid := null;
  v_previous_unresolved_hold boolean := false;
  v_current_unresolved_hold boolean := false;
begin
  if not public.sybil_v2_enforcement_enabled() then
    return new;
  end if;

  select *
  into v_posture
  from public.operator_sybil_v2_inviter_postures p
  where p.network = new.network
    and p.inviter_wallet = new.inviter_wallet;

  if not found then
    return new;
  end if;

  v_new_strong := jsonb_array_length(new.direct_link_families) >= 2;
  v_previous_count := greatest(v_posture.incident_count_90d - 1, 0);
  v_previous_strong := greatest(
    v_posture.strong_direct_link_incident_count_90d
      - case when v_new_strong then 1 else 0 end,
    0
  );
  v_previous_hold :=
    v_previous_count >= 3
    or v_previous_strong > 0;

  if v_previous_hold then
    select i.id
    into v_previous_latest_incident_id
    from public.sybil_v2_inviter_incidents i
    join public.sybil_v2_wallet_restrictions r
      on r.id = i.restriction_id
     and r.status = 'ACTIVE'
    where i.network = new.network
      and i.inviter_wallet = new.inviter_wallet
      and i.id <> new.id
      and i.recorded_at >= clock_timestamp() - interval '90 days'
    order by i.recorded_at desc, i.id desc
    limit 1;

    if v_previous_latest_incident_id is not null then
      v_previous_unresolved_hold := not exists (
        select 1
        from public.sybil_v2_inviter_review_decisions d
        where d.network = new.network
          and d.inviter_wallet = new.inviter_wallet
          and d.latest_incident_id = v_previous_latest_incident_id
      );
    end if;
  end if;

  select exists (
    select 1
    from public.operator_sybil_v2_inviter_review_candidates c
    where c.network = new.network
      and c.inviter_wallet = new.inviter_wallet
  )
  into v_current_unresolved_hold;

  if v_posture.posture = 'HOLD'
     and v_current_unresolved_hold
     and not v_previous_unresolved_hold then
    perform public.record_invite_security_notification(
      new.invite_code,
      'SECURITY_INVITER_HOLD',
      'inviter-hold-' || new.id::text,
      new.recorded_at
    );
  elsif v_posture.posture = 'WATCH'
        and v_previous_count < 2 then
    perform public.record_invite_security_notification(
      new.invite_code,
      'SECURITY_INVITER_WATCH',
      'inviter-watch-' || new.id::text,
      new.recorded_at
    );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_sybil_v2_inviter_incident_history()
  from public, anon, authenticated, service_role;

comment on function public.notify_sybil_v2_inviter_incident_history() is
  'Creates inviter WATCH/HOLD history only for meaningful escalation transitions. Current HOLD eligibility is keyed to the inviter review snapshot rather than UUID ordering, so tightly grouped incidents cannot suppress the HOLD notification.';

commit;
