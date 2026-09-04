-- Keep current-era integrity diagnostics from treating verified legacy rows as
-- live data defects, make accepted-wallet language reporting directly
-- queryable, and cover the reward reservation quote foreign key.
--
-- Applied to Preview first, then Production. This migration does not transfer
-- B3TR and does not change reward eligibility or payout state.

create index if not exists reward_queue_entries_reservation_quote_snapshot_id_idx
  on public.reward_queue_entries (reservation_quote_snapshot_id)
  where reservation_quote_snapshot_id is not null;

create or replace view public.operator_global_data_quality as
with cutoff as (
  select timestamptz '2026-08-23 09:05:00+00' as entry_proof_enforced_at
)
select
  count(*) filter (
    where i.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
      and i.invitee_wallet is not null
      and coalesce(i.activated_at, i.created_at) >= c.entry_proof_enforced_at
      and i.activation_network is null
  ) as active_or_completed_invites_without_network,
  count(*) filter (
    where i.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
      and i.invitee_wallet is not null
      and coalesce(i.activated_at, i.created_at) >= c.entry_proof_enforced_at
      and i.eligibility_check_id is null
  ) as active_or_completed_invites_without_entry_check,
  count(*) filter (
    where i.reward_status = 'PAID'
      and i.reward_paid_at is null
  ) as paid_invites_without_paid_at,
  (
    count(*) filter (
      where i.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
        and i.invitee_wallet is not null
        and coalesce(i.activated_at, i.created_at) >= c.entry_proof_enforced_at
        and i.activation_network is null
    ) = 0
    and count(*) filter (
      where i.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
        and i.invitee_wallet is not null
        and coalesce(i.activated_at, i.created_at) >= c.entry_proof_enforced_at
        and i.eligibility_check_id is null
    ) = 0
    and count(*) filter (
      where i.reward_status = 'PAID'
        and i.reward_paid_at is null
    ) = 0
  ) as is_clean
from public.invitations i
cross join cutoff c;

revoke all on public.operator_global_data_quality from public, anon, authenticated;
grant select on public.operator_global_data_quality to service_role;

comment on view public.operator_global_data_quality is
  'Current-era global integrity surface. Legacy pre-entry-proof rows are excluded from the clean verdict and remain visible through operator_release_health.';

create or replace view public.operator_accepted_wallet_languages
with (security_invoker = true) as
with latest_legacy as (
  select distinct on (invitation_id)
    invitation_id,
    entry_class,
    outcome
  from public.legacy_entry_classification_backfill
  where classification_status = 'VERIFIED'
  order by invitation_id, recorded_at desc, id desc
), accepted as (
  select
    i.id as invitation_id,
    lower(btrim(i.invitee_wallet)) as wallet_address,
    coalesce(e.entry_class, l.entry_class) as entry_class,
    case
      when i.eligibility_check_id is not null
        and e.outcome = 'ELIGIBLE'
        and e.entry_class in ('NEW','RETURNING')
        then 'MODERN'
      when i.eligibility_check_id is null
        and i.invitee_wallet is not null
        and l.outcome = 'ELIGIBLE'
        and l.entry_class in ('NEW','RETURNING')
        then 'LEGACY'
      else null
    end as acceptance_kind
  from public.invitations i
  left join public.eligibility_check_events e
    on e.id = i.eligibility_check_id
  left join latest_legacy l
    on l.invitation_id = i.id
  where i.invitee_wallet is not null
    and not exists (
      select 1
      from public.analytics_excluded_wallets x
      where x.active
        and (
          x.wallet_address = lower(btrim(i.inviter_wallet))
          or x.wallet_address = lower(btrim(i.invitee_wallet))
        )
    )
)
select
  a.invitation_id,
  a.wallet_address,
  a.entry_class,
  a.acceptance_kind,
  coalesce(u.current_language, p.language) as display_language,
  coalesce(
    u.current_source,
    case when p.language is not null then 'wallet_preference' end
  ) as display_language_source,
  p.language as saved_preference_language,
  (p.language is not null) as has_saved_preference,
  u.first_observed_at,
  u.last_observed_at,
  p.updated_at as preference_updated_at
from accepted a
left join public.wallet_language_usage u
  on u.wallet_address = a.wallet_address
left join public.wallet_preferences p
  on p.wallet_address = a.wallet_address
where a.acceptance_kind is not null;

revoke all on public.operator_accepted_wallet_languages from public, anon, authenticated;
grant select on public.operator_accepted_wallet_languages to service_role;

create or replace view public.operator_accepted_language_summary
with (security_invoker = true) as
select
  entry_class,
  coalesce(display_language, 'unknown') as display_language,
  count(*)::bigint as participant_count,
  count(*) filter (where has_saved_preference)::bigint as saved_preference_count,
  count(*) filter (where display_language_source = 'browser_auto')::bigint as browser_auto_count,
  count(*) filter (where display_language_source = 'local_storage')::bigint as local_storage_count,
  count(*) filter (where display_language_source = 'wallet_preference')::bigint as wallet_preference_count,
  count(*) filter (where display_language_source = 'manual_selection')::bigint as manual_selection_count,
  count(*) filter (where display_language_source is null)::bigint as unknown_source_count
from public.operator_accepted_wallet_languages
group by entry_class, coalesce(display_language, 'unknown')
order by entry_class, participant_count desc, display_language;

revoke all on public.operator_accepted_language_summary from public, anon, authenticated;
grant select on public.operator_accepted_language_summary to service_role;
