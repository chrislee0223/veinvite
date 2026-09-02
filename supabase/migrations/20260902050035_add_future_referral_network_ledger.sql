create table public.referral_relationships (
    id uuid primary key default gen_random_uuid(),
    parent_wallet text not null,
    child_wallet text not null,
    source_invitation_id uuid not null references public.invitations(id) on delete restrict,
    source_invite_code text not null,
    relationship_effective_at timestamptz not null,
    relationship_effective_block bigint,
    network text,
    rule_version text not null default 'v1_single_invite',
    source_kind text not null default 'live_v1',
    slot smallint,
    entry_class_at_activation text,
    invitation_created_at timestamptz not null,
    source_snapshot jsonb not null default '{}'::jsonb,
    recorded_at timestamptz not null default now(),
    constraint referral_relationships_parent_wallet_check check (parent_wallet ~ '^0x[0-9a-f]{40}$'),
    constraint referral_relationships_child_wallet_check check (child_wallet ~ '^0x[0-9a-f]{40}$'),
    constraint referral_relationships_different_wallets_check check (parent_wallet <> child_wallet),
    constraint referral_relationships_effective_block_check check (relationship_effective_block is null or relationship_effective_block >= 0),
    constraint referral_relationships_network_check check (network is null or network = any (array['mainnet'::text, 'testnet'::text, 'testnet-staging'::text])),
    constraint referral_relationships_rule_version_check check (length(btrim(rule_version)) > 0),
    constraint referral_relationships_source_kind_check check (source_kind = any (array['legacy_backfill_v1'::text, 'live_v1'::text, 'manual_recovery'::text])),
    constraint referral_relationships_slot_check check (slot is null or slot > 0),
    constraint referral_relationships_entry_class_check check (entry_class_at_activation is null or entry_class_at_activation = any (array['NEW'::text, 'RETURNING'::text, 'ACTIVE_EXISTING'::text])),
    constraint referral_relationships_source_invitation_key unique (source_invitation_id)
);

create unique index referral_relationships_child_unique_idx
    on public.referral_relationships (lower(child_wallet));
create unique index referral_relationships_edge_unique_idx
    on public.referral_relationships (lower(parent_wallet), lower(child_wallet));
create index referral_relationships_parent_effective_idx
    on public.referral_relationships (lower(parent_wallet), relationship_effective_at, recorded_at);
create index referral_relationships_child_effective_idx
    on public.referral_relationships (lower(child_wallet), relationship_effective_at);
create index referral_relationships_source_kind_idx
    on public.referral_relationships (source_kind, recorded_at desc);

alter table public.referral_relationships enable row level security;
revoke all on table public.referral_relationships from anon, authenticated;

comment on table public.referral_relationships is
'Append-only canonical parent-child referral relationship ledger for future multi-slot and network visualization migration. Invitation lifecycle records remain separate.';
comment on column public.referral_relationships.slot is
'Intentionally nullable in v1. Existing single-invite relationships are not assigned a future slot until the multi-slot migration.';
comment on column public.referral_relationships.rule_version is
'VeInvite referral rule version in effect when the relationship became canonical.';

create or replace function public.prevent_referral_relationship_cycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if lower(new.parent_wallet) = lower(new.child_wallet) then
        raise exception 'referral relationship cannot link a wallet to itself';
    end if;

    if exists (
        with recursive ancestors(wallet) as (
            select lower(new.parent_wallet)
            union
            select lower(r.parent_wallet)
            from public.referral_relationships r
            join ancestors a on lower(r.child_wallet) = a.wallet
        )
        select 1
        from ancestors
        where wallet = lower(new.child_wallet)
    ) then
        raise exception 'referral relationship would create a cycle';
    end if;

    return new;
end;
$$;

revoke all on function public.prevent_referral_relationship_cycle() from public, anon, authenticated;

create trigger referral_relationships_prevent_cycle
before insert on public.referral_relationships
for each row execute function public.prevent_referral_relationship_cycle();

create or replace function public.prevent_referral_relationship_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    raise exception 'referral_relationships is append-only; update/delete is not permitted';
end;
$$;

revoke all on function public.prevent_referral_relationship_mutation() from public, anon, authenticated;

create trigger referral_relationships_append_only_update
before update on public.referral_relationships
for each row execute function public.prevent_referral_relationship_mutation();

create trigger referral_relationships_append_only_delete
before delete on public.referral_relationships
for each row execute function public.prevent_referral_relationship_mutation();

create or replace function public.sync_referral_relationship_from_invitation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_entry_class text;
    v_network text;
begin
    if new.invitee_wallet is null
       or new.activated_at is null
       or new.status not in ('UNDER_REVIEW', 'ACTIVATING', 'COMPLETED') then
        return new;
    end if;

    select e.entry_class, e.network
      into v_entry_class, v_network
    from public.eligibility_check_events e
    where (new.eligibility_check_id is not null and e.id = new.eligibility_check_id)
       or (new.eligibility_check_id is null and e.invite_code = new.invite_code)
    order by case when new.eligibility_check_id is not null and e.id = new.eligibility_check_id then 0 else 1 end,
             e.created_at desc,
             e.id desc
    limit 1;

    insert into public.referral_relationships (
        parent_wallet,
        child_wallet,
        source_invitation_id,
        source_invite_code,
        relationship_effective_at,
        relationship_effective_block,
        network,
        rule_version,
        source_kind,
        slot,
        entry_class_at_activation,
        invitation_created_at,
        source_snapshot
    ) values (
        lower(btrim(new.inviter_wallet)),
        lower(btrim(new.invitee_wallet)),
        new.id,
        new.invite_code,
        new.activated_at,
        new.activation_block,
        coalesce(new.activation_network, v_network),
        'v1_single_invite',
        'live_v1',
        null,
        v_entry_class,
        new.created_at,
        jsonb_build_object(
            'status_at_recording', new.status,
            'invitation_updated_at', new.updated_at,
            'activated_at', new.activated_at,
            'activation_block', new.activation_block,
            'activation_network', new.activation_network,
            'eligibility_check_id', new.eligibility_check_id,
            'resolved_network', coalesce(new.activation_network, v_network),
            'entry_class', v_entry_class
        )
    )
    on conflict (source_invitation_id) do nothing;

    return new;
end;
$$;

revoke all on function public.sync_referral_relationship_from_invitation() from public, anon, authenticated;

create trigger invitations_sync_referral_relationship
    after insert or update of invitee_wallet, activated_at, activation_block, activation_network, eligibility_check_id, status
    on public.invitations
    for each row execute function public.sync_referral_relationship_from_invitation();

insert into public.referral_relationships (
    parent_wallet,
    child_wallet,
    source_invitation_id,
    source_invite_code,
    relationship_effective_at,
    relationship_effective_block,
    network,
    rule_version,
    source_kind,
    slot,
    entry_class_at_activation,
    invitation_created_at,
    source_snapshot
)
select
    lower(btrim(i.inviter_wallet)),
    lower(btrim(i.invitee_wallet)),
    i.id,
    i.invite_code,
    i.activated_at,
    i.activation_block,
    coalesce(i.activation_network, e.network),
    'v1_single_invite',
    'legacy_backfill_v1',
    null,
    e.entry_class,
    i.created_at,
    jsonb_build_object(
        'status_at_backfill', i.status,
        'invitation_updated_at', i.updated_at,
        'activated_at', i.activated_at,
        'activation_block', i.activation_block,
        'activation_network', i.activation_network,
        'eligibility_check_id', i.eligibility_check_id,
        'resolved_network', coalesce(i.activation_network, e.network),
        'entry_class', e.entry_class,
        'backfilled_at', now()
    )
from public.invitations i
left join lateral (
    select ee.entry_class, ee.network
    from public.eligibility_check_events ee
    where (i.eligibility_check_id is not null and ee.id = i.eligibility_check_id)
       or (i.eligibility_check_id is null and ee.invite_code = i.invite_code)
    order by case when i.eligibility_check_id is not null and ee.id = i.eligibility_check_id then 0 else 1 end,
             ee.created_at desc,
             ee.id desc
    limit 1
) e on true
where i.invitee_wallet is not null
  and i.activated_at is not null
  and i.status in ('UNDER_REVIEW', 'ACTIVATING', 'COMPLETED')
on conflict (source_invitation_id) do nothing;

create table public.referral_network_snapshots (
    id bigint generated always as identity primary key,
    snapshot_at timestamptz not null default now(),
    snapshot_type text not null,
    rule_version text not null,
    relationship_count integer not null,
    unique_parent_count integer not null,
    unique_child_count integer not null,
    qualifying_invitation_count integer not null,
    missing_ledger_count integer not null,
    source_mismatch_count integer not null,
    cycle_count integer not null,
    missing_network_count integer not null,
    missing_activation_block_count integer not null,
    relationship_fingerprint text not null,
    details jsonb not null default '{}'::jsonb,
    constraint referral_network_snapshots_type_check check (snapshot_type = any (array['BASELINE'::text, 'INTEGRITY'::text, 'MANUAL'::text])),
    constraint referral_network_snapshots_rule_check check (length(btrim(rule_version)) > 0),
    constraint referral_network_snapshots_nonnegative_check check (
        relationship_count >= 0 and unique_parent_count >= 0 and unique_child_count >= 0
        and qualifying_invitation_count >= 0 and missing_ledger_count >= 0
        and source_mismatch_count >= 0 and cycle_count >= 0
        and missing_network_count >= 0 and missing_activation_block_count >= 0
    )
);

create index referral_network_snapshots_created_idx
    on public.referral_network_snapshots (snapshot_at desc);

alter table public.referral_network_snapshots enable row level security;
revoke all on table public.referral_network_snapshots from anon, authenticated;

comment on table public.referral_network_snapshots is
'Point-in-time integrity checkpoints for the canonical referral relationship ledger.';

create or replace function public.capture_referral_network_snapshot(p_snapshot_type text default 'INTEGRITY')
returns bigint
language plpgsql
set search_path = public
as $$
declare
    v_id bigint;
    v_relationship_count integer;
    v_unique_parent_count integer;
    v_unique_child_count integer;
    v_qualifying_invitation_count integer;
    v_missing_ledger_count integer;
    v_source_mismatch_count integer;
    v_cycle_count integer;
    v_missing_network_count integer;
    v_missing_activation_block_count integer;
    v_fingerprint text;
begin
    if p_snapshot_type not in ('BASELINE', 'INTEGRITY', 'MANUAL') then
        raise exception 'invalid snapshot type: %', p_snapshot_type;
    end if;

    select count(*)::integer,
           count(distinct lower(parent_wallet))::integer,
           count(distinct lower(child_wallet))::integer,
           count(*) filter (where network is null)::integer,
           count(*) filter (where relationship_effective_block is null)::integer,
           md5(coalesce(string_agg(
               lower(parent_wallet) || '>' || lower(child_wallet) || '@' || source_invitation_id::text,
               '|' order by lower(parent_wallet), lower(child_wallet), source_invitation_id::text
           ), ''))
      into v_relationship_count,
           v_unique_parent_count,
           v_unique_child_count,
           v_missing_network_count,
           v_missing_activation_block_count,
           v_fingerprint
    from public.referral_relationships;

    select count(*)::integer
      into v_qualifying_invitation_count
    from public.invitations i
    where i.invitee_wallet is not null
      and i.activated_at is not null
      and i.status in ('UNDER_REVIEW', 'ACTIVATING', 'COMPLETED');

    select count(*)::integer
      into v_missing_ledger_count
    from public.invitations i
    where i.invitee_wallet is not null
      and i.activated_at is not null
      and i.status in ('UNDER_REVIEW', 'ACTIVATING', 'COMPLETED')
      and not exists (
          select 1 from public.referral_relationships r
          where r.source_invitation_id = i.id
      );

    select count(*)::integer
      into v_source_mismatch_count
    from public.referral_relationships r
    join public.invitations i on i.id = r.source_invitation_id
    where lower(btrim(i.inviter_wallet)) <> lower(r.parent_wallet)
       or lower(btrim(i.invitee_wallet)) <> lower(r.child_wallet)
       or i.activated_at <> r.relationship_effective_at;

    with recursive reach(ancestor, descendant) as (
        select lower(parent_wallet), lower(child_wallet)
        from public.referral_relationships
        union
        select reach.ancestor, lower(r.child_wallet)
        from reach
        join public.referral_relationships r
          on lower(r.parent_wallet) = reach.descendant
    )
    select count(*)::integer
      into v_cycle_count
    from reach
    where ancestor = descendant;

    insert into public.referral_network_snapshots (
        snapshot_type,
        rule_version,
        relationship_count,
        unique_parent_count,
        unique_child_count,
        qualifying_invitation_count,
        missing_ledger_count,
        source_mismatch_count,
        cycle_count,
        missing_network_count,
        missing_activation_block_count,
        relationship_fingerprint,
        details
    ) values (
        p_snapshot_type,
        'v1_single_invite',
        v_relationship_count,
        v_unique_parent_count,
        v_unique_child_count,
        v_qualifying_invitation_count,
        v_missing_ledger_count,
        v_source_mismatch_count,
        v_cycle_count,
        v_missing_network_count,
        v_missing_activation_block_count,
        v_fingerprint,
        jsonb_build_object(
            'slot_policy', 'unassigned_until_multi_slot_migration',
            'canonical_rule', 'invitee_wallet + activated_at + active lifecycle status',
            'captured_by', 'database_integrity_function'
        )
    ) returning id into v_id;

    return v_id;
end;
$$;

revoke all on function public.capture_referral_network_snapshot(text) from public, anon, authenticated;
grant execute on function public.capture_referral_network_snapshot(text) to service_role;

select public.capture_referral_network_snapshot('BASELINE');
