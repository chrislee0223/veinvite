-- Keep invite notifications on one monotonic acknowledgement stream. Stage 6
-- represents the terminal ACTIVE_EXISTING rejection and is only emitted for an
-- invitation already closed with explicit ineligibility evidence.
create or replace function public.acknowledge_invite_notification(
  p_invite_code text,
  p_inviter_wallet text,
  p_stage integer
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_invite_code text := upper(btrim(p_invite_code));
  v_wallet text := lower(btrim(p_inviter_wallet));
  v_state public.invite_notification_state%rowtype;
begin
  if v_invite_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'invalid invite code';
  end if;

  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid inviter wallet';
  end if;

  if p_stage is null or p_stage not between 1 and 6 then
    raise exception 'invalid notification stage';
  end if;

  if not exists (
    select 1
    from public.invitations i
    where i.invite_code = v_invite_code
      and i.inviter_wallet = v_wallet
  ) then
    raise exception 'invitation does not belong to inviter';
  end if;

  insert into public.invite_notification_state (
    invite_code,
    inviter_wallet,
    highest_stage,
    acknowledged_at,
    updated_at
  ) values (
    v_invite_code,
    v_wallet,
    p_stage,
    now(),
    now()
  )
  on conflict (invite_code, inviter_wallet)
  do update set
    highest_stage = greatest(
      public.invite_notification_state.highest_stage,
      excluded.highest_stage
    ),
    acknowledged_at = case
      when excluded.highest_stage >=
        public.invite_notification_state.highest_stage
        then now()
      else public.invite_notification_state.acknowledged_at
    end,
    updated_at = now()
  returning * into v_state;

  return jsonb_build_object(
    'inviteCode', v_state.invite_code,
    'highestStage', v_state.highest_stage,
    'acknowledgedAt', v_state.acknowledged_at
  );
end;
$function$;

revoke all on function public.acknowledge_invite_notification(
  text, text, integer
) from public, anon, authenticated;
grant execute on function public.acknowledge_invite_notification(
  text, text, integer
) to service_role;
