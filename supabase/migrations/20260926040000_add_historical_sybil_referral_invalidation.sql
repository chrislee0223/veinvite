begin;

create table if not exists public.sybil_v2_referral_invalidations (
  id uuid primary key default gen_random_uuid(),
  network text not null
    check (network in ('mainnet','testnet','testnet-staging')),
  invitation_id uuid not null
    references public.invitations(id) on delete restrict,
  invite_code text not null
    references public.invitations(invite_code)
    on update cascade on delete restrict,
  inviter_wallet text not null
    check (inviter_wallet ~ '^0x[0-9a-f]{40}$'),
  invitee_wallet text not null
    check (invitee_wallet ~ '^0x[0-9a-f]{40}$'),
  status text not null
    check (status in ('ACTIVE','REINSTATED')),
  case_key text,
  reason_codes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(reason_codes) = 'array'),
  evidence_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence_summary) = 'object'),
  operator_wallet text not null
    check (operator_wallet ~ '^0x[0-9a-f]{40}$'),
  operator_reason text not null
    check (length(btrim(operator_reason)) between 12 and 500),
  decided_at timestamptz not null default clock_timestamp(),
  reinstated_at timestamptz,
  reinstated_by text
    check (reinstated_by is null or reinstated_by ~ '^0x[0-9a-f]{40}$'),
  reinstatement_reason text,
  created_at timestamptz not null default now(),
  constraint sybil_v2_referral_invalidations_unique
    unique (network, invite_code),
  constraint sybil_v2_referral_invalidations_resolution_check
    check (
      (
        status = 'ACTIVE'
        and reinstated_at is null
        and reinstated_by is null
        and reinstatement_reason is null
      )
      or
      (
        status = 'REINSTATED'
        and reinstated_at is not null
        and reinstated_by is not null
        and reinstatement_reason is not null
      )
    )
);

create index if not exists sybil_v2_referral_invalidations_invitee_idx
  on public.sybil_v2_referral_invalidations(
    network,
    invitee_wallet,
    decided_at desc
  );

create index if not exists sybil_v2_referral_invalidations_inviter_idx
  on public.sybil_v2_referral_invalidations(
    network,
    inviter_wallet,
    decided_at desc
  );

create index if not exists sybil_v2_referral_invalidations_active_idx
  on public.sybil_v2_referral_invalidations(network, invite_code)
  where status = 'ACTIVE';

alter table public.sybil_v2_referral_invalidations
  enable row level security;

revoke all on table public.sybil_v2_referral_invalidations
  from public, anon, authenticated;
grant select, insert, update
  on table public.sybil_v2_referral_invalidations
  to service_role;

create table if not exists public.sybil_v2_referral_invalidation_events (
  id bigint generated always as identity primary key,
  invalidation_id uuid not null
    references public.sybil_v2_referral_invalidations(id)
    on delete restrict,
  action text not null
    check (action in ('INVALIDATED','REINSTATED')),
  network text not null
    check (network in ('mainnet','testnet','testnet-staging')),
  invite_code text not null,
  inviter_wallet text not null
    check (inviter_wallet ~ '^0x[0-9a-f]{40}$'),
  invitee_wallet text not null
    check (invitee_wallet ~ '^0x[0-9a-f]{40}$'),
  case_key text,
  reason_codes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(reason_codes) = 'array'),
  evidence_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence_summary) = 'object'),
  operator_wallet text not null
    check (operator_wallet ~ '^0x[0-9a-f]{40}$'),
  operator_reason text not null
    check (length(btrim(operator_reason)) between 12 and 500),
  created_at timestamptz not null default now()
);

create index if not exists sybil_v2_referral_invalidation_events_invite_idx
  on public.sybil_v2_referral_invalidation_events(
    network,
    invite_code,
    id desc
  );

alter table public.sybil_v2_referral_invalidation_events
  enable row level security;

revoke all on table public.sybil_v2_referral_invalidation_events
  from public, anon, authenticated;
grant select, insert
  on table public.sybil_v2_referral_invalidation_events
  to service_role;
grant usage, select
  on sequence public.sybil_v2_referral_invalidation_events_id_seq
  to service_role;

create or replace function public.prevent_sybil_v2_referral_invalidation_identity_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.network is distinct from old.network
     or new.invitation_id is distinct from old.invitation_id
     or new.invite_code is distinct from old.invite_code
     or new.inviter_wallet is distinct from old.inviter_wallet
     or new.invitee_wallet is distinct from old.invitee_wallet
     or new.created_at is distinct from old.created_at then
    raise exception 'sybil referral invalidation identity is immutable';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_sybil_v2_referral_invalidation_identity_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists sybil_v2_referral_invalidation_identity_immutable
  on public.sybil_v2_referral_invalidations;
create trigger sybil_v2_referral_invalidation_identity_immutable
before update on public.sybil_v2_referral_invalidations
for each row
execute function public.prevent_sybil_v2_referral_invalidation_identity_mutation();

create or replace function public.prevent_sybil_v2_referral_invalidation_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'sybil referral invalidation events are append-only';
end;
$$;

revoke all on function public.prevent_sybil_v2_referral_invalidation_event_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists sybil_v2_referral_invalidation_events_immutable
  on public.sybil_v2_referral_invalidation_events;
create trigger sybil_v2_referral_invalidation_events_immutable
before update or delete on public.sybil_v2_referral_invalidation_events
for each row
execute function public.prevent_sybil_v2_referral_invalidation_event_mutation();

create or replace function public.is_sybil_v2_referral_invalidated(
  p_invite_code text,
  p_network text default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when p_invite_code is null then false
    else exists (
      select 1
      from public.sybil_v2_referral_invalidations x
      where x.invite_code = upper(btrim(p_invite_code))
        and x.status = 'ACTIVE'
        and (
          p_network is null
          or x.network = lower(btrim(p_network))
        )
    )
  end;
$$;

revoke all on function public.is_sybil_v2_referral_invalidated(text,text)
  from public, anon, authenticated;
grant execute on function public.is_sybil_v2_referral_invalidated(text,text)
  to service_role;

create or replace function public.resolve_sybil_v2_historical_referral(
  p_invite_code text,
  p_decision text,
  p_reason text,
  p_operator_wallet text,
  p_network text,
  p_case_key text default null,
  p_reason_codes jsonb default '["HISTORICAL_REFERRAL_SYBIL"]'::jsonb,
  p_evidence_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text := upper(btrim(p_invite_code));
  v_decision text := upper(btrim(p_decision));
  v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
  v_operator text := lower(btrim(p_operator_wallet));
  v_network text := lower(btrim(p_network));
  v_case_key text := nullif(btrim(coalesce(p_case_key,'')), '');
  v_invitation public.invitations%rowtype;
  v_invalidation public.sybil_v2_referral_invalidations%rowtype;
  v_restriction_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  if v_decision not in ('BLACKLIST','REINSTATE') then
    raise exception 'INVALID_HISTORICAL_REFERRAL_DECISION';
  end if;

  if v_reason is null
     or length(v_reason) < 12
     or length(v_reason) > 500 then
    raise exception 'HISTORICAL_REFERRAL_REASON_LENGTH';
  end if;

  if v_operator !~ '^0x[0-9a-f]{40}$' then
    raise exception 'INVALID_OPERATOR_WALLET';
  end if;

  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'INVALID_NETWORK';
  end if;

  if jsonb_typeof(coalesce(p_reason_codes,'[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_REASON_CODES';
  end if;

  if jsonb_typeof(coalesce(p_evidence_summary,'{}'::jsonb)) <> 'object' then
    raise exception 'INVALID_EVIDENCE_SUMMARY';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_historical_referral_' || v_network || ':' || v_code,
      0
    )
  );

  select *
  into v_invitation
  from public.invitations i
  where i.invite_code = v_code
  for update;

  if not found then
    raise exception 'HISTORICAL_REFERRAL_NOT_FOUND';
  end if;

  if lower(coalesce(v_invitation.activation_network,'')) <> v_network then
    raise exception 'HISTORICAL_REFERRAL_NETWORK_MISMATCH';
  end if;

  if v_invitation.invitee_wallet is null
     or lower(v_invitation.invitee_wallet) !~ '^0x[0-9a-f]{40}$' then
    raise exception 'HISTORICAL_REFERRAL_INVITEE_MISSING';
  end if;

  if v_invitation.reward_status <> 'PAID' then
    raise exception 'HISTORICAL_REFERRAL_NOT_PAID';
  end if;

  select *
  into v_invalidation
  from public.sybil_v2_referral_invalidations x
  where x.network = v_network
    and x.invite_code = v_code
  for update;

  if v_decision = 'BLACKLIST' then
    if found and v_invalidation.status = 'ACTIVE' then
      return jsonb_build_object(
        'changed', false,
        'decision', 'BLACKLIST',
        'state', 'INVALIDATED',
        'inviteCode', v_code,
        'inviteeWallet', lower(v_invitation.invitee_wallet),
        'inviterWallet', lower(v_invitation.inviter_wallet),
        'invalidationId', v_invalidation.id,
        'pastRewardChanged', false
      );
    end if;

    if found then
      update public.sybil_v2_referral_invalidations
      set
        status = 'ACTIVE',
        case_key = v_case_key,
        reason_codes = coalesce(p_reason_codes,'[]'::jsonb),
        evidence_summary = coalesce(p_evidence_summary,'{}'::jsonb),
        operator_wallet = v_operator,
        operator_reason = v_reason,
        decided_at = v_now,
        reinstated_at = null,
        reinstated_by = null,
        reinstatement_reason = null
      where id = v_invalidation.id
      returning * into v_invalidation;
    else
      insert into public.sybil_v2_referral_invalidations(
        network,
        invitation_id,
        invite_code,
        inviter_wallet,
        invitee_wallet,
        status,
        case_key,
        reason_codes,
        evidence_summary,
        operator_wallet,
        operator_reason,
        decided_at
      ) values (
        v_network,
        v_invitation.id,
        v_code,
        lower(v_invitation.inviter_wallet),
        lower(v_invitation.invitee_wallet),
        'ACTIVE',
        v_case_key,
        coalesce(p_reason_codes,'[]'::jsonb),
        coalesce(p_evidence_summary,'{}'::jsonb),
        v_operator,
        v_reason,
        v_now
      )
      returning * into v_invalidation;
    end if;

    select r.id
    into v_restriction_id
    from public.sybil_v2_wallet_restrictions r
    where r.network = v_network
      and r.wallet_address = lower(v_invitation.invitee_wallet)
      and r.status = 'ACTIVE'
    limit 1;

    if v_restriction_id is null then
      insert into public.sybil_v2_wallet_restrictions(
        wallet_address,
        network,
        status,
        reason_codes,
        evidence_summary,
        source,
        related_invite_code,
        imposed_at
      ) values (
        lower(v_invitation.invitee_wallet),
        v_network,
        'ACTIVE',
        coalesce(p_reason_codes,'[]'::jsonb)
          || jsonb_build_array('HISTORICAL_REFERRAL_OPERATOR_BLACKLIST'),
        coalesce(p_evidence_summary,'{}'::jsonb)
          || jsonb_build_object(
            'operatorReason', v_reason,
            'operatorWallet', v_operator,
            'operatorDecision', 'BLACKLIST',
            'restrictionScope', 'HISTORICAL_INVITEE_ONLY',
            'historicalInvalidationId', v_invalidation.id,
            'caseKey', v_case_key
          ),
        'OPERATOR',
        v_code,
        v_now
      )
      returning id into v_restriction_id;
    end if;

    insert into public.sybil_v2_referral_invalidation_events(
      invalidation_id,
      action,
      network,
      invite_code,
      inviter_wallet,
      invitee_wallet,
      case_key,
      reason_codes,
      evidence_summary,
      operator_wallet,
      operator_reason,
      created_at
    ) values (
      v_invalidation.id,
      'INVALIDATED',
      v_network,
      v_code,
      lower(v_invitation.inviter_wallet),
      lower(v_invitation.invitee_wallet),
      v_case_key,
      coalesce(p_reason_codes,'[]'::jsonb),
      coalesce(p_evidence_summary,'{}'::jsonb),
      v_operator,
      v_reason,
      v_now
    );

    if to_regprocedure(
      'public.record_invite_security_notification(text,text,text,timestamptz)'
    ) is not null then
      perform public.record_invite_security_notification(
        v_code,
        'SECURITY_RESTRICTION_CONFIRMED',
        'historical-invalidated-' || v_invalidation.id::text,
        v_now
      );
    end if;

    return jsonb_build_object(
      'changed', true,
      'decision', 'BLACKLIST',
      'state', 'INVALIDATED',
      'inviteCode', v_code,
      'inviteeWallet', lower(v_invitation.invitee_wallet),
      'inviterWallet', lower(v_invitation.inviter_wallet),
      'invalidationId', v_invalidation.id,
      'restrictionId', v_restriction_id,
      'pastRewardChanged', false
    );
  end if;

  if not found or v_invalidation.status <> 'ACTIVE' then
    raise exception 'HISTORICAL_REFERRAL_NOT_INVALIDATED';
  end if;

  update public.sybil_v2_referral_invalidations
  set
    status = 'REINSTATED',
    reinstated_at = v_now,
    reinstated_by = v_operator,
    reinstatement_reason = v_reason
  where id = v_invalidation.id
  returning * into v_invalidation;

  update public.sybil_v2_wallet_restrictions r
  set
    status = 'REINSTATED',
    resolved_at = v_now
  where r.network = v_network
    and r.wallet_address = lower(v_invitation.invitee_wallet)
    and r.status = 'ACTIVE'
    and r.related_invite_code = v_code
    and r.source = 'OPERATOR'
    and (
      (r.evidence_summary ->> 'restrictionScope') = 'HISTORICAL_INVITEE_ONLY'
      or r.reason_codes @> '["HISTORICAL_REFERRAL_OPERATOR_BLACKLIST"]'::jsonb
    );

  insert into public.sybil_v2_referral_invalidation_events(
    invalidation_id,
    action,
    network,
    invite_code,
    inviter_wallet,
    invitee_wallet,
    case_key,
    reason_codes,
    evidence_summary,
    operator_wallet,
    operator_reason,
    created_at
  ) values (
    v_invalidation.id,
    'REINSTATED',
    v_network,
    v_code,
    lower(v_invitation.inviter_wallet),
    lower(v_invitation.invitee_wallet),
    v_invalidation.case_key,
    v_invalidation.reason_codes,
    v_invalidation.evidence_summary,
    v_operator,
    v_reason,
    v_now
  );

  return jsonb_build_object(
    'changed', true,
    'decision', 'REINSTATE',
    'state', 'REINSTATED',
    'inviteCode', v_code,
    'inviteeWallet', lower(v_invitation.invitee_wallet),
    'inviterWallet', lower(v_invitation.inviter_wallet),
    'invalidationId', v_invalidation.id,
    'pastRewardChanged', false
  );
end;
$$;

revoke all on function public.resolve_sybil_v2_historical_referral(
  text,text,text,text,text,text,jsonb,jsonb
) from public, anon, authenticated;

grant execute on function public.resolve_sybil_v2_historical_referral(
  text,text,text,text,text,text,jsonb,jsonb
) to service_role;

create or replace function public.preview_sybil_v2_historical_referrals(
  p_invite_codes text[],
  p_network text
)
returns table(
  inviter_wallet text,
  candidate_referrals bigint,
  candidate_reward_wei numeric,
  current_recognized_referrals bigint,
  current_recognized_reward_wei numeric,
  projected_recognized_referrals bigint,
  projected_recognized_reward_wei numeric
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with params as (
    select lower(btrim(p_network)) as network
  ),
  codes as (
    select distinct upper(btrim(value)) as invite_code
    from unnest(coalesce(p_invite_codes,array[]::text[])) value
    where upper(btrim(value)) ~ '^[A-HJ-NP-Z2-9]{7}$'
  ),
  candidate_rows as (
    select
      i.invite_code,
      lower(i.inviter_wallet) as inviter_wallet,
      coalesce(sum(r.amount_wei::numeric),0::numeric) as reward_wei
    from codes c
    join public.invitations i
      on i.invite_code = c.invite_code
    cross join params p
    left join public.reward_receipts r
      on r.invite_code = i.invite_code
     and lower(btrim(r.network)) = p.network
    where lower(coalesce(i.activation_network,'')) = p.network
      and i.reward_status = 'PAID'
      and not public.is_sybil_v2_referral_invalidated(
        i.invite_code,
        p.network
      )
    group by i.invite_code, i.inviter_wallet
  ),
  candidate_totals as (
    select
      inviter_wallet,
      count(*)::bigint as candidate_referrals,
      sum(reward_wei)::numeric as candidate_reward_wei
    from candidate_rows
    group by inviter_wallet
  ),
  current_totals as (
    select
      wallet_address as inviter_wallet,
      completed_referrals as current_recognized_referrals,
      total_reward_wei as current_recognized_reward_wei
    from public.get_lifetime_paid_referral_ranking_v2_internal(
      (select network from params),
      null
    )
  )
  select
    c.inviter_wallet,
    c.candidate_referrals,
    c.candidate_reward_wei,
    coalesce(t.current_recognized_referrals,0)::bigint,
    coalesce(t.current_recognized_reward_wei,0)::numeric,
    greatest(
      coalesce(t.current_recognized_referrals,0) - c.candidate_referrals,
      0
    )::bigint,
    greatest(
      coalesce(t.current_recognized_reward_wei,0) - c.candidate_reward_wei,
      0::numeric
    )::numeric
  from candidate_totals c
  left join current_totals t using(inviter_wallet)
  order by c.candidate_referrals desc, c.inviter_wallet;
$$;

revoke all on function public.preview_sybil_v2_historical_referrals(text[],text)
  from public, anon, authenticated;

grant execute on function public.preview_sybil_v2_historical_referrals(text[],text)
  to service_role;

commit;
