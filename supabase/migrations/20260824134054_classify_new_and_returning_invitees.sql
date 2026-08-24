-- Persist the eligibility class established at the invitation-entry boundary.
-- NEW has no prior rewarded/allocation-voting VeBetterDAO history.
-- RETURNING has historical activity, but no reward or allocation-vote activity
-- in the recent 12-completed-round eligibility window through the checked block.
-- ACTIVE_EXISTING is recorded for rejected recent-activity checks.

begin;

alter table public.eligibility_check_events
  add column if not exists entry_class text;

alter table public.eligibility_check_events
  drop constraint if exists eligibility_check_events_entry_class_check;

alter table public.eligibility_check_events
  add constraint eligibility_check_events_entry_class_check
  check (
    entry_class is null
    or entry_class in ('NEW', 'RETURNING', 'ACTIVE_EXISTING')
  );

create or replace function public.claim_invitation_with_entry_proof(
  p_invite_code text,
  p_invitee_wallet text,
  p_network text,
  p_checked_block bigint,
  p_prior_reward_tx_id text default null,
  p_prior_vote_tx_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(p_invite_code));
  v_wallet text := lower(btrim(p_invitee_wallet));
  v_network text := lower(btrim(p_network));
  v_entry_class text;
  v_invitation public.invitations%rowtype;
  v_check_id bigint;
  v_now timestamptz := now();
begin
  if v_code !~ '^[A-Z0-9]{7}$' then
    raise exception 'invalid invite code';
  end if;

  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid invitee wallet';
  end if;

  if v_network not in ('mainnet', 'testnet', 'testnet-staging') then
    raise exception 'unsupported network';
  end if;

  if p_checked_block is null or p_checked_block < 0 then
    raise exception 'invalid checked block';
  end if;

  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'details must be a JSON object';
  end if;

  v_entry_class := upper(
    coalesce(
      nullif(btrim(p_details ->> 'entryClass'), ''),
      'NEW'
    )
  );

  if v_entry_class not in ('NEW', 'RETURNING') then
    raise exception 'eligible claim must be NEW or RETURNING';
  end if;

  if v_entry_class = 'NEW'
     and (p_prior_reward_tx_id is not null or p_prior_vote_tx_id is not null) then
    raise exception 'NEW claim cannot contain prior VeBetter activity evidence';
  end if;

  if v_entry_class = 'RETURNING'
     and p_prior_reward_tx_id is null
     and p_prior_vote_tx_id is null then
    raise exception 'RETURNING claim requires historical VeBetter activity evidence';
  end if;

  select *
  into v_invitation
  from public.invitations
  where invite_code = v_code
  for update;

  if not found then
    return jsonb_build_object('result', 'NOT_FOUND');
  end if;

  if v_invitation.status = 'CANCELLED' then
    return jsonb_build_object('result', 'CANCELLED');
  end if;

  if v_invitation.invitee_wallet is not null then
    return jsonb_build_object('result', 'ALREADY_USED');
  end if;

  if lower(v_invitation.inviter_wallet) = v_wallet then
    return jsonb_build_object('result', 'SELF_REFERRAL');
  end if;

  if exists (
    select 1
    from public.invitations i
    where i.invitee_wallet = v_wallet
  ) then
    return jsonb_build_object('result', 'ALREADY_REFERRED');
  end if;

  insert into public.eligibility_check_events (
    invite_code,
    wallet_address,
    network,
    checked_block,
    outcome,
    entry_class,
    prior_reward_tx_id,
    prior_vote_tx_id,
    details
  ) values (
    v_code,
    v_wallet,
    v_network,
    p_checked_block,
    'ELIGIBLE',
    v_entry_class,
    p_prior_reward_tx_id,
    p_prior_vote_tx_id,
    p_details
  )
  returning id into v_check_id;

  update public.invitations
  set
    invitee_wallet = v_wallet,
    status = 'ACTIVATING',
    reward_status = 'PENDING',
    activated_at = v_now,
    activation_block = p_checked_block,
    activation_network = v_network,
    eligibility_check_id = v_check_id,
    impact_last_synced_block = p_checked_block,
    impact_last_synced_at = v_now,
    impact_sync_complete_at = null
  where invite_code = v_code
  returning * into v_invitation;

  return jsonb_build_object(
    'result', 'CLAIMED',
    'entry_class', v_entry_class,
    'invite_code', v_invitation.invite_code,
    'inviter_wallet', v_invitation.inviter_wallet,
    'invitee_wallet', v_invitation.invitee_wallet,
    'status', v_invitation.status,
    'reward_status', v_invitation.reward_status,
    'created_at', v_invitation.created_at,
    'updated_at', v_invitation.updated_at,
    'activated_at', v_invitation.activated_at,
    'activation_block', v_invitation.activation_block,
    'activation_network', v_invitation.activation_network,
    'eligibility_check_id', v_invitation.eligibility_check_id
  );
end;
$$;

revoke all on function public.claim_invitation_with_entry_proof(
  text,
  text,
  text,
  bigint,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.claim_invitation_with_entry_proof(
  text,
  text,
  text,
  bigint,
  text,
  text,
  jsonb
) to service_role;

commit;
