begin;

-- Defense in depth: the database independently verifies that every immutable
-- manifest-v2 clause carries the same deterministic, privacy-preserving
-- referral-onboarding proof encoded by the application.
create or replace function public.validate_reward_manifest_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.manifest_version <> 'veinvite-payout-manifest-v2' then
    raise exception 'Only VeInvite payout manifest v2 is accepted';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.clauses) as c(value)
    where coalesce(c.value->>'payoutId', '') !~ '^[1-9][0-9]*$'
       or c.value->>'proof' is distinct from
          ('veinvite:referral-onboarding:v1:payout:' || (c.value->>'payoutId'))
  ) then
    raise exception 'Payout manifest contains an invalid referral proof';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_reward_manifest_v2()
  from public, anon, authenticated, service_role;

drop trigger if exists reward_payout_manifests_validate_v2
  on public.reward_payout_manifests;
create trigger reward_payout_manifests_validate_v2
before insert on public.reward_payout_manifests
for each row execute function public.validate_reward_manifest_v2();

commit;
