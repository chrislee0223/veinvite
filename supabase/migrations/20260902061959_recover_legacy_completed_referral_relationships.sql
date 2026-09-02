alter table public.referral_relationships
  add column relationship_time_source text not null default 'ACTIVATED_AT';

alter table public.referral_relationships
  add constraint referral_relationships_time_source_check
  check (relationship_time_source = any (array['ACTIVATED_AT'::text, 'LEGACY_BOUNDED_CHECKPOINT'::text, 'MANUAL_RECOVERY'::text]));

alter table public.referral_relationships
  drop constraint referral_relationships_source_kind_check;

alter table public.referral_relationships
  add constraint referral_relationships_source_kind_check
  check (source_kind = any (array['legacy_backfill_v1'::text, 'legacy_completed_v0'::text, 'live_v1'::text, 'manual_recovery'::text]));

comment on column public.referral_relationships.relationship_time_source is
'Provenance of relationship_effective_at. ACTIVATED_AT is exact from the modern invitation flow; LEGACY_BOUNDED_CHECKPOINT is a defensible historical checkpoint for pre-capture completed invitations, not an exact acceptance timestamp.';

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
  source_snapshot,
  relationship_time_source
)
select
  lower(btrim(i.inviter_wallet)),
  lower(btrim(i.invitee_wallet)),
  i.id,
  i.invite_code,
  l.entry_block_at,
  l.checked_block,
  l.network,
  'legacy_completed_v0',
  'legacy_completed_v0',
  null,
  l.entry_class,
  i.created_at,
  jsonb_build_object(
    'legacy_relationship_recovery', true,
    'exact_activation_time_known', false,
    'original_status', i.status,
    'original_created_at', i.created_at,
    'original_updated_at', i.updated_at,
    'original_activated_at', i.activated_at,
    'original_activation_block', i.activation_block,
    'relationship_time_source', 'LEGACY_BOUNDED_CHECKPOINT',
    'bounded_checkpoint_at', l.entry_block_at,
    'bounded_checkpoint_block', l.checked_block,
    'classification_status', l.classification_status,
    'entry_class', l.entry_class,
    'classification_rule_version', l.rule_version,
    'entry_block_source', l.entry_block_source,
    'network', l.network,
    'legacy_backfill_recorded_at', l.recorded_at,
    'recovered_at', now()
  ),
  'LEGACY_BOUNDED_CHECKPOINT'
from public.invitations i
join lateral (
  select lb.*
  from public.legacy_entry_classification_backfill lb
  where lb.invitation_id = i.id
    and lb.classification_status = 'VERIFIED'
    and lb.entry_block_at is not null
    and lb.checked_block is not null
    and lb.network is not null
  order by lb.recorded_at desc, lb.id desc
  limit 1
) l on true
where i.status = 'COMPLETED'
  and i.invitee_wallet is not null
  and i.activated_at is null
on conflict (source_invitation_id) do nothing;

alter table public.referral_network_snapshots
  add column legacy_surrogate_count integer not null default 0;

alter table public.referral_network_snapshots
  add constraint referral_network_snapshots_legacy_surrogate_nonnegative_check
  check (legacy_surrogate_count >= 0);

create or replace function public.capture_referral_network_snapshot(p_snapshot_type text default 'INTEGRITY'::text)
returns bigint
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
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
    v_legacy_surrogate_count integer;
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
           count(*) filter (where relationship_time_source = 'LEGACY_BOUNDED_CHECKPOINT')::integer,
           md5(coalesce(string_agg(
               lower(parent_wallet) || '>' || lower(child_wallet)
               || '@' || source_invitation_id::text
               || '#' || coalesce(source_invite_code, '')
               || '#' || relationship_effective_at::text
               || '#' || coalesce(relationship_effective_block::text, '')
               || '#' || coalesce(network, '')
               || '#' || rule_version
               || '#' || relationship_time_source,
               '|' order by lower(parent_wallet), lower(child_wallet), source_invitation_id::text
           ), ''))
      into v_relationship_count,
           v_unique_parent_count,
           v_unique_child_count,
           v_missing_network_count,
           v_missing_activation_block_count,
           v_legacy_surrogate_count,
           v_fingerprint
    from public.referral_relationships;

    with expected as (
        select i.id,
               lower(btrim(i.inviter_wallet)) as parent_wallet,
               lower(btrim(i.invitee_wallet)) as child_wallet,
               i.invite_code,
               case when i.activated_at is not null then i.activated_at else lb.entry_block_at end as expected_at,
               case when i.activated_at is not null then i.activation_block else lb.checked_block end as expected_block,
               case when i.activated_at is not null then coalesce(i.activation_network, e.network) else lb.network end as expected_network,
               case when i.activated_at is not null then 'ACTIVATED_AT'::text else 'LEGACY_BOUNDED_CHECKPOINT'::text end as expected_time_source
        from public.invitations i
        left join lateral (
            select ee.network
            from public.eligibility_check_events ee
            where (i.eligibility_check_id is not null and ee.id = i.eligibility_check_id)
               or (i.eligibility_check_id is null and ee.invite_code = i.invite_code)
            order by case when i.eligibility_check_id is not null and ee.id = i.eligibility_check_id then 0 else 1 end,
                     ee.created_at desc,
                     ee.id desc
            limit 1
        ) e on true
        left join lateral (
            select lbb.entry_block_at, lbb.checked_block, lbb.network, lbb.id
            from public.legacy_entry_classification_backfill lbb
            where lbb.invitation_id = i.id
              and lbb.classification_status = 'VERIFIED'
              and lbb.entry_block_at is not null
              and lbb.checked_block is not null
              and lbb.network is not null
            order by lbb.recorded_at desc, lbb.id desc
            limit 1
        ) lb on true
        where i.invitee_wallet is not null
          and (
            (i.activated_at is not null and i.status in ('UNDER_REVIEW', 'ACTIVATING', 'COMPLETED'))
            or (i.status = 'COMPLETED' and i.activated_at is null and lb.id is not null)
          )
    ), metrics as (
        select count(*)::integer as qualifying_count,
               count(*) filter (
                 where not exists (
                   select 1 from public.referral_relationships r
                   where r.source_invitation_id = expected.id
                 )
               )::integer as missing_count
        from expected
    ), mismatch as (
        select count(*)::integer as mismatch_count
        from public.referral_relationships r
        join expected x on x.id = r.source_invitation_id
        where x.parent_wallet <> lower(r.parent_wallet)
           or x.child_wallet <> lower(r.child_wallet)
           or x.invite_code is distinct from r.source_invite_code
           or x.expected_at is distinct from r.relationship_effective_at
           or x.expected_block is distinct from r.relationship_effective_block
           or x.expected_network is distinct from r.network
           or x.expected_time_source is distinct from r.relationship_time_source
    )
    select metrics.qualifying_count, metrics.missing_count, mismatch.mismatch_count
      into v_qualifying_invitation_count, v_missing_ledger_count, v_source_mismatch_count
    from metrics cross join mismatch;

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
        details,
        legacy_surrogate_count
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
            'slot_policy', 'assignments_are_separate_append_only_records',
            'canonical_rule', 'modern activated relationships + verified legacy completed relationships',
            'fingerprint_version', 'v3_relationship_time_provenance',
            'source_comparison', 'wallets + invite_code + effective_at + block + network + time provenance',
            'legacy_time_policy', 'bounded checkpoint is retained as surrogate and never represented as exact activation time',
            'captured_by', 'database_integrity_function'
        ),
        v_legacy_surrogate_count
    ) returning id into v_id;

    return v_id;
end;
$function$;

revoke all on function public.capture_referral_network_snapshot(text) from public, anon, authenticated;
grant execute on function public.capture_referral_network_snapshot(text) to service_role;

select public.capture_referral_network_snapshot('INTEGRITY');