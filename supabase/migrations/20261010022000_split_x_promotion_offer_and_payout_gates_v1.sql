alter table public.reward_runtime_config
  add column if not exists reward_x_promotion_payout_enabled boolean not null default false;

alter table public.reward_runtime_config
  drop constraint if exists reward_runtime_config_x_promotion_payout_requires_live_start_check,
  add constraint reward_runtime_config_x_promotion_payout_requires_live_start_check
    check (
      not reward_x_promotion_payout_enabled
      or reward_x_promotion_live_started_at is not null
    );

update public.reward_runtime_config
set reward_x_promotion_payout_enabled=false
where id=1;

alter table public.reward_x_promotion_runtime_events
  add column if not exists previous_payout_enabled boolean not null default false,
  add column if not exists payout_enabled boolean not null default false;

create or replace function public.log_reward_x_promotion_runtime_event()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
begin
  if new.reward_x_promotion_shadow_enabled
       is distinct from old.reward_x_promotion_shadow_enabled
     or new.reward_x_promotion_enabled
       is distinct from old.reward_x_promotion_enabled
     or new.reward_x_promotion_payout_enabled
       is distinct from old.reward_x_promotion_payout_enabled
     or new.reward_x_promotion_policy_version
       is distinct from old.reward_x_promotion_policy_version
     or new.reward_x_promotion_shadow_started_at
       is distinct from old.reward_x_promotion_shadow_started_at
     or new.reward_x_promotion_live_started_at
       is distinct from old.reward_x_promotion_live_started_at
  then
    insert into public.reward_x_promotion_runtime_events(
      config_id,
      previous_shadow_enabled,
      shadow_enabled,
      previous_live_enabled,
      live_enabled,
      previous_payout_enabled,
      payout_enabled,
      previous_policy_version,
      policy_version,
      previous_shadow_started_at,
      shadow_started_at,
      previous_live_started_at,
      live_started_at,
      database_actor
    ) values (
      new.id,
      old.reward_x_promotion_shadow_enabled,
      new.reward_x_promotion_shadow_enabled,
      old.reward_x_promotion_enabled,
      new.reward_x_promotion_enabled,
      old.reward_x_promotion_payout_enabled,
      new.reward_x_promotion_payout_enabled,
      old.reward_x_promotion_policy_version,
      new.reward_x_promotion_policy_version,
      old.reward_x_promotion_shadow_started_at,
      new.reward_x_promotion_shadow_started_at,
      old.reward_x_promotion_live_started_at,
      new.reward_x_promotion_live_started_at,
      current_user
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists reward_x_promotion_runtime_audit
  on public.reward_runtime_config;
create trigger reward_x_promotion_runtime_audit
after update of
  reward_x_promotion_shadow_enabled,
  reward_x_promotion_enabled,
  reward_x_promotion_payout_enabled,
  reward_x_promotion_policy_version,
  reward_x_promotion_shadow_started_at,
  reward_x_promotion_live_started_at
on public.reward_runtime_config
for each row execute function public.log_reward_x_promotion_runtime_event();

revoke all on function public.log_reward_x_promotion_runtime_event()
  from public,anon,authenticated;

comment on column public.reward_runtime_config.reward_x_promotion_enabled is
  'Controls creation of new LIVE X promotion splits/offers. Disabling it must not erase or hide already-created obligations.';
comment on column public.reward_runtime_config.reward_x_promotion_payout_enabled is
  'Controls fresh signing of already-earned X promotion obligations. Existing signed+journaled transactions remain recoverable independently.';
