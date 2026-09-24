begin;

create table if not exists public.sybil_v2_inviter_reinstatement_events (
  id uuid primary key default gen_random_uuid(),
  restriction_id uuid not null
    references public.sybil_v2_wallet_restrictions(id)
    on update cascade on delete restrict,
  network text not null
    check (network in ('mainnet','testnet','testnet-staging')),
  inviter_wallet text not null
    check (inviter_wallet ~ '^0x[0-9a-f]{40}$'),
  related_invite_code text
    references public.invitations(invite_code)
    on update cascade on delete restrict,
  operator_wallet text not null
    check (operator_wallet ~ '^0x[0-9a-f]{40}$'),
  operator_reason text not null
    check (length(operator_reason) between 12 and 500),
  reinstated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(restriction_id)
);

create index if not exists sybil_v2_inviter_reinstatement_events_wallet_idx
  on public.sybil_v2_inviter_reinstatement_events(network, inviter_wallet, reinstated_at desc);
create index if not exists sybil_v2_inviter_reinstatement_events_invite_idx
  on public.sybil_v2_inviter_reinstatement_events(related_invite_code);

alter table public.sybil_v2_inviter_reinstatement_events enable row level security;
revoke all on public.sybil_v2_inviter_reinstatement_events from public, anon, authenticated;
grant select, insert on public.sybil_v2_inviter_reinstatement_events to service_role;

drop trigger if exists sybil_v2_inviter_reinstatement_events_append_only
  on public.sybil_v2_inviter_reinstatement_events;
create trigger sybil_v2_inviter_reinstatement_events_append_only
before update or delete on public.sybil_v2_inviter_reinstatement_events
for each row execute function public.prevent_sybil_v2_append_only_mutation();

create or replace view public.operator_sybil_v2_active_inviter_restrictions
with (security_invoker = true)
as
select
  r.id as restriction_id,
  r.network,
  r.wallet_address as inviter_wallet,
  r.reason_codes,
  r.evidence_summary,
  r.related_invite_code,
  r.imposed_at
from public.sybil_v2_wallet_restrictions r
where r.status = 'ACTIVE'
  and r.source = 'OPERATOR'
  and (
    r.evidence_summary ->> 'restrictionScope' = 'INVITER_ONLY'
    or r.reason_codes @> '["INVITER_ESCALATION_OPERATOR_RESTRICT"]'::jsonb
  );

revoke all on public.operator_sybil_v2_active_inviter_restrictions
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_active_inviter_restrictions to service_role;

comment on view public.operator_sybil_v2_active_inviter_restrictions is
  'Service-only active inviter restrictions created by the graduated escalation operator flow. These may be reinstated explicitly by the operator without altering historical incidents or past rewards.';

create or replace function public.reinstate_sybil_v2_inviter_restriction(
  p_restriction_id uuid,
  p_reason text,
  p_operator_wallet text,
  p_network text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
  v_operator text := lower(btrim(p_operator_wallet));
  v_network text := lower(btrim(p_network));
  v_row public.sybil_v2_wallet_restrictions%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_restriction_id is null then
    raise exception 'INVALID_INVITER_RESTRICTION_ID';
  end if;
  if v_reason is null or length(v_reason) < 12 or length(v_reason) > 500 then
    raise exception 'INVITER_REINSTATE_REASON_LENGTH';
  end if;
  if v_operator !~ '^0x[0-9a-f]{40}$' then
    raise exception 'INVALID_OPERATOR_WALLET';
  end if;
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'INVALID_NETWORK';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_sybil_v2_inviter_reinstate_' || p_restriction_id::text,0)
  );

  select *
  into v_row
  from public.sybil_v2_wallet_restrictions r
  where r.id = p_restriction_id
    and r.network = v_network
  for update;

  if not found then
    raise exception 'INVITER_RESTRICTION_NOT_FOUND';
  end if;

  if v_row.status <> 'ACTIVE' then
    raise exception 'INVITER_RESTRICTION_NOT_ACTIVE';
  end if;

  if v_row.source <> 'OPERATOR'
     or not (
       v_row.evidence_summary ->> 'restrictionScope' = 'INVITER_ONLY'
       or v_row.reason_codes @> '["INVITER_ESCALATION_OPERATOR_RESTRICT"]'::jsonb
     ) then
    raise exception 'INVITER_RESTRICTION_SCOPE_MISMATCH';
  end if;

  update public.sybil_v2_wallet_restrictions
  set status = 'REINSTATED',
      resolved_at = v_now
  where id = v_row.id
    and status = 'ACTIVE';

  if not found then
    raise exception 'INVITER_RESTRICTION_STATE_CHANGED';
  end if;

  insert into public.sybil_v2_inviter_reinstatement_events(
    restriction_id,
    network,
    inviter_wallet,
    related_invite_code,
    operator_wallet,
    operator_reason,
    reinstated_at
  ) values (
    v_row.id,
    v_row.network,
    v_row.wallet_address,
    v_row.related_invite_code,
    v_operator,
    v_reason,
    v_now
  );

  return jsonb_build_object(
    'changed', true,
    'state', 'REINSTATED',
    'restrictionId', v_row.id,
    'inviterWallet', v_row.wallet_address,
    'relatedInviteCode', v_row.related_invite_code,
    'reinstatedAt', v_now,
    'pastRewardChanged', false,
    'incidentHistoryChanged', false
  );
end;
$$;

revoke all on function public.reinstate_sybil_v2_inviter_restriction(
  uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.reinstate_sybil_v2_inviter_restriction(
  uuid,text,text,text
) to service_role;

commit;
