begin;

create table if not exists public.sybil_v2_invitee_reinstatement_events (
  id uuid primary key default gen_random_uuid(),
  restriction_id uuid not null
    references public.sybil_v2_wallet_restrictions(id)
    on update cascade on delete restrict,
  network text not null
    check (network in ('mainnet','testnet','testnet-staging')),
  invite_code text not null
    references public.invitations(invite_code)
    on update cascade on delete restrict,
  inviter_wallet text not null
    check (inviter_wallet ~ '^0x[0-9a-f]{40}$'),
  invitee_wallet text not null
    check (invitee_wallet ~ '^0x[0-9a-f]{40}$'),
  restriction_source text not null
    check (restriction_source in ('OPERATOR','SYSTEM')),
  restriction_reason_codes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(restriction_reason_codes) = 'array'),
  restriction_evidence_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(restriction_evidence_summary) = 'object'),
  operator_wallet text not null
    check (operator_wallet ~ '^0x[0-9a-f]{40}$'),
  operator_reason text not null
    check (length(btrim(operator_reason)) between 12 and 500),
  reinstated_at timestamptz not null default clock_timestamp(),
  unique (restriction_id)
);

alter table public.sybil_v2_invitee_reinstatement_events
  enable row level security;

revoke all on public.sybil_v2_invitee_reinstatement_events
from public, anon, authenticated;
grant select on public.sybil_v2_invitee_reinstatement_events
to service_role;

drop trigger if exists
  sybil_v2_invitee_reinstatement_events_append_only
on public.sybil_v2_invitee_reinstatement_events;

create trigger sybil_v2_invitee_reinstatement_events_append_only
before update or delete on public.sybil_v2_invitee_reinstatement_events
for each row execute function public.prevent_sybil_v2_append_only_mutation();

create or replace view public.operator_sybil_v2_active_invitee_restrictions
with (security_invoker = true)
as
select
  r.id as restriction_id,
  r.network,
  lower(r.wallet_address) as invitee_wallet,
  lower(i.inviter_wallet) as inviter_wallet,
  r.source as restriction_source,
  r.reason_codes,
  r.evidence_summary,
  r.related_invite_code,
  r.imposed_at
from public.sybil_v2_wallet_restrictions r
join public.invitations i
  on i.invite_code = r.related_invite_code
 and i.invitee_wallet is not null
 and lower(i.invitee_wallet) = lower(r.wallet_address)
where r.status = 'ACTIVE'
  and r.source in ('OPERATOR','SYSTEM')
  and r.related_invite_code is not null
  and (r.evidence_summary ->> 'restrictionScope') = 'INVITEE_ONLY'
  and i.referral_link_id is not null
  and i.invite_slot is not null
  and i.status = 'CANCELLED'
  and i.reward_status = 'FORFEITED'
  and i.sybil_status = 'BLOCKED'
  and i.slot_released_at is not null
  and not exists (
    select 1
    from public.reward_queue_entries q
    where q.invite_code = i.invite_code
      and q.status = 'ASSIGNED'
  )
  and not exists (
    select 1
    from public.reward_payouts p
    where p.invite_code = i.invite_code
      and p.status in ('PENDING','SENDING','PAID')
  );

revoke all on public.operator_sybil_v2_active_invitee_restrictions
from public, anon, authenticated;
grant select on public.operator_sybil_v2_active_invitee_restrictions
to service_role;

create or replace function public.reinstate_sybil_v2_invitee_restriction(
  p_restriction_id uuid,
  p_reason text,
  p_operator_wallet text,
  p_network text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
  v_operator text := lower(btrim(p_operator_wallet));
  v_network text := lower(btrim(p_network));
  v_row public.sybil_v2_wallet_restrictions%rowtype;
  v_invitation public.invitations%rowtype;
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_record jsonb;
  v_clearance jsonb := null;
  v_revision bigint := null;
  v_restore_status text;
  v_now timestamptz := clock_timestamp();
  v_remaining bigint := 0;
begin
  if p_restriction_id is null then
    raise exception 'INVALID_INVITEE_RESTRICTION_ID';
  end if;
  if v_reason is null or length(v_reason) < 12 or length(v_reason) > 500 then
    raise exception 'INVITEE_REINSTATE_REASON_LENGTH';
  end if;
  if v_operator !~ '^0x[0-9a-f]{40}$' then
    raise exception 'INVALID_OPERATOR_WALLET';
  end if;
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'INVALID_NETWORK';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_sybil_v2_invitee_reinstate_' || p_restriction_id::text,
      0
    )
  );

  select *
  into v_row
  from public.sybil_v2_wallet_restrictions r
  where r.id = p_restriction_id
    and r.network = v_network
  for update;

  if not found then
    raise exception 'INVITEE_RESTRICTION_NOT_FOUND';
  end if;
  if v_row.status <> 'ACTIVE' then
    raise exception 'INVITEE_RESTRICTION_NOT_ACTIVE';
  end if;
  if v_row.source not in ('OPERATOR','SYSTEM')
     or v_row.related_invite_code is null
     or (v_row.evidence_summary ->> 'restrictionScope') <> 'INVITEE_ONLY' then
    raise exception 'INVITEE_RESTRICTION_SCOPE_MISMATCH';
  end if;

  select *
  into v_invitation
  from public.invitations i
  where i.invite_code = v_row.related_invite_code
    and i.invitee_wallet is not null
    and lower(i.invitee_wallet) = lower(v_row.wallet_address)
  for update;

  if not found then
    raise exception 'INVITEE_RESTRICTION_INVITATION_NOT_FOUND';
  end if;
  if lower(coalesce(v_invitation.activation_network,'')) <> v_network then
    raise exception 'INVITEE_RESTRICTION_NETWORK_MISMATCH';
  end if;
  if v_invitation.referral_link_id is null
     or v_invitation.invite_slot is null
     or v_invitation.status <> 'CANCELLED'
     or v_invitation.reward_status <> 'FORFEITED'
     or v_invitation.sybil_status <> 'BLOCKED'
     or v_invitation.slot_released_at is null then
    raise exception 'INVITEE_RESTRICTION_NOT_RESTORABLE';
  end if;
  if exists (
       select 1
       from public.reward_queue_entries q
       where q.invite_code = v_invitation.invite_code
         and q.status = 'ASSIGNED'
     )
     or exists (
       select 1
       from public.reward_payouts p
       where p.invite_code = v_invitation.invite_code
         and p.status in ('PENDING','SENDING','PAID')
     ) then
    raise exception 'INVITEE_RESTRICTION_REWARD_ALREADY_FINAL';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_referral_inviter_' || lower(v_invitation.inviter_wallet),
      0
    )
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_sybil_v2_' || v_invitation.invite_code,
      0
    )
  );

  if exists (
    select 1
    from public.invitations i
    where i.id <> v_invitation.id
      and lower(btrim(i.inviter_wallet)) =
        lower(btrim(v_invitation.inviter_wallet))
      and i.invite_slot = v_invitation.invite_slot
      and (
        i.status = 'PENDING_ACCEPTANCE'
        or (
          i.status in ('ACTIVATING','UNDER_REVIEW')
          and i.eligibility_check_id is not null
          and i.activation_network is not null
          and i.sybil_status <> 'BLOCKED'
        )
        or (
          i.status = 'COMPLETED'
          and i.eligibility_check_id is not null
          and i.activation_network is not null
          and i.sybil_status <> 'BLOCKED'
          and i.slot_released_at is null
        )
      )
  ) then
    raise exception 'INVITEE_RESTRICTION_SLOT_REUSED';
  end if;

  select *
  into v_assessment
  from public.sybil_v2_referral_assessments a
  where a.invite_code = v_invitation.invite_code
    and a.network = v_network
  for update;

  if not found or v_assessment.state <> 'RESTRICTED' then
    raise exception 'INVITEE_RESTRICTION_ASSESSMENT_NOT_RESTRICTED';
  end if;

  update public.sybil_v2_wallet_restrictions
  set
    status = 'REINSTATED',
    resolved_at = v_now
  where id = v_row.id
    and status = 'ACTIVE';

  if not found then
    raise exception 'INVITEE_RESTRICTION_STATE_CHANGED';
  end if;

  v_restore_status := case
    when v_invitation.vote_completed = true
     and v_invitation.vote_completed_at is not null
     and v_invitation.vote_completed_block is not null
     and v_invitation.vote_round_id is not null
     and coalesce(v_invitation.apps_completed, 0) >= 3
     and v_invitation.apps_completed_block is not null
     and v_invitation.activation_block is not null
     and v_invitation.apps_completed_block >= v_invitation.activation_block
     and v_invitation.vote_completed_block >= v_invitation.apps_completed_block
      then 'COMPLETED'
    else 'ACTIVATING'
  end;

  update public.invitations
  set
    status = v_restore_status,
    sybil_status = 'CLEAR',
    sybil_risk_level = 'NONE',
    sybil_risk_score = 0,
    sybil_reason = v_reason,
    sybil_checked_at = v_now,
    sybil_source = 'OPERATOR',
    slot_released_at = null
  where id = v_invitation.id;

  v_record := public.record_sybil_v2_assessment(
    v_invitation.invite_code,
    v_network,
    'CLEAR',
    0,
    v_assessment.policy_version,
    v_assessment.analyzer_version,
    v_assessment.evidence_cutoff_block,
    v_assessment.required_checks,
    v_assessment.completed_checks,
    v_assessment.reason_codes
      || jsonb_build_array('OPERATOR_REINSTATED_FALSE_POSITIVE'),
    v_assessment.evidence_summary
      || jsonb_build_object(
        'operatorReason', v_reason,
        'operatorWallet', v_operator,
        'operatorDecision', 'REINSTATE',
        'operatorReinstatedAt', v_now,
        'previousRestrictionId', v_row.id,
        'previousRestrictionSource', v_row.source,
        'restoredInvitationStatus', v_restore_status
      ),
    'OPERATOR',
    v_assessment.revision
  );

  if coalesce((v_record ->> 'updated')::boolean, false) is not true then
    raise exception 'INVITEE_RESTRICTION_ASSESSMENT_STATE_CHANGED';
  end if;

  v_revision := nullif(v_record ->> 'revision','')::bigint;
  if v_revision is null then
    raise exception 'INVITEE_RESTRICTION_CLEAR_REVISION_MISSING';
  end if;

  v_clearance := public.issue_sybil_v2_reward_clearance(
    v_invitation.invite_code,
    v_revision
  );

  insert into public.sybil_v2_invitee_reinstatement_events(
    restriction_id,
    network,
    invite_code,
    inviter_wallet,
    invitee_wallet,
    restriction_source,
    restriction_reason_codes,
    restriction_evidence_summary,
    operator_wallet,
    operator_reason,
    reinstated_at
  ) values (
    v_row.id,
    v_network,
    v_invitation.invite_code,
    lower(v_invitation.inviter_wallet),
    lower(v_invitation.invitee_wallet),
    v_row.source,
    v_row.reason_codes,
    v_row.evidence_summary,
    v_operator,
    v_reason,
    v_now
  );

  select count(*)::bigint
  into v_remaining
  from public.sybil_v2_wallet_restrictions r
  where r.network = v_network
    and r.wallet_address = lower(v_invitation.invitee_wallet)
    and r.status = 'ACTIVE';

  return jsonb_build_object(
    'changed', true,
    'state', 'REINSTATED',
    'restrictionId', v_row.id,
    'restrictionSource', v_row.source,
    'inviteCode', v_invitation.invite_code,
    'inviteeWallet', lower(v_invitation.invitee_wallet),
    'inviterWallet', lower(v_invitation.inviter_wallet),
    'reinstatedAt', v_now,
    'remainingActiveRestrictionCount', v_remaining,
    'futureParticipationRestored', v_remaining = 0,
    'invitationChanged', true,
    'restoredInvitationStatus', v_restore_status,
    'assessmentRevision', v_revision,
    'clearanceIssued',
      coalesce((v_clearance ->> 'issued')::boolean, false),
    'clearanceId', v_clearance ->> 'clearanceId',
    'clearanceReason', v_clearance ->> 'reason',
    'pastPaidRewardChanged', false
  );
end;
$function$;

revoke all on function public.reinstate_sybil_v2_invitee_restriction(
  uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.reinstate_sybil_v2_invitee_restriction(
  uuid,text,text,text
) to service_role;

comment on view public.operator_sybil_v2_active_invitee_restrictions is
  'Service-only active unpaid modern INVITEE_ONLY restrictions whose original referral slot is still recoverable. They are not added to the normal manual-review queue.';

comment on function public.reinstate_sybil_v2_invitee_restriction(
  uuid,text,text,text
) is
  'Audited false-positive recovery for an unpaid blocked invitee. It restores the original referral only while its permanent-link slot has not been reused, records an OPERATOR CLEAR assessment, preserves any already-paid reward history, and never changes inviter identity or network provenance.';

commit;
