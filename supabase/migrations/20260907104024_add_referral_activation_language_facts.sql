begin;

create table if not exists public.referral_activation_language_facts (
  id bigint generated always as identity primary key,
  relationship_id uuid not null references public.referral_relationships(id) on delete restrict,
  source_invitation_id uuid not null references public.invitations(id) on delete restrict,
  language_code text not null check (language_code = 'UNKNOWN' or language_code ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  language_source text not null check (language_source in ('MANUAL_SELECTION','QUERY_PARAM','LOCAL_STORAGE','BROWSER_AUTO','WALLET_PREFERENCE','UNKNOWN')),
  observed_at timestamptz not null,
  language_policy_version text not null check (language_policy_version ~ '^[a-z0-9_.-]{1,80}$'),
  source_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(source_snapshot) = 'object'),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (relationship_id),
  unique (source_invitation_id)
);

comment on table public.referral_activation_language_facts is
  'Immutable language shown at canonical referral activation. It records the displayed locale and its source separately from country. Historical missing values are never guessed.';

create index if not exists referral_activation_language_language_idx
  on public.referral_activation_language_facts (language_code, observed_at);

alter table public.referral_activation_language_facts enable row level security;
revoke all on table public.referral_activation_language_facts from public, anon, authenticated;
grant select, insert on table public.referral_activation_language_facts to service_role;
grant usage, select on sequence public.referral_activation_language_facts_id_seq to service_role;

drop trigger if exists referral_activation_language_facts_append_only on public.referral_activation_language_facts;
create trigger referral_activation_language_facts_append_only
before update or delete on public.referral_activation_language_facts
for each row execute function public.prevent_long_term_history_mutation();

create or replace function public.validate_referral_activation_language_fact_integrity()
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
    raise exception 'language fact invitation does not match referral relationship source invitation';
  end if;

  if (new.language_source = 'UNKNOWN') <> (new.language_code = 'UNKNOWN') then
    raise exception 'UNKNOWN language source and UNKNOWN language code must be used together';
  end if;

  if new.observed_at < v_relationship_effective_at then
    raise exception 'language observation cannot predate the referral relationship';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_referral_activation_language_fact_integrity()
  from public, anon, authenticated;
grant execute on function public.validate_referral_activation_language_fact_integrity()
  to postgres, service_role;

drop trigger if exists referral_activation_language_facts_integrity_guard
  on public.referral_activation_language_facts;
create trigger referral_activation_language_facts_integrity_guard
before insert on public.referral_activation_language_facts
for each row execute function public.validate_referral_activation_language_fact_integrity();

insert into public.veinvite_metric_definition_versions
  (metric_key, definition_version, title, definition, calculation_spec, effective_from)
values
  ('activation_language','immutable-language-v1','Activation language',
   'Displayed VeInvite language captured at the canonical referral activation/relationship point with its source. Historical missing values are UNKNOWN and are never inferred from country.',
   jsonb_build_object('source','referral_activation_language_facts','allowedFallback','UNKNOWN','countryInferenceAllowed',false),
   clock_timestamp())
on conflict (metric_key, definition_version) do nothing;

commit;
