-- Preserve operator transition lock order during owner-only appeal intake.
-- No table changes, no payout/referral or Sybil verdict changes.
-- HOLD: assessment -> invitation
-- BLACKLIST: restriction -> invitation -> assessment
create or replace function public.submit_sybil_v2_appeal(
  p_invite_code text,
  p_network text,
  p_wallet_address text,
  p_expected_revision bigint,
  p_category text,
  p_explanation text
)
returns table(submitted boolean, already_submitted boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_assessment record;
  v_invitation record;
  v_wallet text;
  v_kind text;
  v_inserted uuid;
  v_state_preview text;
  v_locked_restriction_id uuid;
begin
  v_wallet := lower(btrim(p_wallet_address));
  if p_network not in ('mainnet','testnet')
     or p_invite_code !~ '^[A-HJ-NP-Z2-9]{7}$'
     or v_wallet !~ '^0x[0-9a-f]{40}$'
     or p_expected_revision is null or p_expected_revision <= 0
     or p_category not in (
       'DISTINCT_PERSON_SHARED_DEVICE','INCORRECT_IDENTITY_LINK','MISSING_ACTIVITY','OTHER'
     )
     or char_length(btrim(coalesce(p_explanation,''))) not between 25 and 600 then
    raise exception 'SYBIL_APPEAL_INVALID_INPUT';
  end if;

  -- Different operator transitions lock different row orders:
  -- HOLD decision: assessment -> invitation.
  -- BLACKLIST REINSTATE: wallet restriction -> invitation -> assessment.
  -- Mirror those orders so an appeal and an operator transition cannot
  -- deadlock each other. This preview is untrusted: recheck every row
  -- after acquiring the locks and reject a changed state.
  select a.state into v_state_preview
  from public.sybil_v2_referral_assessments a
  where a.invite_code=p_invite_code and a.network=p_network;

  if v_state_preview = 'RESTRICTED' then
    select r.id into v_locked_restriction_id
    from public.sybil_v2_wallet_restrictions r
    where r.wallet_address=v_wallet
      and r.network=p_network
      and r.status='ACTIVE'
      and r.related_invite_code=p_invite_code
    order by r.imposed_at desc
    limit 1
    for share;

    select i.invitee_wallet,i.activation_network into v_invitation
    from public.invitations i where i.invite_code=p_invite_code
    for share;
    select a.state,a.revision,a.network into v_assessment
    from public.sybil_v2_referral_assessments a
    where a.invite_code=p_invite_code and a.network=p_network
    for share;
  elsif v_state_preview = 'HOLD' then
    select a.state,a.revision,a.network into v_assessment
    from public.sybil_v2_referral_assessments a
    where a.invite_code=p_invite_code and a.network=p_network
    for share;
    select i.invitee_wallet,i.activation_network into v_invitation
    from public.invitations i where i.invite_code=p_invite_code
    for share;
  else
    raise exception 'SYBIL_APPEAL_CASE_CHANGED';
  end if;

  if v_assessment.revision is null
     or v_invitation.invitee_wallet is null
     or lower(v_invitation.invitee_wallet) <> v_wallet
     or v_invitation.activation_network <> p_network
     or v_assessment.revision <> p_expected_revision then
    raise exception 'SYBIL_APPEAL_CASE_CHANGED';
  end if;

  if v_locked_restriction_id is not null
     and v_assessment.state='RESTRICTED' then
    v_kind := 'BLACKLIST';
  elsif exists (
    select 1 from public.operator_sybil_v2_temporary_participation_holds h
     where h.wallet_address=v_wallet
       and h.network=p_network
       and h.restriction_kind='PRE_CLAIM_HOLD'
       and h.related_invite_code=p_invite_code
  ) and v_assessment.state='HOLD' then
    v_kind := 'PRE_CLAIM_HOLD';
  else
    raise exception 'SYBIL_APPEAL_NO_ACTIVE_CASE';
  end if;

  insert into public.sybil_v2_appeal_requests (
    invite_code,network,wallet_address,assessment_revision,
    restriction_kind,category,explanation
  ) values (
    p_invite_code,p_network,v_wallet,p_expected_revision,
    v_kind,p_category,btrim(p_explanation)
  )
  on conflict on constraint sybil_v2_appeal_requests_once_per_revision
    do nothing
  returning id into v_inserted;

  return query select (v_inserted is not null), (v_inserted is null);
end;
$function$;

revoke all on function public.submit_sybil_v2_appeal(text,text,text,bigint,text,text)
  from public,anon,authenticated;
grant execute on function public.submit_sybil_v2_appeal(text,text,text,bigint,text,text)
  to service_role;

