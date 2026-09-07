begin;

alter table public.wallet_auth_sessions
  add column if not exists country_code text not null default 'UNKNOWN',
  add column if not exists country_source text not null default 'UNKNOWN';

alter table public.wallet_auth_sessions
  drop constraint if exists wallet_auth_sessions_country_code_check,
  add constraint wallet_auth_sessions_country_code_check
    check (country_code = 'UNKNOWN' or country_code ~ '^[A-Z]{2}$'),
  drop constraint if exists wallet_auth_sessions_country_source_check,
  add constraint wallet_auth_sessions_country_source_check
    check (country_source in ('TRUSTED_EDGE','UNKNOWN')),
  drop constraint if exists wallet_auth_sessions_country_consistency_check,
  add constraint wallet_auth_sessions_country_consistency_check
    check ((country_source = 'UNKNOWN') = (country_code = 'UNKNOWN'));

comment on column public.wallet_auth_sessions.country_code is
  'Privacy-safe coarse country from trusted Vercel edge metadata at wallet authentication. UNKNOWN when unavailable; raw IP is never stored here.';
comment on column public.wallet_auth_sessions.country_source is
  'Origin of wallet-auth country metadata: TRUSTED_EDGE or UNKNOWN.';

create or replace function public.capture_referral_activation_context()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_country_code text := 'UNKNOWN';
  v_country_source text := 'UNKNOWN';
  v_country_observed_at timestamptz;
  v_language_code text;
  v_language_source text;
  v_language_first_observed_at timestamptz;
  v_language_last_observed_at timestamptz;
begin
  select s.country_code, s.country_source, s.created_at
    into v_country_code, v_country_source, v_country_observed_at
  from public.wallet_auth_sessions s
  where s.wallet_address = new.child_wallet
    and s.created_at <= new.relationship_effective_at + interval '5 minutes'
  order by s.created_at desc, s.id desc
  limit 1;

  if v_country_code is null or v_country_source is null then
    v_country_code := 'UNKNOWN';
    v_country_source := 'UNKNOWN';
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
    new.id,
    new.source_invitation_id,
    v_country_code,
    v_country_source,
    new.relationship_effective_at,
    'wallet-auth-edge-v1',
    jsonb_build_object(
      'capture','wallet_auth_session',
      'authObservedAt',v_country_observed_at,
      'rawIpStored',false
    )
  ) on conflict (source_invitation_id) do nothing;

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

revoke all on function public.capture_referral_activation_context()
  from public, anon, authenticated;
grant execute on function public.capture_referral_activation_context()
  to postgres, service_role;

drop trigger if exists referral_relationships_capture_activation_context
  on public.referral_relationships;
create trigger referral_relationships_capture_activation_context
after insert on public.referral_relationships
for each row execute function public.capture_referral_activation_context();

create or replace function public.capture_referral_activation_language_from_usage()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_relationship public.referral_relationships%rowtype;
  v_source text;
begin
  select r.* into v_relationship
  from public.referral_relationships r
  where r.child_wallet = new.wallet_address
  limit 1;

  if not found then
    return new;
  end if;

  if new.first_observed_at > v_relationship.relationship_effective_at + interval '15 minutes'
     or new.last_observed_at < v_relationship.relationship_effective_at - interval '15 minutes' then
    return new;
  end if;

  v_source := case new.current_source
    when 'manual_selection' then 'MANUAL_SELECTION'
    when 'wallet_preference' then 'WALLET_PREFERENCE'
    when 'local_storage' then 'LOCAL_STORAGE'
    when 'browser_auto' then 'BROWSER_AUTO'
    else null
  end;

  if v_source is null then
    return new;
  end if;

  insert into public.referral_activation_language_facts (
    relationship_id,
    source_invitation_id,
    language_code,
    language_source,
    observed_at,
    language_policy_version,
    source_snapshot
  ) values (
    v_relationship.id,
    v_relationship.source_invitation_id,
    new.current_language,
    v_source,
    greatest(v_relationship.relationship_effective_at, new.first_observed_at),
    'wallet-display-near-activation-v1',
    jsonb_build_object(
      'capture','wallet_language_usage_trigger',
      'firstObservedAt',new.first_observed_at,
      'lastObservedAt',new.last_observed_at
    )
  ) on conflict (source_invitation_id) do nothing;

  return new;
end;
$$;

revoke all on function public.capture_referral_activation_language_from_usage()
  from public, anon, authenticated;
grant execute on function public.capture_referral_activation_language_from_usage()
  to postgres, service_role;

drop trigger if exists wallet_language_usage_capture_referral_activation
  on public.wallet_language_usage;
create trigger wallet_language_usage_capture_referral_activation
after insert or update of current_language,current_source,last_observed_at
on public.wallet_language_usage
for each row execute function public.capture_referral_activation_language_from_usage();

commit;
