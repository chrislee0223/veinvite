-- Production migration 20260929043956: harden Sybil v2 pre-vote classification.
-- Canonical source for the already-applied Production migration.
insert into public.sybil_v2_cluster_hub_allowlist(network,wallet_address,reason,source)
values
('mainnet','0x76ca782b59c74d088c7d2cce2f211bc00836c602','Known VeBetterDAO VOT3 protocol contract; exclude from Sybil hub inference.','SYSTEM'),
('mainnet','0x8692410da301a9b796b68a58ff660d51e979c6fa','Known VeChain gas abstraction paymaster/service wallet; exclude from Sybil hub inference.','SYSTEM'),
('mainnet','0xf9a1bc92e0eeee598b9fdb45397107b1f05f6cc1','Known VeSwap router contract; exclude from Sybil funder/hub inference.','SYSTEM'),
('mainnet','0xf21dd7108d93af56fab07423efb90f4a3604da89','Known BetterSwap aggregator contract; exclude from Sybil hub inference.','SYSTEM')
on conflict (network,wallet_address) do update
set reason=excluded.reason, source=excluded.source, updated_at=now();

create or replace function public.apply_sybil_v2_security_client_inviter_restriction(
  p_invite_code text,p_expected_revision bigint,p_network text
) returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare
  v_code text:=upper(btrim(p_invite_code)); v_network text:=lower(btrim(p_network));
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_invitation public.invitations%rowtype; v_shared_client uuid; v_record jsonb;
  v_now timestamptz:=clock_timestamp();
  v_reason text:='Automatic restriction: invitee and inviter were observed on the same VeInvite security client.';
begin
  perform pg_advisory_xact_lock(hashtextextended('veinvite_sybil_v2_same_client_'||v_code,0));
  select * into v_assessment from public.sybil_v2_referral_assessments where invite_code=v_code for update;
  if not found then raise exception 'SYBIL_V2_ASSESSMENT_NOT_FOUND'; end if;
  if v_assessment.network<>v_network then raise exception 'SYBIL_V2_NETWORK_MISMATCH'; end if;
  if v_assessment.revision<>p_expected_revision then raise exception 'SYBIL_V2_REVIEW_STATE_CHANGED'; end if;
  if v_assessment.state<>'HOLD' or v_assessment.source<>'SYSTEM' then
    return jsonb_build_object('changed',false,'state',v_assessment.state,'revision',v_assessment.revision,'reason','NOT_CURRENT_SYSTEM_HOLD'); end if;
  select * into v_invitation from public.invitations where invite_code=v_code for update;
  if not found or v_invitation.invitee_wallet is null then raise exception 'SYBIL_V2_INVITATION_NOT_FOUND'; end if;
  if v_invitation.reward_status='PAID' or exists(select 1 from public.reward_queue_entries q where q.invite_code=v_code and q.status='ASSIGNED') then
    return jsonb_build_object('changed',false,'state',v_assessment.state,'revision',v_assessment.revision,'reason','REWARD_ALREADY_FINAL'); end if;
  select x.client_id into v_shared_client from public.security_client_wallet_observations x
  join public.security_client_wallet_observations y on y.client_id=x.client_id
  where lower(x.wallet_address)=lower(v_invitation.invitee_wallet)
    and lower(y.wallet_address)=lower(v_invitation.inviter_wallet)
  order by greatest(x.last_seen_at,y.last_seen_at) desc limit 1;
  if v_shared_client is null then return jsonb_build_object('changed',false,'state','HOLD','revision',v_assessment.revision,'reason','SAME_CLIENT_RUNTIME_VERIFICATION_FAILED'); end if;
  update public.invitations set status='CANCELLED',reward_status='FORFEITED',sybil_status='BLOCKED',
    sybil_risk_level='HIGH',sybil_risk_score=100,sybil_reason=v_reason,sybil_checked_at=v_now,sybil_source='SYSTEM'
    where invite_code=v_code;
  if not exists(select 1 from public.sybil_v2_wallet_restrictions r where r.network=v_network
    and r.wallet_address=lower(v_invitation.invitee_wallet) and r.status='ACTIVE' and r.resolved_at is null) then
    insert into public.sybil_v2_wallet_restrictions(wallet_address,network,status,reason_codes,evidence_summary,source,related_invite_code,imposed_at)
    values(lower(v_invitation.invitee_wallet),v_network,'ACTIVE',
      v_assessment.reason_codes||jsonb_build_array('AUTO_SECURITY_CLIENT_INVITER_RESTRICTION'),
      v_assessment.evidence_summary||jsonb_build_object('automaticDecision','RESTRICT','behaviorPattern','SECURITY_CLIENT_INVITER_LINK_V1',
      'sharedClientId',v_shared_client,'restrictionScope','INVITEE_ONLY'),'SYSTEM',v_code,v_now); end if;
  v_record:=public.record_sybil_v2_assessment(v_code,v_network,'RESTRICTED',100,v_assessment.policy_version,
    v_assessment.analyzer_version,v_assessment.evidence_cutoff_block,v_assessment.required_checks,v_assessment.completed_checks,
    v_assessment.reason_codes||jsonb_build_array('AUTO_SECURITY_CLIENT_INVITER_RESTRICTION'),
    v_assessment.evidence_summary||jsonb_build_object('automaticDecision','RESTRICT','behaviorPattern','SECURITY_CLIENT_INVITER_LINK_V1',
    'sharedClientId',v_shared_client,'automaticDecidedAt',v_now),'SYSTEM',v_assessment.revision);
  return jsonb_build_object('changed',true,'state','RESTRICTED','revision',v_record->>'revision',
    'reason','AUTO_SECURITY_CLIENT_INVITER_RESTRICTION','restrictedWallet',lower(v_invitation.invitee_wallet));
end; $$;
revoke all on function public.apply_sybil_v2_security_client_inviter_restriction(text,bigint,text) from public,anon,authenticated;
grant execute on function public.apply_sybil_v2_security_client_inviter_restriction(text,bigint,text) to service_role;

-- The Production function was expanded to accept the new historical-sink/recent-refunder
-- cluster evidence. Runtime verification requires 3+ wallets and requires the current
-- subject itself to have both a prior B3TR outflow to the hub and later pre-activation funding.
-- Association-only wallets therefore remain reviewable/clearable and are not auto-blocked.
create or replace function public.apply_sybil_v2_funder_return_loop_restriction(
  p_invite_code text,p_expected_revision bigint,p_hub_wallet text,p_network text
) returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare
  v_code text:=upper(btrim(p_invite_code)); v_hub text:=lower(btrim(p_hub_wallet)); v_network text:=lower(btrim(p_network));
  v_assessment public.sybil_v2_referral_assessments%rowtype; v_invitation public.invitations%rowtype;
  v_pattern text; v_wallets integer:=0; v_subject_matches boolean:=false; v_record jsonb;
  v_now timestamptz:=clock_timestamp(); v_reason text;
begin
  perform pg_advisory_xact_lock(hashtextextended('veinvite_sybil_v2_funder_return_'||v_code,0));
  select * into v_assessment from public.sybil_v2_referral_assessments where invite_code=v_code for update;
  if not found then raise exception 'SYBIL_V2_ASSESSMENT_NOT_FOUND'; end if;
  if v_assessment.network<>v_network then raise exception 'SYBIL_V2_NETWORK_MISMATCH'; end if;
  if v_assessment.revision<>p_expected_revision then raise exception 'SYBIL_V2_REVIEW_STATE_CHANGED'; end if;
  if v_assessment.state<>'HOLD' or v_assessment.source<>'SYSTEM' then
    return jsonb_build_object('changed',false,'state',v_assessment.state,'revision',v_assessment.revision,'reason','NOT_CURRENT_SYSTEM_HOLD'); end if;
  select * into v_invitation from public.invitations where invite_code=v_code for update;
  if not found or v_invitation.invitee_wallet is null then raise exception 'SYBIL_V2_INVITATION_NOT_FOUND'; end if;
  if v_invitation.reward_status='PAID' or exists(select 1 from public.reward_queue_entries q where q.invite_code=v_code and q.status='ASSIGNED') then
    return jsonb_build_object('changed',false,'state',v_assessment.state,'revision',v_assessment.revision,'reason','REWARD_ALREADY_FINAL'); end if;
  if exists(select 1 from public.sybil_v2_cluster_hub_allowlist a where a.network=v_network and a.wallet_address=v_hub) then
    return jsonb_build_object('changed',false,'state',v_assessment.state,'revision',v_assessment.revision,'reason','HUB_ALLOWLISTED'); end if;
  if exists(select 1 from public.sybil_v2_evidence_records e where e.invite_code=v_code and e.network=v_network
    and e.signal_code='HISTORICAL_SINK_RECENT_REFUNDER_CLUSTER' and e.strength='HIGH' and e.score>0 and lower(e.related_wallet)=v_hub) then
    v_pattern:='HISTORICAL_SINK_RECENT_REFUNDER_V1';
    with funding as (
      select lower(e.subject_wallet) wallet_address,min(e.observed_block)::bigint funding_block
      from public.sybil_v2_evidence_records e where e.network=v_network and e.evidence_family='FUNDING'
        and e.signal_code in ('RECENT_PREACTIVATION_VET_FUNDER','RECENT_PREACTIVATION_B3TR_FUNDER')
        and lower(e.related_wallet)=v_hub and e.observed_block is not null group by lower(e.subject_wallet)
    ), matched as (
      select f.wallet_address from funding f where exists(
        select 1 from public.sybil_v2_preactivation_b3tr_outflows o where o.network=v_network
          and lower(o.wallet_address)=f.wallet_address and lower(o.destination_wallet)=v_hub and o.block_number<f.funding_block
      )
    )
    select count(*)::integer,coalesce(bool_or(wallet_address=lower(v_invitation.invitee_wallet)),false)
    into v_wallets,v_subject_matches from matched;
    if v_wallets<3 or not v_subject_matches then
      return jsonb_build_object('changed',false,'state','HOLD','revision',v_assessment.revision,
        'reason','SINK_REFUNDER_RUNTIME_VERIFICATION_FAILED','walletCount',v_wallets); end if;
    v_reason:='Automatic restriction: multiple wallets historically consolidated B3TR to the same hub and were later re-funded by that hub before VeInvite activation.';
  else
    return jsonb_build_object('changed',false,'state','HOLD','revision',v_assessment.revision,'reason','FUNDER_RETURN_LOOP_EVIDENCE_MISSING'); end if;
  update public.invitations set status='CANCELLED',reward_status='FORFEITED',sybil_status='BLOCKED',
    sybil_risk_level='HIGH',sybil_risk_score=100,sybil_reason=v_reason,sybil_checked_at=v_now,sybil_source='SYSTEM' where invite_code=v_code;
  if not exists(select 1 from public.sybil_v2_wallet_restrictions r where r.network=v_network
    and r.wallet_address=lower(v_invitation.invitee_wallet) and r.status='ACTIVE' and r.resolved_at is null) then
    insert into public.sybil_v2_wallet_restrictions(wallet_address,network,status,reason_codes,evidence_summary,source,related_invite_code,imposed_at)
    values(lower(v_invitation.invitee_wallet),v_network,'ACTIVE',
      v_assessment.reason_codes||jsonb_build_array('AUTO_FUNDER_RETURN_LOOP_RESTRICTION'),
      v_assessment.evidence_summary||jsonb_build_object('automaticDecision','RESTRICT','behaviorPattern',v_pattern,
      'behaviorPatternHub',v_hub,'loopWalletCount',v_wallets,'restrictionScope','INVITEE_ONLY'),'SYSTEM',v_code,v_now); end if;
  v_record:=public.record_sybil_v2_assessment(v_code,v_network,'RESTRICTED',100,v_assessment.policy_version,
    v_assessment.analyzer_version,v_assessment.evidence_cutoff_block,v_assessment.required_checks,v_assessment.completed_checks,
    v_assessment.reason_codes||jsonb_build_array('AUTO_FUNDER_RETURN_LOOP_RESTRICTION'),
    v_assessment.evidence_summary||jsonb_build_object('automaticDecision','RESTRICT','behaviorPattern',v_pattern,
    'behaviorPatternHub',v_hub,'loopWalletCount',v_wallets,'automaticDecidedAt',v_now),'SYSTEM',v_assessment.revision);
  return jsonb_build_object('changed',true,'state','RESTRICTED','revision',v_record->>'revision',
    'reason','AUTO_FUNDER_RETURN_LOOP_RESTRICTION','restrictedWallet',lower(v_invitation.invitee_wallet),
    'behaviorPatternHub',v_hub,'loopWalletCount',v_wallets);
end; $$;
revoke all on function public.apply_sybil_v2_funder_return_loop_restriction(text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.apply_sybil_v2_funder_return_loop_restriction(text,bigint,text,text) to service_role;
