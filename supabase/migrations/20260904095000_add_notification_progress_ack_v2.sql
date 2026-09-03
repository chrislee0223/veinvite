-- Extend notification read-state without renumbering the existing 1..6 stage
-- contract. dApp 1/3 and 2/3 live inside legacy stage 2, while reward-ready
-- acknowledgement is independent from stage 4 so users who saw an older
-- "all missions complete" notice can still receive the final verification /
-- reusable-slot notice after the fixed reward is reserved.

alter table public.invite_notification_state
  add column if not exists dapp_progress_acknowledged smallint not null default 0,
  add column if not exists reward_ready_acknowledged_at timestamptz;

alter table public.invite_notification_state
  drop constraint if exists invite_notification_state_dapp_progress_check;
alter table public.invite_notification_state
  add constraint invite_notification_state_dapp_progress_check
  check (dapp_progress_acknowledged between 0 and 3);

create or replace function public.acknowledge_invite_notification_v2(
  p_invite_code text,
  p_inviter_wallet text,
  p_stage integer default null,
  p_dapp_progress integer default null,
  p_reward_ready boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_invite_code text := upper(btrim(p_invite_code));
  v_wallet text := lower(btrim(p_inviter_wallet));
  v_stage smallint;
  v_dapp smallint;
  v_state public.invite_notification_state%rowtype;
begin
  if v_invite_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'invalid invite code';
  end if;

  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid inviter wallet';
  end if;

  if p_stage is not null and p_stage not between 1 and 6 then
    raise exception 'invalid notification stage';
  end if;

  if p_dapp_progress is not null and p_dapp_progress not between 0 and 3 then
    raise exception 'invalid dapp progress';
  end if;

  if p_stage is null and p_dapp_progress is null and not coalesce(p_reward_ready, false) then
    raise exception 'no notification acknowledgement supplied';
  end if;

  if not exists (
    select 1
    from public.invitations i
    where i.invite_code = v_invite_code
      and lower(i.inviter_wallet) = v_wallet
  ) then
    raise exception 'invitation does not belong to inviter';
  end if;

  -- A sub-stage acknowledgement can only happen after the referral was
  -- accepted. If there is no legacy state row yet, stage 1 is therefore the
  -- safe baseline and keeps the historical 1..6 stage constraint intact.
  v_stage := coalesce(p_stage, 1)::smallint;
  v_dapp := coalesce(p_dapp_progress, 0)::smallint;

  insert into public.invite_notification_state (
    invite_code,
    inviter_wallet,
    highest_stage,
    dapp_progress_acknowledged,
    reward_ready_acknowledged_at,
    acknowledged_at,
    updated_at
  ) values (
    v_invite_code,
    v_wallet,
    v_stage,
    v_dapp,
    case when coalesce(p_reward_ready, false) then now() else null end,
    now(),
    now()
  )
  on conflict (invite_code, inviter_wallet)
  do update set
    highest_stage = greatest(
      public.invite_notification_state.highest_stage,
      excluded.highest_stage
    ),
    dapp_progress_acknowledged = greatest(
      public.invite_notification_state.dapp_progress_acknowledged,
      excluded.dapp_progress_acknowledged
    ),
    reward_ready_acknowledged_at = case
      when coalesce(p_reward_ready, false)
        then coalesce(
          public.invite_notification_state.reward_ready_acknowledged_at,
          now()
        )
      else public.invite_notification_state.reward_ready_acknowledged_at
    end,
    acknowledged_at = case
      when excluded.highest_stage >= public.invite_notification_state.highest_stage
        or excluded.dapp_progress_acknowledged > public.invite_notification_state.dapp_progress_acknowledged
        or coalesce(p_reward_ready, false)
        then now()
      else public.invite_notification_state.acknowledged_at
    end,
    updated_at = now()
  returning * into v_state;

  return jsonb_build_object(
    'inviteCode', v_state.invite_code,
    'highestStage', v_state.highest_stage,
    'dappProgressAcknowledged', v_state.dapp_progress_acknowledged,
    'rewardReadyAcknowledgedAt', v_state.reward_ready_acknowledged_at,
    'acknowledgedAt', v_state.acknowledged_at
  );
end;
$$;

revoke all on function public.acknowledge_invite_notification_v2(
  text,text,integer,integer,boolean
) from public;
grant execute on function public.acknowledge_invite_notification_v2(
  text,text,integer,integer,boolean
) to service_role;

comment on column public.invite_notification_state.dapp_progress_acknowledged is
  'Highest acknowledged qualifying dApp+B3TR unit (0..3). Additive to legacy highest_stage; never renumbers stage history.';
comment on column public.invite_notification_state.reward_ready_acknowledged_at is
  'Acknowledges final verification + fixed reward reservation + reusable-slot readiness independently from legacy stage 4.';
