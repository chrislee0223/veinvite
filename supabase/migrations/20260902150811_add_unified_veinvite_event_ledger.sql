create table public.veinvite_event_ledger (
  id bigint generated always as identity primary key,
  event_type text not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  source_table text not null,
  source_pk text not null,
  source_operation text,
  source_kind text not null default 'LIVE',
  invitation_id uuid,
  invite_code text,
  wallet_address text,
  counterparty_wallet text,
  network text,
  round_id bigint,
  block_number bigint,
  tx_id text,
  source_event_key text,
  payload jsonb not null default '{}'::jsonb,
  constraint veinvite_event_ledger_event_type_check check (length(btrim(event_type)) > 0),
  constraint veinvite_event_ledger_source_table_check check (length(btrim(source_table)) > 0),
  constraint veinvite_event_ledger_source_pk_check check (length(btrim(source_pk)) > 0),
  constraint veinvite_event_ledger_source_kind_check check (source_kind in ('LIVE', 'BACKFILL')),
  constraint veinvite_event_ledger_wallet_check check (wallet_address is null or lower(wallet_address) ~ '^0x[0-9a-f]{40}$'),
  constraint veinvite_event_ledger_counterparty_check check (counterparty_wallet is null or lower(counterparty_wallet) ~ '^0x[0-9a-f]{40}$'),
  constraint veinvite_event_ledger_round_check check (round_id is null or round_id >= 0),
  constraint veinvite_event_ledger_block_check check (block_number is null or block_number >= 0),
  constraint veinvite_event_ledger_payload_object_check check (jsonb_typeof(payload) = 'object')
);

create index veinvite_event_ledger_occurred_idx on public.veinvite_event_ledger (occurred_at desc, id desc);
create index veinvite_event_ledger_invitation_idx on public.veinvite_event_ledger (invitation_id, occurred_at, id) where invitation_id is not null;
create index veinvite_event_ledger_invite_code_idx on public.veinvite_event_ledger (invite_code, occurred_at, id) where invite_code is not null;
create index veinvite_event_ledger_wallet_idx on public.veinvite_event_ledger (lower(wallet_address), occurred_at, id) where wallet_address is not null;
create index veinvite_event_ledger_event_type_idx on public.veinvite_event_ledger (event_type, occurred_at desc, id desc);
create index veinvite_event_ledger_source_idx on public.veinvite_event_ledger (source_table, source_pk, recorded_at, id);
create unique index veinvite_event_ledger_source_event_key_unique_idx on public.veinvite_event_ledger (source_event_key) where source_event_key is not null;

alter table public.veinvite_event_ledger enable row level security;
revoke all on table public.veinvite_event_ledger from public, anon, authenticated, service_role;
revoke all on sequence public.veinvite_event_ledger_id_seq from public, anon, authenticated, service_role;
grant select on table public.veinvite_event_ledger to service_role;

comment on table public.veinvite_event_ledger is 'Append-only unified authoritative VeInvite event ledger. It preserves confirmed server/database events for future analytics, reward models and referral-network reconstruction without deciding those future policies today.';
comment on column public.veinvite_event_ledger.source_kind is 'LIVE means observed after this ledger was installed. BACKFILL means reconstructed from an existing durable source and must not be treated as originally observed telemetry.';
comment on column public.veinvite_event_ledger.payload is 'Event-specific non-secret context only. Authentication tokens, IP addresses and device fingerprints must never be copied here.';

create or replace function public.prevent_veinvite_event_ledger_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  raise exception 'veinvite_event_ledger is append-only; update/delete is not permitted';
end;
$$;
revoke all on function public.prevent_veinvite_event_ledger_mutation() from public, anon, authenticated, service_role;
create trigger veinvite_event_ledger_append_only_update before update on public.veinvite_event_ledger for each row execute function public.prevent_veinvite_event_ledger_mutation();
create trigger veinvite_event_ledger_append_only_delete before delete on public.veinvite_event_ledger for each row execute function public.prevent_veinvite_event_ledger_mutation();

create or replace function public.append_veinvite_event(
  p_event_type text,
  p_occurred_at timestamptz,
  p_source_table text,
  p_source_pk text,
  p_source_operation text default null,
  p_source_kind text default 'LIVE',
  p_invitation_id uuid default null,
  p_invite_code text default null,
  p_wallet_address text default null,
  p_counterparty_wallet text default null,
  p_network text default null,
  p_round_id bigint default null,
  p_block_number bigint default null,
  p_tx_id text default null,
  p_source_event_key text default null,
  p_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_id bigint;
begin
  insert into public.veinvite_event_ledger (
    event_type, occurred_at, source_table, source_pk, source_operation,
    source_kind, invitation_id, invite_code, wallet_address,
    counterparty_wallet, network, round_id, block_number, tx_id,
    source_event_key, payload
  ) values (
    upper(btrim(p_event_type)), coalesce(p_occurred_at, clock_timestamp()), p_source_table,
    p_source_pk, p_source_operation, p_source_kind, p_invitation_id, p_invite_code,
    case when p_wallet_address is null then null else lower(btrim(p_wallet_address)) end,
    case when p_counterparty_wallet is null then null else lower(btrim(p_counterparty_wallet)) end,
    p_network, p_round_id, p_block_number, p_tx_id, p_source_event_key,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (source_event_key) where source_event_key is not null do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.append_veinvite_event(text,timestamptz,text,text,text,text,uuid,text,text,text,text,bigint,bigint,text,text,jsonb) from public, anon, authenticated, service_role;

create or replace function public.capture_invitation_events_for_ledger()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  if tg_op = 'INSERT' then
    perform public.append_veinvite_event('INVITE_CREATED', new.created_at, 'invitations', new.id::text, 'INSERT', 'LIVE', new.id, new.invite_code, new.inviter_wallet, new.invitee_wallet, new.activation_network, null, new.activation_block, null, 'live:invitations:' || new.id::text || ':created', jsonb_build_object('status', new.status));
    return new;
  end if;

  if new.invitee_wallet is distinct from old.invitee_wallet and new.invitee_wallet is not null then
    perform public.append_veinvite_event('INVITE_BOUND_TO_WALLET', coalesce(new.activated_at, new.updated_at, clock_timestamp()), 'invitations', new.id::text, 'UPDATE', 'LIVE', new.id, new.invite_code, new.inviter_wallet, new.invitee_wallet, new.activation_network, null, new.activation_block, null, null, jsonb_build_object('previous_invitee_wallet', old.invitee_wallet, 'status', new.status));
  end if;
  if new.activated_at is distinct from old.activated_at and new.activated_at is not null then
    perform public.append_veinvite_event('INVITE_ACTIVATED', new.activated_at, 'invitations', new.id::text, 'UPDATE', 'LIVE', new.id, new.invite_code, new.inviter_wallet, new.invitee_wallet, new.activation_network, null, new.activation_block, null, null, jsonb_build_object('status', new.status));
  end if;
  if new.status is distinct from old.status then
    perform public.append_veinvite_event('INVITE_STATUS_CHANGED', coalesce(new.updated_at, clock_timestamp()), 'invitations', new.id::text, 'UPDATE', 'LIVE', new.id, new.invite_code, new.inviter_wallet, new.invitee_wallet, new.activation_network, null, new.activation_block, null, null, jsonb_build_object('old_status', old.status, 'new_status', new.status));
  end if;
  if coalesce(new.apps_completed, 0) > coalesce(old.apps_completed, 0) then
    perform public.append_veinvite_event('MISSION_DAPP_PROGRESS', coalesce(new.apps_completed_at, new.updated_at, clock_timestamp()), 'invitations', new.id::text, 'UPDATE', 'LIVE', new.id, new.invite_code, new.inviter_wallet, new.invitee_wallet, new.activation_network, null, new.apps_completed_block, null, null, jsonb_build_object('old_count', old.apps_completed, 'new_count', new.apps_completed));
  end if;
  if coalesce(new.rewards_received, 0) > coalesce(old.rewards_received, 0) then
    perform public.append_veinvite_event('MISSION_REWARD_PROGRESS', coalesce(new.updated_at, clock_timestamp()), 'invitations', new.id::text, 'UPDATE', 'LIVE', new.id, new.invite_code, new.inviter_wallet, new.invitee_wallet, new.activation_network, null, new.impact_last_synced_block, null, null, jsonb_build_object('old_count', old.rewards_received, 'new_count', new.rewards_received));
  end if;
  if coalesce(old.vot3_converted, false) = false and coalesce(new.vot3_converted, false) = true then
    perform public.append_veinvite_event('MISSION_VOT3_COMPLETED', coalesce(new.vot3_converted_at, new.updated_at, clock_timestamp()), 'invitations', new.id::text, 'UPDATE', 'LIVE', new.id, new.invite_code, new.inviter_wallet, new.invitee_wallet, new.activation_network, null, new.vot3_converted_block, new.vot3_conversion_tx_id, null, jsonb_build_object('amount_wei', new.vot3_conversion_amount_wei));
  end if;
  if coalesce(old.vote_completed, false) = false and coalesce(new.vote_completed, false) = true then
    perform public.append_veinvite_event('MISSION_VOTE_COMPLETED', coalesce(new.vote_completed_at, new.updated_at, clock_timestamp()), 'invitations', new.id::text, 'UPDATE', 'LIVE', new.id, new.invite_code, new.inviter_wallet, new.invitee_wallet, new.activation_network, new.vote_round_id, new.vote_completed_block, null, null, '{}'::jsonb);
  end if;
  if new.reward_status is distinct from old.reward_status then
    perform public.append_veinvite_event('REWARD_STATUS_CHANGED', coalesce(new.updated_at, clock_timestamp()), 'invitations', new.id::text, 'UPDATE', 'LIVE', new.id, new.invite_code, new.inviter_wallet, new.invitee_wallet, new.activation_network, new.vote_round_id, new.impact_last_synced_block, null, null, jsonb_build_object('old_status', old.reward_status, 'new_status', new.reward_status));
  end if;
  if new.reward_paid_at is distinct from old.reward_paid_at and new.reward_paid_at is not null then
    perform public.append_veinvite_event('REWARD_PAID', new.reward_paid_at, 'invitations', new.id::text, 'UPDATE', 'LIVE', new.id, new.invite_code, new.inviter_wallet, new.invitee_wallet, new.activation_network, new.vote_round_id, new.impact_last_synced_block, null, null, jsonb_build_object('reward_status', new.reward_status));
  end if;
  if new.sybil_status is distinct from old.sybil_status then
    perform public.append_veinvite_event('SYBIL_STATUS_CHANGED', coalesce(new.sybil_checked_at, new.updated_at, clock_timestamp()), 'invitations', new.id::text, 'UPDATE', 'LIVE', new.id, new.invite_code, new.inviter_wallet, new.invitee_wallet, new.activation_network, null, new.impact_last_synced_block, null, null, jsonb_build_object('old_status', old.sybil_status, 'new_status', new.sybil_status, 'risk_level', new.sybil_risk_level, 'risk_score', new.sybil_risk_score, 'source', new.sybil_source));
  end if;
  return new;
end;
$$;
revoke all on function public.capture_invitation_events_for_ledger() from public, anon, authenticated, service_role;
create trigger invitations_capture_unified_event_ledger after insert or update on public.invitations for each row execute function public.capture_invitation_events_for_ledger();

create or replace function public.capture_eligibility_event_for_ledger()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_invitation_id uuid;
begin
  select i.id into v_invitation_id from public.invitations i where i.invite_code = new.invite_code order by i.created_at desc limit 1;
  perform public.append_veinvite_event('ELIGIBILITY_CHECKED', new.created_at, 'eligibility_check_events', new.id::text, 'INSERT', 'LIVE', v_invitation_id, new.invite_code, new.wallet_address, null, new.network, null, new.checked_block, null, 'live:eligibility_check_events:' || new.id::text, jsonb_build_object('outcome', new.outcome, 'entry_class', new.entry_class, 'prior_reward_tx_id', new.prior_reward_tx_id, 'prior_vote_tx_id', new.prior_vote_tx_id, 'details', new.details));
  return new;
end;
$$;
revoke all on function public.capture_eligibility_event_for_ledger() from public, anon, authenticated, service_role;
create trigger eligibility_checks_capture_unified_event_ledger after insert on public.eligibility_check_events for each row execute function public.capture_eligibility_event_for_ledger();

create or replace function public.capture_impact_event_for_ledger()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_invitation_id uuid;
begin
  select i.id into v_invitation_id from public.invitations i where i.invite_code = new.invite_code order by i.created_at desc limit 1;
  perform public.append_veinvite_event('IMPACT_' || new.event_type, coalesce(new.block_timestamp, new.detected_at), 'invite_impact_events', new.id::text, 'INSERT', 'LIVE', v_invitation_id, new.invite_code, new.wallet_address, null, new.network, new.vote_round_id, new.block_number, new.tx_id, 'live:invite_impact_events:' || new.id::text, jsonb_build_object('event_key', new.event_key, 'app_id', new.app_id, 'amount_wei', new.amount_wei, 'tx_index', new.tx_index, 'clause_index', new.clause_index, 'detected_at', new.detected_at));
  return new;
end;
$$;
revoke all on function public.capture_impact_event_for_ledger() from public, anon, authenticated, service_role;
create trigger invite_impact_capture_unified_event_ledger after insert on public.invite_impact_events for each row execute function public.capture_impact_event_for_ledger();

create or replace function public.capture_referral_relationship_event_for_ledger()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  perform public.append_veinvite_event('REFERRAL_RELATIONSHIP_RECORDED', new.relationship_effective_at, 'referral_relationships', new.id::text, 'INSERT', case when new.source_kind like 'legacy%' then 'BACKFILL' else 'LIVE' end, new.source_invitation_id, new.source_invite_code, new.parent_wallet, new.child_wallet, new.network, null, new.relationship_effective_block, null, 'live:referral_relationships:' || new.id::text, jsonb_build_object('rule_version', new.rule_version, 'source_kind', new.source_kind, 'entry_class_at_activation', new.entry_class_at_activation, 'relationship_time_source', new.relationship_time_source));
  return new;
end;
$$;
revoke all on function public.capture_referral_relationship_event_for_ledger() from public, anon, authenticated, service_role;
create trigger referral_relationships_capture_unified_event_ledger after insert on public.referral_relationships for each row execute function public.capture_referral_relationship_event_for_ledger();

create or replace function public.capture_reward_queue_event_for_ledger()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_invitation_id uuid;
begin
  select i.id into v_invitation_id from public.invitations i where i.invite_code = new.invite_code order by i.created_at desc limit 1;
  if tg_op = 'INSERT' then
    perform public.append_veinvite_event('REWARD_QUEUED', coalesce(new.queued_at, new.created_at), 'reward_queue_entries', new.id::text, 'INSERT', 'LIVE', v_invitation_id, new.invite_code, new.recipient_wallet, null, new.network, new.assigned_round_id, null, null, 'live:reward_queue_entries:' || new.id::text || ':queued', jsonb_build_object('status', new.status, 'entry_class', new.entry_class, 'eligible_at', new.eligible_at));
    return new;
  end if;
  if new.status is distinct from old.status then
    perform public.append_veinvite_event('REWARD_QUEUE_STATUS_CHANGED', coalesce(new.updated_at, clock_timestamp()), 'reward_queue_entries', new.id::text, 'UPDATE', 'LIVE', v_invitation_id, new.invite_code, new.recipient_wallet, null, new.network, new.assigned_round_id, null, null, null, jsonb_build_object('old_status', old.status, 'new_status', new.status, 'cancel_reason', new.cancel_reason));
  end if;
  if new.claim_requested_at is distinct from old.claim_requested_at and new.claim_requested_at is not null then
    perform public.append_veinvite_event('REWARD_CLAIM_REQUESTED', new.claim_requested_at, 'reward_queue_entries', new.id::text, 'UPDATE', 'LIVE', v_invitation_id, new.invite_code, coalesce(new.claim_requested_by_wallet, new.recipient_wallet), new.recipient_wallet, new.network, new.assigned_round_id, null, null, null, jsonb_build_object('status', new.status));
  end if;
  return new;
end;
$$;
revoke all on function public.capture_reward_queue_event_for_ledger() from public, anon, authenticated, service_role;
create trigger reward_queue_capture_unified_event_ledger after insert or update on public.reward_queue_entries for each row execute function public.capture_reward_queue_event_for_ledger();

create or replace function public.capture_wallet_auth_event_for_ledger()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  if tg_op = 'INSERT' then
    perform public.append_veinvite_event('WALLET_AUTHENTICATED', new.created_at, 'wallet_auth_sessions', new.id::text, 'INSERT', 'LIVE', null, null, new.wallet_address, null, null, null, null, null, 'live:wallet_auth_sessions:' || new.id::text || ':created', jsonb_build_object('expires_at', new.expires_at));
    return new;
  end if;
  if new.revoked_at is distinct from old.revoked_at and new.revoked_at is not null then
    perform public.append_veinvite_event('WALLET_SESSION_REVOKED', new.revoked_at, 'wallet_auth_sessions', new.id::text, 'UPDATE', 'LIVE', null, null, new.wallet_address, null, null, null, null, null, null, '{}'::jsonb);
  end if;
  return new;
end;
$$;
revoke all on function public.capture_wallet_auth_event_for_ledger() from public, anon, authenticated, service_role;
create trigger wallet_auth_sessions_capture_unified_event_ledger after insert or update of revoked_at on public.wallet_auth_sessions for each row execute function public.capture_wallet_auth_event_for_ledger();

insert into public.veinvite_event_ledger (event_type, occurred_at, source_table, source_pk, source_operation, source_kind, invitation_id, invite_code, wallet_address, counterparty_wallet, network, round_id, block_number, tx_id, source_event_key, payload)
select 'INVITE_CREATED', i.created_at, 'invitations', i.id::text, 'INSERT', 'BACKFILL', i.id, i.invite_code, lower(i.inviter_wallet), lower(i.invitee_wallet), i.activation_network, null, i.activation_block, null, 'backfill:invitations:' || i.id::text || ':created', jsonb_build_object('status_at_backfill', i.status) from public.invitations i on conflict (source_event_key) where source_event_key is not null do nothing;

insert into public.veinvite_event_ledger (event_type, occurred_at, source_table, source_pk, source_operation, source_kind, invitation_id, invite_code, wallet_address, counterparty_wallet, network, round_id, block_number, tx_id, source_event_key, payload)
select 'INVITE_ACTIVATED', i.activated_at, 'invitations', i.id::text, 'UPDATE', 'BACKFILL', i.id, i.invite_code, lower(i.inviter_wallet), lower(i.invitee_wallet), i.activation_network, null, i.activation_block, null, 'backfill:invitations:' || i.id::text || ':activated', jsonb_build_object('status_at_backfill', i.status) from public.invitations i where i.activated_at is not null and i.invitee_wallet is not null on conflict (source_event_key) where source_event_key is not null do nothing;

insert into public.veinvite_event_ledger (event_type, occurred_at, source_table, source_pk, source_operation, source_kind, invitation_id, invite_code, wallet_address, counterparty_wallet, network, round_id, block_number, tx_id, source_event_key, payload)
select 'INVITE_STATUS_CHANGED', a.recorded_at, 'invitation_lifecycle_audit_log', a.id::text, 'UPDATE', 'BACKFILL', a.invitation_id, a.invite_code, lower(a.inviter_wallet), lower(a.invitee_wallet), null, null, null, null, 'backfill:invitation_lifecycle_audit_log:' || a.id::text || ':status', jsonb_build_object('old_status', a.old_status, 'new_status', a.new_status) from public.invitation_lifecycle_audit_log a where a.operation = 'UPDATE' and a.old_status is distinct from a.new_status on conflict (source_event_key) where source_event_key is not null do nothing;

insert into public.veinvite_event_ledger (event_type, occurred_at, source_table, source_pk, source_operation, source_kind, invitation_id, invite_code, wallet_address, counterparty_wallet, network, round_id, block_number, tx_id, source_event_key, payload)
select 'ELIGIBILITY_CHECKED', e.created_at, 'eligibility_check_events', e.id::text, 'INSERT', 'BACKFILL', i.id, e.invite_code, lower(e.wallet_address), null, e.network, null, e.checked_block, null, 'backfill:eligibility_check_events:' || e.id::text, jsonb_build_object('outcome', e.outcome, 'entry_class', e.entry_class, 'prior_reward_tx_id', e.prior_reward_tx_id, 'prior_vote_tx_id', e.prior_vote_tx_id, 'details', e.details) from public.eligibility_check_events e left join public.invitations i on i.invite_code = e.invite_code on conflict (source_event_key) where source_event_key is not null do nothing;

insert into public.veinvite_event_ledger (event_type, occurred_at, source_table, source_pk, source_operation, source_kind, invitation_id, invite_code, wallet_address, counterparty_wallet, network, round_id, block_number, tx_id, source_event_key, payload)
select 'IMPACT_' || x.event_type, coalesce(x.block_timestamp, x.detected_at), 'invite_impact_events', x.id::text, 'INSERT', 'BACKFILL', i.id, x.invite_code, lower(x.wallet_address), null, x.network, x.vote_round_id, x.block_number, x.tx_id, 'backfill:invite_impact_events:' || x.id::text, jsonb_build_object('event_key', x.event_key, 'app_id', x.app_id, 'amount_wei', x.amount_wei, 'tx_index', x.tx_index, 'clause_index', x.clause_index, 'detected_at', x.detected_at) from public.invite_impact_events x left join public.invitations i on i.invite_code = x.invite_code on conflict (source_event_key) where source_event_key is not null do nothing;

insert into public.veinvite_event_ledger (event_type, occurred_at, source_table, source_pk, source_operation, source_kind, invitation_id, invite_code, wallet_address, counterparty_wallet, network, round_id, block_number, tx_id, source_event_key, payload)
select 'REFERRAL_RELATIONSHIP_RECORDED', r.relationship_effective_at, 'referral_relationships', r.id::text, 'INSERT', 'BACKFILL', r.source_invitation_id, r.source_invite_code, lower(r.parent_wallet), lower(r.child_wallet), r.network, null, r.relationship_effective_block, null, 'backfill:referral_relationships:' || r.id::text, jsonb_build_object('rule_version', r.rule_version, 'source_kind', r.source_kind, 'entry_class_at_activation', r.entry_class_at_activation, 'relationship_time_source', r.relationship_time_source) from public.referral_relationships r on conflict (source_event_key) where source_event_key is not null do nothing;

insert into public.veinvite_event_ledger (event_type, occurred_at, source_table, source_pk, source_operation, source_kind, wallet_address, source_event_key, payload)
select 'WALLET_AUTHENTICATED', s.created_at, 'wallet_auth_sessions', s.id::text, 'INSERT', 'BACKFILL', lower(s.wallet_address), 'backfill:wallet_auth_sessions:' || s.id::text || ':created', jsonb_build_object('expires_at', s.expires_at) from public.wallet_auth_sessions s on conflict (source_event_key) where source_event_key is not null do nothing;

insert into public.veinvite_event_ledger (event_type, occurred_at, source_table, source_pk, source_operation, source_kind, wallet_address, source_event_key, payload)
select 'WALLET_SESSION_REVOKED', s.revoked_at, 'wallet_auth_sessions', s.id::text, 'UPDATE', 'BACKFILL', lower(s.wallet_address), 'backfill:wallet_auth_sessions:' || s.id::text || ':revoked', '{}'::jsonb from public.wallet_auth_sessions s where s.revoked_at is not null on conflict (source_event_key) where source_event_key is not null do nothing;

insert into public.veinvite_event_ledger (event_type, occurred_at, source_table, source_pk, source_operation, source_kind, invitation_id, invite_code, wallet_address, network, round_id, source_event_key, payload)
select 'REWARD_QUEUED', coalesce(q.queued_at, q.created_at), 'reward_queue_entries', q.id::text, 'INSERT', 'BACKFILL', i.id, q.invite_code, lower(q.recipient_wallet), q.network, q.assigned_round_id, 'backfill:reward_queue_entries:' || q.id::text || ':queued', jsonb_build_object('status_at_backfill', q.status, 'entry_class', q.entry_class, 'eligible_at', q.eligible_at) from public.reward_queue_entries q left join public.invitations i on i.invite_code = q.invite_code on conflict (source_event_key) where source_event_key is not null do nothing;

insert into public.veinvite_event_ledger (event_type, occurred_at, source_table, source_pk, source_operation, source_kind, invitation_id, invite_code, wallet_address, counterparty_wallet, network, round_id, source_event_key, payload)
select 'REWARD_CLAIM_REQUESTED', q.claim_requested_at, 'reward_queue_entries', q.id::text, 'UPDATE', 'BACKFILL', i.id, q.invite_code, lower(coalesce(q.claim_requested_by_wallet, q.recipient_wallet)), lower(q.recipient_wallet), q.network, q.assigned_round_id, 'backfill:reward_queue_entries:' || q.id::text || ':claim_requested', jsonb_build_object('status_at_backfill', q.status) from public.reward_queue_entries q left join public.invitations i on i.invite_code = q.invite_code where q.claim_requested_at is not null on conflict (source_event_key) where source_event_key is not null do nothing;

insert into public.veinvite_event_ledger (event_type, occurred_at, source_table, source_pk, source_operation, source_kind, invitation_id, invite_code, wallet_address, counterparty_wallet, network, round_id, block_number, tx_id, source_event_key, payload)
select 'MISSION_DAPP_THRESHOLD_REACHED', i.apps_completed_at, 'invitations', i.id::text, 'UPDATE', 'BACKFILL', i.id, i.invite_code, lower(i.inviter_wallet), lower(i.invitee_wallet), i.activation_network, null, i.apps_completed_block, null, 'backfill:invitations:' || i.id::text || ':dapp_threshold', jsonb_build_object('apps_completed', i.apps_completed) from public.invitations i where i.apps_completed_at is not null on conflict (source_event_key) where source_event_key is not null do nothing;

insert into public.veinvite_event_ledger (event_type, occurred_at, source_table, source_pk, source_operation, source_kind, invitation_id, invite_code, wallet_address, counterparty_wallet, network, round_id, block_number, tx_id, source_event_key, payload)
select 'MISSION_VOT3_COMPLETED', i.vot3_converted_at, 'invitations', i.id::text, 'UPDATE', 'BACKFILL', i.id, i.invite_code, lower(i.inviter_wallet), lower(i.invitee_wallet), i.activation_network, null, i.vot3_converted_block, i.vot3_conversion_tx_id, 'backfill:invitations:' || i.id::text || ':vot3', jsonb_build_object('amount_wei', i.vot3_conversion_amount_wei) from public.invitations i where i.vot3_converted_at is not null on conflict (source_event_key) where source_event_key is not null do nothing;

insert into public.veinvite_event_ledger (event_type, occurred_at, source_table, source_pk, source_operation, source_kind, invitation_id, invite_code, wallet_address, counterparty_wallet, network, round_id, block_number, source_event_key, payload)
select 'MISSION_VOTE_COMPLETED', i.vote_completed_at, 'invitations', i.id::text, 'UPDATE', 'BACKFILL', i.id, i.invite_code, lower(i.inviter_wallet), lower(i.invitee_wallet), i.activation_network, i.vote_round_id, i.vote_completed_block, 'backfill:invitations:' || i.id::text || ':vote', '{}'::jsonb from public.invitations i where i.vote_completed_at is not null on conflict (source_event_key) where source_event_key is not null do nothing;

insert into public.veinvite_event_ledger (event_type, occurred_at, source_table, source_pk, source_operation, source_kind, invitation_id, invite_code, wallet_address, counterparty_wallet, network, round_id, source_event_key, payload)
select 'REWARD_BECAME_ELIGIBLE', i.reward_eligible_at, 'invitations', i.id::text, 'UPDATE', 'BACKFILL', i.id, i.invite_code, lower(i.inviter_wallet), lower(i.invitee_wallet), i.activation_network, i.vote_round_id, 'backfill:invitations:' || i.id::text || ':reward_eligible', jsonb_build_object('reward_status_at_backfill', i.reward_status) from public.invitations i where i.reward_eligible_at is not null on conflict (source_event_key) where source_event_key is not null do nothing;

insert into public.veinvite_event_ledger (event_type, occurred_at, source_table, source_pk, source_operation, source_kind, invitation_id, invite_code, wallet_address, counterparty_wallet, network, round_id, source_event_key, payload)
select 'REWARD_PAID', i.reward_paid_at, 'invitations', i.id::text, 'UPDATE', 'BACKFILL', i.id, i.invite_code, lower(i.inviter_wallet), lower(i.invitee_wallet), i.activation_network, i.vote_round_id, 'backfill:invitations:' || i.id::text || ':reward_paid', jsonb_build_object('reward_status_at_backfill', i.reward_status) from public.invitations i where i.reward_paid_at is not null on conflict (source_event_key) where source_event_key is not null do nothing;
