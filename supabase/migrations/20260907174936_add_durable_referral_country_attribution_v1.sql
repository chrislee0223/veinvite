begin;

alter table public.wallet_auth_sessions
  add column if not exists country_observed_at timestamptz;

create index if not exists wallet_auth_sessions_country_observed_idx
  on public.wallet_auth_sessions (wallet_address, country_observed_at desc)
  where country_source = 'TRUSTED_EDGE' and country_observed_at is not null;

create table if not exists public.referral_acquisition_country_facts (
  id bigint generated always as identity primary key,
  relationship_id uuid not null references public.referral_relationships(id) on delete restrict,
  source_invitation_id uuid not null references public.invitations(id) on delete restrict,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  country_source text not null check (country_source = 'TRUSTED_EDGE'),
  observed_at timestamptz not null,
  attribution_policy_version text not null check (attribution_policy_version ~ '^[a-z0-9_.-]{1,80}$'),
  source_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(source_snapshot) = 'object'),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (relationship_id),
  unique (source_invitation_id)
);

comment on table public.referral_acquisition_country_facts is
  'Immutable first trusted-edge country observed for a referred wallet within 7 days after canonical referral activation. Used only as a privacy-safe country leaderboard fallback when activation country is unknown. No raw IP or locale inference.';

create index if not exists referral_acquisition_country_code_idx
  on public.referral_acquisition_country_facts (country_code, observed_at);

alter table public.referral_acquisition_country_facts enable row level security;
revoke all on table public.referral_acquisition_country_facts from public, anon, authenticated;
grant select, insert on table public.referral_acquisition_country_facts to service_role;
grant usage, select on sequence public.referral_acquisition_country_facts_id_seq to service_role;

drop trigger if exists referral_acquisition_country_facts_append_only on public.referral_acquisition_country_facts;
create trigger referral_acquisition_country_facts_append_only
before update or delete on public.referral_acquisition_country_facts
for each row execute function public.prevent_long_term_history_mutation();

create or replace function public.validate_referral_acquisition_country_fact_integrity()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $$
declare
  v_source_invitation_id uuid;
  v_relationship_effective_at timestamptz;
begin
  select r.source_invitation_id, r.relationship_effective_at
    into v_source_invitation_id, v_relationship_effective_at
  from public.referral_relationships r
  where r.id = new.relationship_id;

  if not found then
    raise exception 'referral relationship % does not exist', new.relationship_id;
  end if;

  if v_source_invitation_id is distinct from new.source_invitation_id then
    raise exception 'acquisition country fact invitation does not match referral relationship source invitation';
  end if;

  if new.country_source <> 'TRUSTED_EDGE' or new.country_code !~ '^[A-Z]{2}$' then
    raise exception 'acquisition country requires a trusted edge ISO alpha-2 country';
  end if;

  if new.observed_at < v_relationship_effective_at
     or new.observed_at > v_relationship_effective_at + interval '7 days' then
    raise exception 'acquisition country observation must be within 7 days after referral activation';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_referral_acquisition_country_fact_integrity()
  from public, anon, authenticated;
grant execute on function public.validate_referral_acquisition_country_fact_integrity()
  to postgres, service_role;

drop trigger if exists referral_acquisition_country_facts_integrity_guard
  on public.referral_acquisition_country_facts;
create trigger referral_acquisition_country_facts_integrity_guard
before insert on public.referral_acquisition_country_facts
for each row execute function public.validate_referral_acquisition_country_fact_integrity();

create or replace function public.capture_referral_acquisition_country_from_session()
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
    and new.country_observed_at >= r.relationship_effective_at
    and new.country_observed_at <= r.relationship_effective_at + interval '7 days'
  order by r.relationship_effective_at desc
  limit 1;

  if not found then
    return new;
  end if;

  if exists (
    select 1
    from public.referral_activation_country_facts f
    where f.source_invitation_id = v_relationship.source_invitation_id
      and f.country_source in ('TRUSTED_EDGE','OPERATOR_VERIFIED')
      and f.country_code ~ '^[A-Z]{2}$'
  ) then
    return new;
  end if;

  insert into public.referral_acquisition_country_facts (
    relationship_id, source_invitation_id, country_code, country_source,
    observed_at, attribution_policy_version, source_snapshot
  ) values (
    v_relationship.id, v_relationship.source_invitation_id, new.country_code,
    'TRUSTED_EDGE', new.country_observed_at, 'trusted-edge-first-7d-v1',
    jsonb_build_object(
      'capture','wallet_auth_session',
      'observationTimeBasis','COUNTRY_OBSERVED_AT',
      'rawIpStored',false,
      'languageInferenceAllowed',false
    )
  ) on conflict (source_invitation_id) do nothing;

  return new;
end;
$$;

revoke all on function public.capture_referral_acquisition_country_from_session()
  from public, anon, authenticated;
grant execute on function public.capture_referral_acquisition_country_from_session()
  to postgres, service_role;

drop trigger if exists wallet_auth_sessions_capture_referral_acquisition_country
  on public.wallet_auth_sessions;
create trigger wallet_auth_sessions_capture_referral_acquisition_country
after insert or update of country_code,country_source,country_observed_at
on public.wallet_auth_sessions
for each row execute function public.capture_referral_acquisition_country_from_session();

insert into public.referral_acquisition_country_facts (
  relationship_id, source_invitation_id, country_code, country_source,
  observed_at, attribution_policy_version, source_snapshot
)
select
  r.id, r.source_invitation_id, obs.country_code, 'TRUSTED_EDGE',
  obs.trusted_observed_at, 'trusted-edge-first-7d-v1',
  jsonb_build_object(
    'capture','wallet_auth_session_backfill',
    'observationTimeBasis',obs.observation_time_basis,
    'rawIpStored',false,
    'languageInferenceAllowed',false
  )
from public.referral_relationships r
join lateral (
  select
    s.country_code,
    coalesce(s.country_observed_at, s.created_at) as trusted_observed_at,
    case when s.country_observed_at is null then 'SESSION_CREATED_AT_LEGACY' else 'COUNTRY_OBSERVED_AT' end as observation_time_basis
  from public.wallet_auth_sessions s
  where s.wallet_address = r.child_wallet
    and s.country_source = 'TRUSTED_EDGE'
    and s.country_code ~ '^[A-Z]{2}$'
    and coalesce(s.country_observed_at, s.created_at) >= r.relationship_effective_at
    and coalesce(s.country_observed_at, s.created_at) <= r.relationship_effective_at + interval '7 days'
  order by coalesce(s.country_observed_at, s.created_at), s.id
  limit 1
) obs on true
left join public.referral_activation_country_facts f
  on f.source_invitation_id = r.source_invitation_id
where not coalesce(
  f.country_source in ('TRUSTED_EDGE','OPERATOR_VERIFIED')
  and f.country_code ~ '^[A-Z]{2}$',
  false
)
on conflict (source_invitation_id) do nothing;

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
  if v_network not in ('mainnet','testnet','testnet-staging') then raise exception 'unsupported network'; end if;
  if p_current_round_id is null or p_current_round_id < 1 then raise exception 'invalid current round'; end if;

  with mission_completion as (
    select
      i.id as invitation_id,
      i.invite_code,
      q.resolved_entry_class as entry_class,
      case
        when f.country_source in ('TRUSTED_EDGE','OPERATOR_VERIFIED') and f.country_code ~ '^[A-Z]{2}$' then f.country_code
        when a.country_source = 'TRUSTED_EDGE' and a.country_code ~ '^[A-Z]{2}$' then a.country_code
        else null
      end as country_code,
      dapp.dapp_completion_block,
      vot3.vot3_completion_block,
      vote.vote_completion_block,
      vote.vote_round_id,
      greatest(dapp.dapp_completion_block,vot3.vot3_completion_block,vote.vote_completion_block) as completion_block
    from public.invitations i
    join public.qualified_referral_relationships q on q.source_invitation_id = i.id
    join lateral (
      select max(first_reward_block)::bigint as dapp_completion_block
      from (
        select e.app_id, min(e.block_number)::bigint as first_reward_block
        from public.invite_impact_events e
        where e.invite_code = i.invite_code and e.network = v_network and e.event_type = 'DAPP_REWARD'
          and e.app_id is not null and e.block_number is not null
        group by e.app_id
        order by min(e.block_number), e.app_id
        limit 3
      ) first_three_apps
      having count(*) = 3
    ) dapp on true
    join lateral (
      select min(e.block_number)::bigint as vot3_completion_block
      from public.invite_impact_events e
      where e.invite_code = i.invite_code and e.network = v_network and e.event_type = 'VOT3_CONVERSION' and e.block_number is not null
      having count(*) > 0
    ) vot3 on true
    join lateral (
      select e.block_number::bigint as vote_completion_block, e.vote_round_id
      from public.invite_impact_events e
      where e.invite_code = i.invite_code and e.network = v_network and e.event_type = 'ALLOCATION_VOTE' and e.block_number is not null
      order by e.block_number, e.tx_index nulls last, e.clause_index nulls last
      limit 1
    ) vote on true
    left join public.referral_activation_country_facts f on f.source_invitation_id = i.id
    left join public.referral_acquisition_country_facts a on a.source_invitation_id = i.id
    where i.activation_network = v_network
      and i.status = 'COMPLETED'
      and i.reward_status in ('ELIGIBLE','PAID')
      and i.reward_eligible_at is not null
      and i.sybil_status = 'CLEAR'
      and i.impact_sync_complete_at is not null
      and i.invitee_wallet is not null
      and q.resolved_network = v_network
      and q.resolved_entry_class in ('NEW','RETURNING')
      and i.identity_link_status in ('NO_KNOWN_LINK','OPERATOR_CLEARED')
      and i.identity_link_checked_at is not null
      and public.security_identity_reward_gate_passes(i.identity_link_status,i.identity_link_checked_at,i.vote_completed_at,i.identity_link_policy_version,i.identity_link_evidence)
  ),
  qualified as (
    select m.*,
      coalesce(
        (select s.round_id from public.operator_round_growth_report_snapshots s
         where s.network = v_network and s.round_start_block is not null and s.round_end_block is not null
           and m.completion_block between s.round_start_block and s.round_end_block
         order by s.version desc, s.created_at desc limit 1),
        case
          when m.completion_block = m.vote_completion_block and m.vote_round_id is not null then m.vote_round_id
          when m.completion_block > coalesce((select max(s2.round_end_block) from public.operator_round_growth_report_snapshots s2 where s2.network = v_network and s2.round_end_block is not null),0)
            then p_current_round_id
          else null
        end
      ) as completion_round_id
    from mission_completion m
  ),
  country_totals as (
    select q.country_code,
      count(*)::bigint as completed_referrals,
      count(*) filter (where q.entry_class = 'NEW')::bigint as new_users,
      count(*) filter (where q.entry_class = 'RETURNING')::bigint as returning_users,
      count(*) filter (where q.completion_round_id = p_current_round_id)::bigint as current_round_completed
    from qualified q
    where q.country_code is not null
    group by q.country_code
  ),
  ranked as (
    select rank() over (order by c.completed_referrals desc) as rank_position,
      c.country_code,c.completed_referrals,c.new_users,c.returning_users,c.current_round_completed
    from country_totals c
  ),
  limited as (
    select * from ranked order by rank_position, country_code limit v_limit
  )
  select jsonb_build_object(
    'knownCompleted',(select count(*) from qualified where country_code is not null),
    'unknownCompleted',(select count(*) from qualified where country_code is null),
    'leaders',coalesce((select jsonb_agg(jsonb_build_object(
      'rank',l.rank_position,'countryCode',l.country_code,'completedReferrals',l.completed_referrals,
      'newUsers',l.new_users,'returningUsers',l.returning_users,'currentRoundCompleted',l.current_round_completed
    ) order by l.rank_position,l.country_code) from limited l),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_public_country_leaderboard(text,bigint,integer) from public, anon, authenticated;
grant execute on function public.get_public_country_leaderboard(text,bigint,integer) to postgres, service_role;

comment on function public.get_public_country_leaderboard(text,bigint,integer) is
  'Public aggregate country ranking for fully completed, verified VeInvite referrals. Prefers trusted activation country and otherwise uses the first trusted-edge country observed within 7 days after activation. Never infers country from language and never exposes wallet-to-country mappings or raw IP data.';

commit;
