begin;

-- Once AWAITING_CLAIM exists with a Sybil v2 clearance, the anti-abuse review
-- for that reward is finished. Claim may authenticate the frozen recipient and
-- transfer state, but must not re-evaluate mutable invitation risk fields.
create or replace function public.request_reward_claim(
  p_invite_code text,
  p_recipient_wallet text
)
returns table(
  invite_code text,
  status text,
  claim_requested_at timestamptz,
  claim_requested_by_wallet text
)
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_code text := upper(btrim(p_invite_code));
  v_wallet text := lower(btrim(p_recipient_wallet));
  v_queue public.reward_queue_entries%rowtype;
  v_invitation public.invitations%rowtype;
  v_clearance public.sybil_v2_reward_clearances%rowtype;
begin
  if v_code is null or v_code='' then raise exception 'INVITE_CODE_REQUIRED'; end if;
  if v_wallet is null or v_wallet !~ '^0x[0-9a-f]{40}$' then raise exception 'INVALID_RECIPIENT_WALLET'; end if;

  perform pg_advisory_xact_lock(hashtextextended('veinvite_reward_claim_' || v_code,0));

  select * into v_queue
  from public.reward_queue_entries q
  where q.invite_code = v_code
  for update;

  if not found
     or v_queue.reserved_amount_wei is null
     or v_queue.reserved_amount_wei <= 0
     or v_queue.reserved_at is null then
    raise exception 'REWARD_CLAIM_NOT_AVAILABLE';
  end if;

  if v_queue.recipient_wallet <> v_wallet then
    raise exception 'REWARD_CLAIM_WALLET_MISMATCH';
  end if;

  if v_queue.status = 'CANCELLED' then
    raise exception 'REWARD_CLAIM_CANCELLED';
  end if;

  if v_queue.sybil_clearance_id is not null then
    -- Immutable v2 authority. Deliberately do not read current invitation
    -- Sybil/identity state here: that review ended before AWAITING_CLAIM.
    select * into v_clearance
    from public.sybil_v2_reward_clearances c
    where c.id = v_queue.sybil_clearance_id
      and c.invite_code = v_queue.invite_code
      and c.network = v_queue.network
      and c.verdict in ('CLEAR','WATCH');

    if not found then
      raise exception 'REWARD_CLAIM_NOT_AVAILABLE';
    end if;
  else
    -- Legacy queue entries keep the historical mutable gate so this rollout
    -- cannot silently weaken rewards that predate Sybil v2.
    select * into v_invitation
    from public.invitations i
    where i.invite_code = v_code
    for update;

    if not found
       or v_invitation.status <> 'COMPLETED'
       or v_invitation.reward_status not in ('ELIGIBLE','PAID')
       or v_invitation.reward_eligible_at is null
       or v_invitation.sybil_status <> 'CLEAR'
       or v_invitation.sybil_checked_at is null
       or lower(v_invitation.inviter_wallet) <> v_wallet
       or v_queue.eligible_at <> v_invitation.reward_eligible_at then
      raise exception 'REWARD_CLAIM_NOT_AVAILABLE';
    end if;
  end if;

  if v_queue.status = 'AWAITING_CLAIM' then
    update public.reward_queue_entries q
    set
      status = 'QUEUED',
      queued_at = coalesce(q.queued_at,now()),
      claim_requested_at = now(),
      claim_requested_by_wallet = v_wallet
    where q.id = v_queue.id
    returning q.* into v_queue;
  elsif v_queue.status not in ('QUEUED','ASSIGNED') then
    raise exception 'REWARD_CLAIM_NOT_AVAILABLE';
  end if;

  if v_queue.claim_requested_at is null
     or v_queue.claim_requested_by_wallet <> v_wallet then
    raise exception 'REWARD_CLAIM_STATE_INVALID';
  end if;

  return query
  select
    v_queue.invite_code,
    v_queue.status,
    v_queue.claim_requested_at,
    v_queue.claim_requested_by_wallet;
end;
$$;

-- The existing queue identity trigger remains authoritative for legacy rows.
-- A v2-cleared queue already contains a frozen pre-Claim identity decision and
-- must not re-open that review when AWAITING_CLAIM moves to QUEUED/ASSIGNED.
create or replace function public.enforce_reward_queue_identity_gate()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_identity_link_status text;
  v_identity_link_checked_at timestamptz;
  v_vote_completed_at timestamptz;
  v_identity_link_policy_version text;
  v_identity_link_evidence jsonb;
begin
  if new.status not in ('AWAITING_CLAIM','QUEUED','ASSIGNED') then
    return new;
  end if;

  if new.sybil_clearance_id is not null then
    if exists (
      select 1
      from public.sybil_v2_reward_clearances c
      where c.id = new.sybil_clearance_id
        and c.invite_code = new.invite_code
        and c.network = new.network
        and c.verdict in ('CLEAR','WATCH')
    ) then
      return new;
    end if;

    raise exception 'REWARD_QUEUE_SYBIL_V2_CLEARANCE_INVALID';
  end if;

  select
    i.identity_link_status,
    i.identity_link_checked_at,
    i.vote_completed_at,
    i.identity_link_policy_version,
    i.identity_link_evidence
  into
    v_identity_link_status,
    v_identity_link_checked_at,
    v_vote_completed_at,
    v_identity_link_policy_version,
    v_identity_link_evidence
  from public.invitations i
  where i.invite_code = new.invite_code;

  if not found
     or not public.security_identity_reward_gate_passes(
       v_identity_link_status,
       v_identity_link_checked_at,
       v_vote_completed_at,
       v_identity_link_policy_version,
       v_identity_link_evidence
     ) then
    raise exception 'REWARD_QUEUE_IDENTITY_GATE_NOT_SATISFIED';
  end if;

  return new;
end;
$$;

-- Validate any v2 authority attached to a queue row at the DB boundary.
create or replace function public.validate_sybil_v2_reward_queue_clearance()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.sybil_clearance_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.sybil_v2_reward_clearances c
    where c.id = new.sybil_clearance_id
      and c.invite_code = new.invite_code
      and c.network = new.network
      and c.verdict in ('CLEAR','WATCH')
  ) then
    raise exception 'REWARD_QUEUE_SYBIL_V2_CLEARANCE_INVALID';
  end if;

  return new;
end;
$$;

drop trigger if exists zy_reward_queue_sybil_v2_clearance_gate
  on public.reward_queue_entries;
create trigger zy_reward_queue_sybil_v2_clearance_gate
before insert or update of sybil_clearance_id, invite_code, network, status
on public.reward_queue_entries
for each row execute function public.validate_sybil_v2_reward_queue_clearance();

-- Do not let later background checks rewrite the historical invitation fields
-- that legacy financial SQL still reads for an already exposed Claim. New
-- evidence belongs in the v2 assessment/restriction ledgers and affects future
-- participation, not this already-reserved reward.
create or replace function public.freeze_v2_claim_ready_invitation_authority()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.reward_status = 'ELIGIBLE'
     and exists (
       select 1
       from public.reward_queue_entries q
       where q.invite_code = old.invite_code
         and q.sybil_clearance_id is not null
         and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
     )
  then
    new.status := old.status;
    new.reward_eligible_at := old.reward_eligible_at;

    new.sybil_status := old.sybil_status;
    new.sybil_risk_level := old.sybil_risk_level;
    new.sybil_risk_score := old.sybil_risk_score;
    new.sybil_reason := old.sybil_reason;
    new.sybil_checked_at := old.sybil_checked_at;
    new.sybil_source := old.sybil_source;

    if new.reward_status <> 'PAID' then
      new.reward_status := old.reward_status;
      new.reward_paid_at := old.reward_paid_at;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists invitations_lock_v2_cleared_reward_after_reservation
  on public.invitations;
drop trigger if exists zzzz_invitations_freeze_v2_claim_authority
  on public.invitations;
create trigger zzzz_invitations_freeze_v2_claim_authority
before update on public.invitations
for each row execute function public.freeze_v2_claim_ready_invitation_authority();

-- Reward pricing must count only referrals that actually passed the current v2
-- assessment. HOLD/PENDING/FAILED referrals must not dilute payable users.
create or replace function public.read_sybil_v2_cleared_unreserved_count(
  p_network text,
  p_reward_cohort_round_id bigint,
  p_allocation_receipt_id bigint
)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(*)::integer
  from public.invitations i
  join public.sybil_v2_referral_assessments a
    on a.invite_code = i.invite_code
   and a.state in ('CLEAR','WATCH')
  join public.sybil_v2_reward_clearances c
    on c.invite_code = i.invite_code
   and c.network = lower(btrim(p_network))
   and c.assessment_revision = a.revision
   and c.verdict = a.state
  where i.activation_network = lower(btrim(p_network))
    and i.reward_cohort_round_id = p_reward_cohort_round_id
    and i.reward_funding_allocation_receipt_id = p_allocation_receipt_id
    and i.status = 'COMPLETED'
    and i.reward_status = 'ELIGIBLE'
    and i.reward_eligible_at is not null
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code = i.invite_code
        and q.reserved_amount_wei is not null
    )
    and not exists (
      select 1
      from public.sybil_v2_wallet_restrictions r
      where r.network = i.activation_network
        and r.status = 'ACTIVE'
        and r.wallet_address in (
          lower(i.inviter_wallet),
          lower(i.invitee_wallet)
        )
    )
    and not exists (
      select 1
      from public.reward_reservation_legacy_exclusions x
      where x.invite_code = i.invite_code
    );
$$;

revoke all on function public.read_sybil_v2_cleared_unreserved_count(
  text,bigint,bigint
) from public, anon, authenticated;
grant execute on function public.read_sybil_v2_cleared_unreserved_count(
  text,bigint,bigint
) to service_role;

revoke all on function public.validate_sybil_v2_reward_queue_clearance()
  from public, anon, authenticated;
revoke all on function public.freeze_v2_claim_ready_invitation_authority()
  from public, anon, authenticated;

comment on function public.request_reward_claim(text,text) is
  'Claim is transfer-only for Sybil v2 rows: immutable queue + clearance authority is final once AWAITING_CLAIM is exposed.';

comment on function public.read_sybil_v2_cleared_unreserved_count(text,bigint,bigint) is
  'Counts only current CLEAR/WATCH Sybil v2 referrals that can legitimately enter fixed reward reservation pricing.';

commit;
