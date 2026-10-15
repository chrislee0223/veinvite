create or replace function public.read_reward_x_promotion_financial_integrity_audit_v1(
  p_network text
)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog','public'
as $function$
declare
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_live_splits integer := 0;
  v_split_calculation integer := 0;
  v_queue_binding integer := 0;
  v_source_binding integer := 0;
  v_obligation_binding integer := 0;
  v_core_payout_amount integer := 0;
  v_core_paid_without_receipt integer := 0;
  v_signed_without_submission integer := 0;
  v_submission_without_signed integer := 0;
  v_released_with_signed_commit integer := 0;
  v_intent_verification integer := 0;
  v_settlement_without_receipt integer := 0;
  v_receipt_without_paid_obligation integer := 0;
  v_paid_obligation_without_receipt integer := 0;
  v_receipt_binding integer := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where s.reservation_amount_wei<>s.base_amount_wei+s.promotion_amount_wei
         or s.base_amount_wei<>c.base_amount_wei
         or s.promotion_amount_wei<>c.promotion_amount_wei
         or s.promotion_rate_bps<>c.promotion_rate_bps
         or s.promotion_cap_wei<>c.promotion_cap_wei
    )::integer,
    count(*) filter (
      where q.id is null
         or q.id is distinct from s.queue_entry_id
         or q.invite_code is distinct from s.invite_code
         or q.network is distinct from s.network
         or lower(q.recipient_wallet) is distinct from s.recipient_wallet
         or q.reserved_amount_wei is distinct from s.reservation_amount_wei
         or q.reserved_at is null
    )::integer,
    count(*) filter (
      where i.invite_code is null
         or i.activation_network is distinct from s.network
         or lower(i.inviter_wallet) is distinct from s.recipient_wallet
         or i.reward_cohort_round_id is distinct from s.source_reward_cohort_round_id
         or i.reward_funding_allocation_receipt_id is distinct from s.source_allocation_receipt_id
    )::integer
  into
    v_live_splits,
    v_split_calculation,
    v_queue_binding,
    v_source_binding
  from public.reward_x_promotion_splits s
  left join public.reward_queue_entries q
    on q.id=s.queue_entry_id
  left join public.invitations i
    on i.invite_code=s.invite_code
  left join lateral public.calculate_reward_x_promotion_split_v1(
    s.reservation_amount_wei
  ) c on true
  where s.network=v_network
    and s.mode='LIVE';

  select count(*)::integer
  into v_obligation_binding
  from public.reward_x_promotion_splits s
  left join public.reward_x_promotion_obligations o
    on o.split_id=s.id
  where s.network=v_network
    and s.mode='LIVE'
    and (
      (
        s.promotion_amount_wei>0
        and (
          o.id is null
          or o.invite_code is distinct from s.invite_code
          or o.network is distinct from s.network
          or o.recipient_wallet is distinct from s.recipient_wallet
          or o.promotion_amount_wei is distinct from s.promotion_amount_wei
          or o.source_reward_cohort_round_id is distinct from s.source_reward_cohort_round_id
          or o.source_allocation_receipt_id is distinct from s.source_allocation_receipt_id
          or o.policy_version is distinct from s.policy_version
        )
      )
      or (
        s.promotion_amount_wei=0
        and o.id is not null
      )
    );

  select count(*)::integer
  into v_core_payout_amount
  from public.reward_x_promotion_splits s
  join public.reward_payouts p
    on p.invite_code=s.invite_code
  where s.network=v_network
    and s.mode='LIVE'
    and (
      lower(p.recipient_wallet) is distinct from s.recipient_wallet
      or p.amount_wei is distinct from s.base_amount_wei
    );

  select count(*)::integer
  into v_core_paid_without_receipt
  from public.reward_x_promotion_splits s
  join public.reward_payouts p
    on p.invite_code=s.invite_code
   and p.status='PAID'
  where s.network=v_network
    and s.mode='LIVE'
    and not exists (
      select 1
      from public.reward_receipts r
      where r.payout_id=p.id
        and r.invite_code=s.invite_code
        and r.network=s.network
        and r.recipient_wallet=s.recipient_wallet
        and r.amount_wei=s.base_amount_wei
        and r.tx_id=p.tx_id
        and r.paid_at is not null
    );

  select count(*)::integer
  into v_signed_without_submission
  from public.reward_x_promotion_payout_signed_transactions st
  join public.reward_x_promotion_payout_intents pi
    on pi.id=st.intent_id
  where st.network=v_network
    and not exists (
      select 1
      from public.reward_x_promotion_payout_submissions ps
      where ps.signed_transaction_id=st.id
        and ps.intent_id=st.intent_id
        and ps.manifest_id=st.manifest_id
        and ps.manifest_hash=st.manifest_hash
        and ps.tx_id=st.tx_id
        and ps.operator_wallet=st.operator_wallet
        and ps.network=st.network
    );

  select count(*)::integer
  into v_submission_without_signed
  from public.reward_x_promotion_payout_submissions ps
  where ps.network=v_network
    and not exists (
      select 1
      from public.reward_x_promotion_payout_signed_transactions st
      where st.id=ps.signed_transaction_id
        and st.intent_id=ps.intent_id
        and st.manifest_id=ps.manifest_id
        and st.manifest_hash=ps.manifest_hash
        and st.tx_id=ps.tx_id
        and st.operator_wallet=ps.operator_wallet
        and st.network=ps.network
    );

  select count(*)::integer
  into v_released_with_signed_commit
  from public.reward_x_promotion_obligations o
  where o.network=v_network
    and o.financial_state='RELEASED'
    and exists (
      select 1
      from public.reward_x_promotion_payout_intents pi
      join public.reward_x_promotion_payout_signed_transactions st
        on st.intent_id=pi.id
      where pi.obligation_id=o.id
        and pi.network=o.network
    );

  select count(*)::integer
  into v_intent_verification
  from public.reward_x_promotion_payout_intents pi
  left join public.reward_x_promotion_post_verifications pv
    on pv.id=pi.verification_id
  left join public.reward_x_promotion_obligations o
    on o.id=pi.obligation_id
  left join public.reward_x_promotion_splits s
    on s.id=pi.split_id
  where pi.network=v_network
    and (
      pv.id is null
      or pv.verification_state<>'FINAL_VERIFIED'
      or pv.invalidated_at is not null
      or pv.obligation_id<>pi.obligation_id
      or pv.split_id<>pi.split_id
      or pv.invite_code<>pi.invite_code
      or pv.network<>pi.network
      or pv.recipient_wallet<>pi.recipient_wallet
      or pv.x_post_id<>pi.x_post_id
      or pv.x_author_id<>pi.x_author_id
      or o.id is null
      or s.id is null
      or o.split_id<>s.id
      or o.invite_code<>pi.invite_code
      or o.network<>pi.network
      or o.recipient_wallet<>pi.recipient_wallet
      or o.promotion_amount_wei<>pi.amount_wei
      or s.promotion_amount_wei<>pi.amount_wei
      or pi.source_reward_cohort_round_id<>s.source_reward_cohort_round_id
      or pi.source_allocation_receipt_id<>s.source_allocation_receipt_id
      or pi.policy_version<>s.policy_version
    );

  select count(*)::integer
  into v_settlement_without_receipt
  from public.reward_x_promotion_payout_settlements ps
  join public.reward_x_promotion_payout_intents pi
    on pi.id=ps.intent_id
  where ps.network=v_network
    and not exists (
      select 1
      from public.reward_x_promotion_receipts r
      where r.settlement_id=ps.id
        and r.intent_id=ps.intent_id
        and r.network=ps.network
        and r.tx_id=ps.tx_id
        and r.invite_code=pi.invite_code
        and r.recipient_wallet=pi.recipient_wallet
        and r.amount_wei=pi.amount_wei
        and r.public_proof_id=pi.public_proof_id
        and r.paid_at=ps.paid_at
    );

  select count(*)::integer
  into v_receipt_without_paid_obligation
  from public.reward_x_promotion_receipts r
  left join public.reward_x_promotion_obligations o
    on o.id=r.obligation_id
  where r.network=v_network
    and (
      o.id is null
      or o.financial_state<>'PAID'
      or o.paid_at is null
    );

  select count(*)::integer
  into v_paid_obligation_without_receipt
  from public.reward_x_promotion_obligations o
  where o.network=v_network
    and o.financial_state='PAID'
    and not exists (
      select 1
      from public.reward_x_promotion_receipts r
      where r.obligation_id=o.id
        and r.invite_code=o.invite_code
        and r.network=o.network
        and r.recipient_wallet=o.recipient_wallet
        and r.amount_wei=o.promotion_amount_wei
        and r.paid_at=o.paid_at
    );

  select count(*)::integer
  into v_receipt_binding
  from public.reward_x_promotion_receipts r
  left join public.reward_x_promotion_payout_intents pi
    on pi.id=r.intent_id
  left join public.reward_x_promotion_payout_settlements ps
    on ps.id=r.settlement_id
  left join public.reward_x_promotion_obligations o
    on o.id=r.obligation_id
  left join public.reward_x_promotion_splits s
    on s.id=r.split_id
  where r.network=v_network
    and (
      pi.id is null
      or ps.id is null
      or o.id is null
      or s.id is null
      or pi.obligation_id<>r.obligation_id
      or pi.split_id<>r.split_id
      or pi.invite_code<>r.invite_code
      or pi.network<>r.network
      or pi.recipient_wallet<>r.recipient_wallet
      or pi.amount_wei<>r.amount_wei
      or pi.public_proof_id<>r.public_proof_id
      or pi.x_post_id<>r.x_post_id
      or pi.x_author_id<>r.x_author_id
      or ps.intent_id<>r.intent_id
      or ps.tx_id<>r.tx_id
      or ps.network<>r.network
      or ps.paid_at<>r.paid_at
      or o.split_id<>r.split_id
      or o.invite_code<>r.invite_code
      or o.network<>r.network
      or o.recipient_wallet<>r.recipient_wallet
      or o.promotion_amount_wei<>r.amount_wei
      or o.source_reward_cohort_round_id<>r.source_reward_cohort_round_id
      or o.source_allocation_receipt_id<>r.source_allocation_receipt_id
      or s.invite_code<>r.invite_code
      or s.network<>r.network
      or s.recipient_wallet<>r.recipient_wallet
      or s.promotion_amount_wei<>r.amount_wei
      or s.source_reward_cohort_round_id<>r.source_reward_cohort_round_id
      or s.source_allocation_receipt_id<>r.source_allocation_receipt_id
    );

  return jsonb_build_object(
    'ok',
      v_split_calculation=0
      and v_queue_binding=0
      and v_source_binding=0
      and v_obligation_binding=0
      and v_core_payout_amount=0
      and v_core_paid_without_receipt=0
      and v_signed_without_submission=0
      and v_submission_without_signed=0
      and v_released_with_signed_commit=0
      and v_intent_verification=0
      and v_settlement_without_receipt=0
      and v_receipt_without_paid_obligation=0
      and v_paid_obligation_without_receipt=0
      and v_receipt_binding=0,
    'network',v_network,
    'liveSplitCount',v_live_splits,
    'violations',jsonb_build_object(
      'splitCalculation',v_split_calculation,
      'queueBinding',v_queue_binding,
      'sourceBinding',v_source_binding,
      'obligationBinding',v_obligation_binding,
      'corePayoutAmount',v_core_payout_amount,
      'corePaidWithoutReceipt',v_core_paid_without_receipt,
      'signedWithoutSubmission',v_signed_without_submission,
      'submissionWithoutSigned',v_submission_without_signed,
      'releasedWithSignedCommit',v_released_with_signed_commit,
      'intentVerification',v_intent_verification,
      'settlementWithoutReceipt',v_settlement_without_receipt,
      'receiptWithoutPaidObligation',v_receipt_without_paid_obligation,
      'paidObligationWithoutReceipt',v_paid_obligation_without_receipt,
      'receiptBinding',v_receipt_binding
    )
  );
end;
$function$;

revoke all on function public.read_reward_x_promotion_financial_integrity_audit_v1(text)
  from public,anon,authenticated;
grant execute on function public.read_reward_x_promotion_financial_integrity_audit_v1(text)
  to service_role;

comment on function public.read_reward_x_promotion_financial_integrity_audit_v1(text) is
  'Read-only financial invariant audit across LIVE X promotion split, core base payout, obligation, signed transaction, settlement, and receipt state.';
