-- VePassport same-identity enforcement for Sybil v2.
--
-- A referral is automatically restricted only when the current SYSTEM HOLD
-- contains a freshly collected HIGH VePassport identity signal proving that
-- the invitee shares one VePassport with the inviter or with another known
-- VeInvite participant. Bot signals, blacklist state, delegation and isPerson
-- are intentionally NOT automatic blacklist triggers here.

create or replace function public.apply_sybil_v2_vepassport_same_passport_restriction(
  p_invite_code text,
  p_expected_revision bigint,
  p_network text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_code text := upper(btrim(p_invite_code));
  v_network text := lower(btrim(p_network));
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_invitation public.invitations%rowtype;
  v_evidence public.sybil_v2_evidence_records%rowtype;
  v_record jsonb;
  v_now timestamptz := clock_timestamp();
  v_reason text :=
    'Automatic restriction: VePassport links this invitee to the same identity as the inviter or another VeInvite participant.';
begin
  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_sybil_v2_vepassport_' || v_code, 0)
  );

  select * into v_assessment
  from public.sybil_v2_referral_assessments
  where invite_code = v_code
  for update;

  if not found then
    raise exception 'SYBIL_V2_ASSESSMENT_NOT_FOUND';
  end if;
  if v_assessment.network <> v_network then
    raise exception 'SYBIL_V2_NETWORK_MISMATCH';
  end if;
  if v_assessment.revision <> p_expected_revision then
    raise exception 'SYBIL_V2_REVIEW_STATE_CHANGED';
  end if;

  if v_assessment.state <> 'HOLD'
     or v_assessment.source <> 'SYSTEM' then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'NOT_CURRENT_SYSTEM_HOLD'
    );
  end if;

  select * into v_invitation
  from public.invitations
  where invite_code = v_code
  for update;

  if not found or v_invitation.invitee_wallet is null then
    raise exception 'SYBIL_V2_INVITATION_NOT_FOUND';
  end if;

  if v_invitation.reward_status = 'PAID'
     or exists(
       select 1
       from public.reward_queue_entries q
       where q.invite_code = v_code
         and q.status = 'ASSIGNED'
     ) then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'REWARD_ALREADY_FINAL'
    );
  end if;

  select *
  into v_evidence
  from public.sybil_v2_evidence_records e
  where e.invite_code = v_code
    and e.network = v_network
    and e.subject_wallet = lower(v_invitation.invitee_wallet)
    and e.evidence_family = 'SECURITY_IDENTITY'
    and e.signal_code in (
      'VEPASSPORT_SAME_PASSPORT_INVITER',
      'VEPASSPORT_SHARED_PASSPORT_PARTICIPANT'
    )
    and e.strength = 'HIGH'
    and e.score >= 100
  order by e.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'changed', false,
      'state', 'HOLD',
      'revision', v_assessment.revision,
      'reason', 'VEPASSPORT_SAME_IDENTITY_NOT_CONFIRMED'
    );
  end if;

  if not exists (
    select 1
    from jsonb_array_elements_text(
      coalesce(v_assessment.reason_codes, '[]'::jsonb)
    ) as reason(code)
    where reason.code = v_evidence.signal_code
  ) then
    return jsonb_build_object(
      'changed', false,
      'state', 'HOLD',
      'revision', v_assessment.revision,
      'reason', 'VEPASSPORT_SIGNAL_NOT_IN_CURRENT_ASSESSMENT'
    );
  end if;

  update public.invitations
  set
    status = 'CANCELLED',
    reward_status = 'FORFEITED',
    sybil_status = 'BLOCKED',
    sybil_risk_level = 'HIGH',
    sybil_risk_score = 100,
    sybil_reason = v_reason,
    sybil_checked_at = v_now,
    sybil_source = 'SYSTEM'
  where invite_code = v_code;

  if not exists(
    select 1
    from public.sybil_v2_wallet_restrictions r
    where r.network = v_network
      and r.wallet_address = lower(v_invitation.invitee_wallet)
      and r.status = 'ACTIVE'
      and r.resolved_at is null
  ) then
    insert into public.sybil_v2_wallet_restrictions(
      wallet_address,
      network,
      status,
      reason_codes,
      evidence_summary,
      source,
      related_invite_code,
      imposed_at
    ) values (
      lower(v_invitation.invitee_wallet),
      v_network,
      'ACTIVE',
      v_assessment.reason_codes ||
        jsonb_build_array('AUTO_VEPASSPORT_SAME_PASSPORT_RESTRICTION'),
      v_assessment.evidence_summary || jsonb_build_object(
        'automaticDecision', 'RESTRICT',
        'behaviorPattern', 'VEPASSPORT_SAME_IDENTITY_V1',
        'passportAddress', v_evidence.evidence ->> 'passport',
        'relatedWallet', v_evidence.related_wallet,
        'restrictionScope', 'INVITEE_ONLY'
      ),
      'SYSTEM',
      v_code,
      v_now
    );
  end if;

  v_record := public.record_sybil_v2_assessment(
    v_code,
    v_network,
    'RESTRICTED',
    100,
    v_assessment.policy_version,
    v_assessment.analyzer_version,
    v_assessment.evidence_cutoff_block,
    v_assessment.required_checks,
    v_assessment.completed_checks,
    v_assessment.reason_codes ||
      jsonb_build_array('AUTO_VEPASSPORT_SAME_PASSPORT_RESTRICTION'),
    v_assessment.evidence_summary || jsonb_build_object(
      'automaticDecision', 'RESTRICT',
      'behaviorPattern', 'VEPASSPORT_SAME_IDENTITY_V1',
      'passportAddress', v_evidence.evidence ->> 'passport',
      'relatedWallet', v_evidence.related_wallet,
      'automaticDecidedAt', v_now
    ),
    'SYSTEM',
    v_assessment.revision
  );

  return jsonb_build_object(
    'changed', true,
    'state', 'RESTRICTED',
    'revision', v_record ->> 'revision',
    'reason', 'AUTO_VEPASSPORT_SAME_PASSPORT_RESTRICTION',
    'restrictedWallet', lower(v_invitation.invitee_wallet),
    'passportAddress', v_evidence.evidence ->> 'passport',
    'relatedWallet', v_evidence.related_wallet
  );
end;
$function$;

revoke all on function public.apply_sybil_v2_vepassport_same_passport_restriction(text,bigint,text)
from public, anon, authenticated;
grant execute on function public.apply_sybil_v2_vepassport_same_passport_restriction(text,bigint,text)
to service_role;
