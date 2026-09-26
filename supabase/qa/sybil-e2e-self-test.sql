-- Preview-only QA helper.
-- Install this file only on the reviewed Preview Supabase project.
-- It must never be added to supabase/migrations or installed on Production.

create or replace function public.run_sybil_e2e_qa()
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_inviter constant text := '0x1111111111111111111111111111111111111111';
  v_codes constant text[] := array['QA2E2E2','QA3E3E3','QA4E4E4','QA5E5E5'];
  v_wallets constant text[] := array[
    '0x2222222222222222222222222222222222222222',
    '0x3333333333333333333333333333333333333333',
    '0x4444444444444444444444444444444444444444',
    '0x5555555555555555555555555555555555555555'
  ];
  v_report jsonb := '{}'::jsonb;
  v_error text := null;
  v_passed boolean := false;
  v_residue bigint := 0;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_sybil_e2e_qa', 0)
  );

  if exists (
    select 1
    from public.invitations i
    where i.invite_code = any(v_codes)
  ) then
    return jsonb_build_object(
      'mode','PREVIEW_SYBIL_E2E',
      'passed',false,
      'writesRolledBack',false,
      'transfersPerformed',false,
      'error','QA fixture collision: reserved invite code already exists.'
    );
  end if;

  begin
    insert into public.invitations(
      invite_code,inviter_wallet,invitee_wallet,status,reward_status,
      sybil_status,sybil_risk_level,sybil_risk_score,sybil_source,activation_network
    )
    select
      v_codes[g],v_inviter,v_wallets[g],
      'ACTIVATING','PENDING','NOT_CHECKED','NONE',0,'SYSTEM','testnet'
    from generate_series(1,4) as g;

    insert into public.sybil_v2_referral_assessments(
      invite_code,network,state,risk_score,policy_version,analyzer_version,revision,
      required_checks,completed_checks,reason_codes,evidence_summary,source
    ) values (
      v_codes[1],'testnet','HOLD',80,'qa-e2e-v1','qa-e2e-v1',1,
      '["SECURITY_CLIENT"]'::jsonb,'["SECURITY_CLIENT"]'::jsonb,
      '["QA_HOLD"]'::jsonb,'{"qa":true}'::jsonb,'SYSTEM'
    );

    update public.sybil_v2_referral_assessments
    set revision = revision
    where invite_code = v_codes[1];

    perform public.record_invite_security_notification(
      v_codes[1],'SECURITY_REVIEW_STARTED','qa-e2e-dedupe',clock_timestamp()
    );
    perform public.record_invite_security_notification(
      v_codes[1],'SECURITY_REVIEW_STARTED','qa-e2e-dedupe',clock_timestamp()
    );

    perform public.set_invitation_sybil_decision(
      v_codes[1],'BLOCKED','HIGH','QA confirmed abuse',95
    );

    for g in 1..4 loop
      insert into public.sybil_v2_wallet_restrictions(
        wallet_address,network,status,reason_codes,evidence_summary,source,related_invite_code
      ) values (
        v_wallets[g],'testnet','ACTIVE',
        '["QA_CONFIRMED"]'::jsonb,'{"qa":true}'::jsonb,'OPERATOR',v_codes[g]
      );
    end loop;

    v_report := jsonb_build_object(
      'holdReviewNotificationCount',
        (select count(*) from public.invite_notification_history h
          where h.invite_code = v_codes[1]
            and h.kind = 'SECURITY_REVIEW_STARTED'
            and h.dedupe_key like 'security-v2:%'),
      'explicitDedupeCount',
        (select count(*) from public.invite_notification_history h
          where h.invite_code = v_codes[1]
            and h.dedupe_key =
              'security-v2:' || v_codes[1] ||
              ':SECURITY_REVIEW_STARTED:qa-e2e-dedupe'),
      'blockedStatus',
        (select i.status from public.invitations i where i.invite_code = v_codes[1]),
      'blockedRewardStatus',
        (select i.reward_status from public.invitations i where i.invite_code = v_codes[1]),
      'blockedSybilStatus',
        (select i.sybil_status from public.invitations i where i.invite_code = v_codes[1]),
      'slotReleased',
        (select i.slot_released_at is not null from public.invitations i where i.invite_code = v_codes[1]),
      'activeRewardRows',
        (select count(*) from public.reward_queue_entries q
          where q.invite_code = v_codes[1]
            and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')),
      'payoutRows',
        (select count(*) from public.reward_payouts rp where rp.invite_code = v_codes[1]),
      'inviterIncidentCount',
        (select count(*) from public.sybil_v2_inviter_incidents ii
          where ii.network = 'testnet'
            and ii.inviter_wallet = v_inviter
            and ii.invite_code = any(v_codes)),
      'inviterPosture',
        (select p.posture from public.operator_sybil_v2_inviter_postures p
          where p.network = 'testnet' and p.inviter_wallet = v_inviter),
      'inviterWatchNotifications',
        (select count(*) from public.invite_notification_history h
          where h.invite_code = any(v_codes)
            and h.kind = 'SECURITY_INVITER_WATCH'),
      'inviterHoldNotifications',
        (select count(*) from public.invite_notification_history h
          where h.invite_code = any(v_codes)
            and h.kind = 'SECURITY_INVITER_HOLD')
    );

    v_passed :=
      (v_report->>'holdReviewNotificationCount')::int = 2
      and (v_report->>'explicitDedupeCount')::int = 1
      and v_report->>'blockedStatus' = 'CANCELLED'
      and v_report->>'blockedRewardStatus' = 'FORFEITED'
      and v_report->>'blockedSybilStatus' = 'BLOCKED'
      and (v_report->>'slotReleased')::boolean
      and (v_report->>'activeRewardRows')::int = 0
      and (v_report->>'payoutRows')::int = 0
      and (v_report->>'inviterIncidentCount')::int = 4
      and v_report->>'inviterPosture' = 'HOLD'
      and (v_report->>'inviterWatchNotifications')::int = 1
      and (v_report->>'inviterHoldNotifications')::int = 1;

    raise exception 'QA_E2E_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'QA_E2E_ROLLBACK' then
        v_error := sqlerrm;
        v_passed := false;
      end if;
  end;

  select count(*)::bigint
  into v_residue
  from public.invitations i
  where i.invite_code = any(v_codes);

  return jsonb_build_object(
    'mode','PREVIEW_SYBIL_E2E',
    'passed',v_passed and v_error is null and v_residue = 0,
    'writesRolledBack',v_residue = 0,
    'transfersPerformed',false,
    'fixtureResidue',v_residue,
    'error',v_error,
    'checks',v_report
  );
end;
$$;

revoke all on function public.run_sybil_e2e_qa()
  from public, anon, authenticated;
grant execute on function public.run_sybil_e2e_qa()
  to service_role;

comment on function public.run_sybil_e2e_qa() is
  'Preview-only Sybil lifecycle QA. Exercises real invitation/Sybil/notification triggers inside a rolled-back subtransaction and never invokes token transfer code.';
