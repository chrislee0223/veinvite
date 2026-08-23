create or replace function public.set_invitation_sybil_decision(
  p_invite_code text,
  p_sybil_status text,
  p_risk_level text default 'NONE',
  p_reason text default null,
  p_risk_score integer default 0
)
returns table (
  invite_code text,
  invite_status text,
  reward_status text,
  sybil_status text,
  sybil_checked_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.invitations%rowtype;
  v_status text;
  v_risk_level text;
  v_reason text;
begin
  if p_invite_code is null or length(btrim(p_invite_code)) = 0 then
    raise exception 'invite code is required';
  end if;

  if p_sybil_status not in ('CLEAR', 'REVIEW', 'BLOCKED') then
    raise exception 'invalid Sybil status';
  end if;

  if p_risk_score < 0 or p_risk_score > 100 then
    raise exception 'risk score must be between 0 and 100';
  end if;

  select *
  into v_row
  from public.invitations
  where invitations.invite_code = upper(btrim(p_invite_code))
  for update;

  if not found then
    raise exception 'invitation not found';
  end if;

  if v_row.invitee_wallet is null then
    raise exception 'invitation has no invitee wallet';
  end if;

  if p_sybil_status = 'CLEAR' then
    v_risk_level := 'NONE';
    v_reason := nullif(btrim(coalesce(p_reason, '')), '');

    if v_row.status = 'CANCELLED' then
      v_status := 'CANCELLED';
    elsif v_row.vote_completed = true
       and v_row.vote_completed_at is not null
       and v_row.vote_completed_block is not null
       and v_row.vote_round_id is not null
       and coalesce(v_row.apps_completed, 0) >= 3
       and v_row.apps_completed_block is not null
       and v_row.activation_block is not null
       and v_row.apps_completed_block >= v_row.activation_block
       and v_row.vote_completed_block >= v_row.apps_completed_block then
      v_status := 'COMPLETED';
    else
      v_status := 'ACTIVATING';
    end if;
  elsif p_sybil_status = 'REVIEW' then
    v_risk_level := case
      when p_risk_level in ('LOW', 'MEDIUM', 'HIGH') then p_risk_level
      else 'MEDIUM'
    end;
    v_reason := nullif(btrim(coalesce(p_reason, '')), '');

    if v_reason is null then
      raise exception 'review reason is required';
    end if;

    v_status := case
      when v_row.status = 'CANCELLED' then 'CANCELLED'
      else 'UNDER_REVIEW'
    end;
  else
    v_risk_level := case
      when p_risk_level in ('LOW', 'MEDIUM', 'HIGH') then p_risk_level
      else 'HIGH'
    end;
    v_reason := nullif(btrim(coalesce(p_reason, '')), '');

    if v_reason is null then
      raise exception 'block reason is required';
    end if;

    v_status := case
      when v_row.status = 'CANCELLED' then 'CANCELLED'
      else 'UNDER_REVIEW'
    end;
  end if;

  update public.invitations
  set
    status = v_status,
    sybil_status = p_sybil_status,
    sybil_risk_level = v_risk_level,
    sybil_risk_score = p_risk_score,
    sybil_reason = v_reason,
    sybil_checked_at = now(),
    sybil_source = 'OPERATOR'
  where invitations.invite_code = v_row.invite_code;

  return query
  select
    i.invite_code,
    i.status,
    i.reward_status,
    i.sybil_status,
    i.sybil_checked_at
  from public.invitations i
  where i.invite_code = v_row.invite_code;
end;
$function$;

revoke all on function public.set_invitation_sybil_decision(text, text, text, text, integer)
from public, anon, authenticated;
grant execute on function public.set_invitation_sybil_decision(text, text, text, text, integer)
to service_role;
