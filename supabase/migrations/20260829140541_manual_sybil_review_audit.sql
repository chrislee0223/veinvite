begin;

-- Preserve the existing append-only Sybil decision log while adding the
-- verified operator wallet to OPERATOR-sourced audit event details.
create or replace function public.log_invitation_sybil_decision()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_operator_wallet text := nullif(
    current_setting('veinvite.operator_wallet', true),
    ''
  );
begin
  if new.sybil_status = 'NOT_CHECKED' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.sybil_status is not distinct from old.sybil_status
     and new.sybil_risk_level is not distinct from old.sybil_risk_level
     and new.sybil_risk_score is not distinct from old.sybil_risk_score
     and new.sybil_reason is not distinct from old.sybil_reason
     and new.sybil_checked_at is not distinct from old.sybil_checked_at
     and new.sybil_source is not distinct from old.sybil_source then
    return new;
  end if;

  if new.invitee_wallet is null then
    return new;
  end if;

  insert into public.sybil_review_events (
    invite_code,
    wallet_address,
    resulting_status,
    risk_level,
    risk_score,
    signal_code,
    source,
    summary,
    details
  ) values (
    new.invite_code,
    new.invitee_wallet,
    new.sybil_status,
    new.sybil_risk_level,
    new.sybil_risk_score,
    case new.sybil_status
      when 'CLEAR' then 'POST_VOTE_BASELINE_CLEAR'
      when 'REVIEW' then 'REVIEW_REQUIRED'
      when 'BLOCKED' then 'CONFIRMED_ABUSE'
      else null
    end,
    new.sybil_source,
    coalesce(
      nullif(btrim(new.sybil_reason), ''),
      case new.sybil_status
        when 'CLEAR' then 'Post-vote Sybil gate passed.'
        when 'REVIEW' then 'Additional Sybil review is required.'
        when 'BLOCKED' then 'Confirmed abuse blocked from rewards.'
        else 'Sybil decision updated.'
      end
    ),
    jsonb_build_object(
      'invite_status', new.status,
      'reward_status', new.reward_status,
      'operator_wallet', case
        when new.sybil_source = 'OPERATOR'
          then v_operator_wallet
        else null
      end
    )
  );

  return new;
end;
$$;

-- Atomic operator-only resolution for a referral already placed in REVIEW.
-- The stale-state precondition prevents an operator from deciding on an old
-- screen after another process has refreshed or changed the Sybil decision.
create or replace function public.resolve_invitation_sybil_review(
  p_invite_code text,
  p_decision text,
  p_reason text,
  p_expected_checked_at timestamptz,
  p_operator_wallet text,
  p_network text
)
returns table(
  invite_code text,
  invite_status text,
  reward_status text,
  sybil_status text,
  sybil_checked_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invitations%rowtype;
  v_reason text;
begin
  if p_invite_code is null
     or upper(btrim(p_invite_code)) !~ '^[A-Z0-9]{7}$' then
    raise exception 'invalid invitation code';
  end if;

  if p_decision not in ('CLEAR', 'BLOCKED') then
    raise exception 'manual Sybil decision must be CLEAR or BLOCKED';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  if v_reason is null
     or length(v_reason) < 12
     or length(v_reason) > 500 then
    raise exception 'manual Sybil review reason must be between 12 and 500 characters';
  end if;

  if p_expected_checked_at is null then
    raise exception 'expected Sybil check timestamp is required';
  end if;

  if p_operator_wallet is null
     or lower(btrim(p_operator_wallet)) !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid operator wallet';
  end if;

  if p_network not in ('mainnet', 'testnet', 'testnet-staging') then
    raise exception 'unsupported network';
  end if;

  select *
  into v_row
  from public.invitations i
  where i.invite_code = upper(btrim(p_invite_code))
  for update;

  if not found then
    raise exception 'invitation not found';
  end if;

  if v_row.invitee_wallet is null then
    raise exception 'invitation has no invitee wallet';
  end if;

  if v_row.activation_network is distinct from p_network then
    raise exception 'manual Sybil review network mismatch';
  end if;

  if v_row.status <> 'UNDER_REVIEW'
     or v_row.sybil_status <> 'REVIEW' then
    raise exception 'invitation is not awaiting manual Sybil review';
  end if;

  if v_row.sybil_checked_at is distinct from p_expected_checked_at then
    raise exception 'manual Sybil review state changed; reload before deciding';
  end if;

  perform set_config(
    'veinvite.operator_wallet',
    lower(btrim(p_operator_wallet)),
    true
  );

  return query
  select *
  from public.set_invitation_sybil_decision(
    v_row.invite_code,
    p_decision,
    case when p_decision = 'CLEAR' then 'NONE' else 'HIGH' end,
    v_reason,
    case when p_decision = 'CLEAR' then 0 else 100 end
  );
end;
$$;

revoke all on function public.resolve_invitation_sybil_review(
  text,
  text,
  text,
  timestamptz,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.resolve_invitation_sybil_review(
  text,
  text,
  text,
  timestamptz,
  text,
  text
) to service_role;

grant execute on function public.resolve_invitation_sybil_review(
  text,
  text,
  text,
  timestamptz,
  text,
  text
) to postgres;

commit;
