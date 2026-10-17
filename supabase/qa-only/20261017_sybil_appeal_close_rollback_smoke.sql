-- QA-ONLY reversible synthetic closure test: no persistent referral, appeal,
-- assessment, reward, wallet restriction or review event mutation.
do $test$
declare
  v_error text;
  v_id uuid;
  v_result record;
begin
  begin
    insert into public.invitations
      (invite_code,inviter_wallet,invitee_wallet,status,activation_network)
    values (
      'QA7CLSS',
      '0x6666666666666666666666666666666666666666',
      '0x7777777777777777777777777777777777777777',
      'ACTIVATING','testnet'
    );
    insert into public.sybil_v2_referral_assessments
      (invite_code,network,state,revision,policy_version,analyzer_version,reason_codes,evidence_summary,source)
    values (
      'QA7CLSS','testnet','HOLD',1,'qa-synthetic','qa-synthetic',
      '["QA_SYNTHETIC"]'::jsonb,'{}'::jsonb,'SYSTEM'
    );
    perform * from public.submit_sybil_v2_appeal(
      'QA7CLSS','testnet','0x7777777777777777777777777777777777777777',
      1,'OTHER','This is a synthetic QA owner review request, never a real claim.'
    );
    select id into v_id from public.sybil_v2_appeal_requests
     where invite_code='QA7CLSS';
    if v_id is null then raise exception 'MISSING_TEST_REQUEST'; end if;

    begin
      perform * from public.close_sybil_v2_owner_appeal(
        v_id,'testnet',1,'0x8888888888888888888888888888888888888888',
        'CASE_VERDICT_CHANGED',
        'No new persisted Sybil decision exists: reject this outcome.'
      );
      raise exception 'FALSE_VERDICT_CHANGE_ACCEPTED';
    exception when others then
      get stacked diagnostics v_error=message_text;
      if v_error <> 'SYBIL_APPEAL_VERDICT_NOT_CHANGED' then
        raise exception 'FALSE_VERDICT_GUARD_FAILED: %',v_error;
      end if;
    end;

    select * into v_result from public.close_sybil_v2_owner_appeal(
      v_id,'testnet',1,'0x8888888888888888888888888888888888888888',
      'UPHELD_RESTRICTION',
      'QA evidence review was completed and the existing HOLD remains unchanged.'
    );
    if not v_result.closed or v_result.final_status <> 'RESOLVED' then
      raise exception 'VALID_CLOSE_NOT_RECORDED';
    end if;
    if (select count(*) from public.sybil_v2_appeal_review_events where appeal_id=v_id) <> 1 then
      raise exception 'AUDIT_EVENT_COUNT_INVALID';
    end if;
    if (select state from public.sybil_v2_referral_assessments where invite_code='QA7CLSS') <> 'HOLD' then
      raise exception 'UNDERLYING_VERDICT_MUTATED';
    end if;
    begin
      perform * from public.close_sybil_v2_owner_appeal(
        v_id,'testnet',1,'0x8888888888888888888888888888888888888888',
        'UPHELD_RESTRICTION',
        'Repeated closure must fail rather than produce a second audit event.'
      );
      raise exception 'DUPLICATE_CLOSE_ACCEPTED';
    exception when others then
      get stacked diagnostics v_error=message_text;
      if v_error <> 'SYBIL_APPEAL_ALREADY_RESOLVED' then
        raise exception 'DUPLICATE_GUARD_FAILED: %',v_error;
      end if;
    end;
    raise exception 'ROLLBACK_ALL_SYNTHETIC_DATA';
  exception when others then
    get stacked diagnostics v_error=message_text;
    if v_error <> 'ROLLBACK_ALL_SYNTHETIC_DATA' then
      raise exception 'QA_APPEAL_DISPOSITION_SMOKE_FAILED: %',v_error;
    end if;
  end;
end
$test$;
select
  (select count(*) from public.invitations where invite_code='QA7CLSS') as synthetic_invites_left,
  (select count(*) from public.sybil_v2_appeal_requests where invite_code='QA7CLSS') as synthetic_appeals_left,
  (select count(*) from public.sybil_v2_appeal_review_events) as persisted_audit_rows;