begin;

alter table public.wallet_auth_sessions
  add column if not exists country_observed_at timestamptz;

comment on column public.wallet_auth_sessions.country_observed_at is
  'When the privacy-safe country code was actually observed from trusted edge headers. Legacy rows may be NULL. No raw IP is stored.';

create index if not exists wallet_auth_sessions_country_observed_idx
  on public.wallet_auth_sessions (wallet_address, country_observed_at desc)
  where country_source = 'TRUSTED_EDGE' and country_observed_at is not null;

create or replace function public.capture_referral_activation_context()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_country_code text;
  v_country_observed_at timestamptz;
  v_language_code text;
  v_language_source text;
  v_language_first_observed_at timestamptz;
  v_language_last_observed_at timestamptz;
begin
  select s.country_code, s.country_observed_at
    into v_country_code, v_country_observed_at
  from public.wallet_auth_sessions s
  where s.wallet_address = new.child_wallet
    and s.country_source = 'TRUSTED_EDGE'
    and s.country_code ~ '^[A-Z]{2}$'
    and s.country_observed_at is not null
    and s.country_observed_at >= new.relationship_effective_at - interval '15 minutes'
    and s.country_observed_at <= new.relationship_effective_at + interval '15 minutes'
  order by s.country_observed_at desc, s.id desc
  limit 1;

  if v_country_code is not null then
    insert into public.referral_activation_country_facts (
      relationship_id,
      source_invitation_id,
      country_code,
      country_source,
      observed_at,
      geo_policy_version,
      source_snapshot
    ) values (
      new.id,
      new.source_invitation_id,
      v_country_code,
      'TRUSTED_EDGE',
      new.relationship_effective_at,
      'wallet-auth-edge-v2',
      jsonb_build_object(
        'capture','wallet_auth_session',
        'countryObservedAt',v_country_observed_at,
        'rawIpStored',false
      )
    ) on conflict (source_invitation_id) do nothing;
  end if;

  select u.current_language, u.current_source, u.first_observed_at, u.last_observed_at
    into v_language_code, v_language_source, v_language_first_observed_at, v_language_last_observed_at
  from public.wallet_language_usage u
  where u.wallet_address = new.child_wallet
    and u.last_observed_at >= new.relationship_effective_at - interval '15 minutes'
    and u.first_observed_at <= new.relationship_effective_at + interval '15 minutes'
  limit 1;

  if v_language_code is not null then
    insert into public.referral_activation_language_facts (
      relationship_id,
      source_invitation_id,
      language_code,
      language_source,
      observed_at,
      language_policy_version,
      source_snapshot
    ) values (
      new.id,
      new.source_invitation_id,
      v_language_code,
      case v_language_source
        when 'manual_selection' then 'MANUAL_SELECTION'
        when 'wallet_preference' then 'WALLET_PREFERENCE'
        when 'local_storage' then 'LOCAL_STORAGE'
        when 'browser_auto' then 'BROWSER_AUTO'
        else 'UNKNOWN'
      end,
      greatest(new.relationship_effective_at, v_language_first_observed_at),
      'wallet-display-near-activation-v1',
      jsonb_build_object(
        'capture','wallet_language_usage',
        'firstObservedAt',v_language_first_observed_at,
        'lastObservedAt',v_language_last_observed_at
      )
    ) on conflict (source_invitation_id) do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.capture_referral_activation_country_from_session()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_relationship public.referral_relationships%rowtype;
begin
  if new.country_source <> 'TRUSTED_EDGE'
     or new.country_code !~ '^[A-Z]{2}$'
     or new.country_observed_at is null then
    return new;
  end if;

  select r.* into v_relationship
  from public.referral_relationships r
  where r.child_wallet = new.wallet_address
    and new.country_observed_at >= r.relationship_effective_at - interval '15 minutes'
    and new.country_observed_at <= r.relationship_effective_at + interval '15 minutes'
  order by r.relationship_effective_at desc
  limit 1;

  if not found then
    return new;
  end if;

  insert into public.referral_activation_country_facts (
    relationship_id,
    source_invitation_id,
    country_code,
    country_source,
    observed_at,
    geo_policy_version,
    source_snapshot
  ) values (
    v_relationship.id,
    v_relationship.source_invitation_id,
    new.country_code,
    'TRUSTED_EDGE',
    v_relationship.relationship_effective_at,
    'wallet-auth-edge-v2',
    jsonb_build_object(
      'capture','wallet_auth_session_update',
      'countryObservedAt',new.country_observed_at,
      'rawIpStored',false
    )
  ) on conflict (source_invitation_id) do nothing;

  return new;
end;
$$;

revoke all on function public.capture_referral_activation_country_from_session()
  from public, anon, authenticated;
grant execute on function public.capture_referral_activation_country_from_session()
  to postgres, service_role;

drop trigger if exists wallet_auth_sessions_capture_referral_country
  on public.wallet_auth_sessions;
create trigger wallet_auth_sessions_capture_referral_country
after update of country_code,country_source,country_observed_at
on public.wallet_auth_sessions
for each row execute function public.capture_referral_activation_country_from_session();

create or replace function public.get_public_country_leaderboard(
  p_network text,
  p_current_round_id bigint,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_network text := lower(btrim(p_network));
  v_limit integer := greatest(1, least(coalesce(p_limit,100),100));
  v_result jsonb;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;
  if p_current_round_id is null or p_current_round_id < 1 then
    raise exception 'invalid current round';
  end if;

  with qualified as (
    select
      i.id as invitation_id,
      i.invite_code,
      case
        when f.country_source in ('TRUSTED_EDGE','OPERATOR_VERIFIED')
          and f.country_code ~ '^[A-Z]{2}$'
        then f.country_code
        else null
      end as country_code,
      completion.block_number as completion_block,
      case
        when completion.event_type = 'ALLOCATION_VOTE'
          and completion.vote_round_id is not null
          then completion.vote_round_id
        else coalesce(
          (
            select s.round_id
            from public.operator_round_growth_report_snapshots s
            where s.network = v_network
              and s.round_start_block is not null
              and s.round_end_block is not null
              and completion.block_number between s.round_start_block and s.round_end_block
            order by s.version desc, s.created_at desc
            limit 1
          ),
          case
            when completion.block_number > coalesce((
              select max(s2.round_end_block)
              from public.operator_round_growth_report_snapshots s2
              where s2.network = v_network
                and s2.round_end_block is not null
            ),0)
            then p_current_round_id
            else null
          end
        )
      end as completion_round_id
    from public.invitations i
    join lateral (
      select
        e.event_type,
        e.block_number,
        e.vote_round_id
      from public.invite_impact_events e
      where e.invite_code = i.invite_code
        and e.network = v_network
        and e.event_type in ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
        and e.block_number is not null
      order by e.block_number desc, e.tx_index desc nulls last, e.clause_index desc nulls last
      limit 1
    ) completion on true
    left join public.referral_activation_country_facts f
      on f.source_invitation_id = i.id
    where i.activation_network = v_network
      and i.status = 'COMPLETED'
      and i.reward_status in ('ELIGIBLE','PAID')
      and i.reward_eligible_at is not null
      and i.sybil_status = 'CLEAR'
      and i.impact_sync_complete_at is not null
      and i.invitee_wallet is not null
      and i.identity_link_status in ('NO_KNOWN_LINK','OPERATOR_CLEARED')
      and i.identity_link_checked_at is not null
      and public.security_identity_reward_gate_passes(
        i.identity_link_status,
        i.identity_link_checked_at,
        i.vote_completed_at,
        i.identity_link_policy_version,
        i.identity_link_evidence
      )
  ),
  country_totals as (
    select
      q.country_code,
      count(*)::bigint as completed_referrals,
      count(*) filter (
        where q.completion_round_id = p_current_round_id
      )::bigint as current_round_completed
    from qualified q
    where q.country_code is not null
    group by q.country_code
  ),
  ranked as (
    select
      rank() over (order by c.completed_referrals desc) as rank_position,
      c.country_code,
      c.completed_referrals,
      c.current_round_completed
    from country_totals c
  ),
  limited as (
    select *
    from ranked
    order by rank_position, country_code
    limit v_limit
  )
  select jsonb_build_object(
    'knownCompleted', (select count(*) from qualified where country_code is not null),
    'unknownCompleted', (select count(*) from qualified where country_code is null),
    'leaders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'rank', l.rank_position,
          'countryCode', l.country_code,
          'completedReferrals', l.completed_referrals,
          'currentRoundCompleted', l.current_round_completed
        ) order by l.rank_position, l.country_code
      )
      from limited l
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_public_country_leaderboard(text,bigint,integer)
  from public, anon, authenticated;
grant execute on function public.get_public_country_leaderboard(text,bigint,integer)
  to postgres, service_role;

comment on function public.get_public_country_leaderboard(text,bigint,integer) is
  'Public aggregate country ranking for fully completed, verified VeInvite referrals. Uses only coarse activation country; never exposes wallet-to-country mappings or raw IP data.';

commit;