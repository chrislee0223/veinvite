begin;

create or replace function public.capture_referral_activation_context()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_country_code text;
  v_country_source text;
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
    and s.created_at >= new.relationship_effective_at - interval '15 minutes'
    and s.created_at <= new.relationship_effective_at + interval '5 minutes'
  order by s.created_at desc, s.id desc
  limit 1;

  if v_country_source = 'TRUSTED_EDGE' and v_country_code ~ '^[A-Z]{2}$' then
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
  select r.* into v_relationship
  from public.referral_relationships r
  where r.child_wallet = new.wallet_address
    and new.created_at >= r.relationship_effective_at - interval '15 minutes'
    and new.created_at <= r.relationship_effective_at + interval '5 minutes'
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
    new.country_source,
    v_relationship.relationship_effective_at,
    case when new.country_source = 'TRUSTED_EDGE'
      then 'wallet-auth-edge-v1'
      else 'wallet-auth-edge-unavailable-v1'
    end,
    jsonb_build_object(
      'capture','wallet_auth_session_update',
      'authObservedAt',new.created_at,
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
after update of country_code,country_source
on public.wallet_auth_sessions
for each row execute function public.capture_referral_activation_country_from_session();

commit;
