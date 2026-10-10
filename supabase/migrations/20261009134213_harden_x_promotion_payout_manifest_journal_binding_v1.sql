
do $$
declare
  v_enabled boolean;
  v_journal_rows bigint;
begin
  select reward_x_promotion_enabled
  into v_enabled
  from public.reward_runtime_config
  where id=1;

  if coalesce(v_enabled,false) then
    raise exception 'REWARD_X_PROMOTION_MANIFEST_BINDING_REQUIRES_LIVE_DISABLED';
  end if;

  select
    (select count(*) from public.reward_x_promotion_payout_checkpoints) +
    (select count(*) from public.reward_x_promotion_payout_signed_transactions) +
    (select count(*) from public.reward_x_promotion_payout_submissions) +
    (select count(*) from public.reward_x_promotion_payout_settlements) +
    (select count(*) from public.reward_x_promotion_receipts)
  into v_journal_rows;

  if v_journal_rows<>0 then
    raise exception 'REWARD_X_PROMOTION_MANIFEST_BINDING_REQUIRES_EMPTY_JOURNAL';
  end if;
end $$;

alter table public.reward_x_promotion_payout_checkpoints
  add column manifest_id bigint not null
    references public.reward_x_promotion_payout_manifests(id) on delete restrict,
  add column manifest_hash text not null
    check (manifest_hash ~ '^0x[0-9a-f]{64}$'),
  add constraint reward_x_promotion_payout_checkpoints_manifest_uidx
    unique(manifest_id);

alter table public.reward_x_promotion_payout_signed_transactions
  add column manifest_id bigint not null
    references public.reward_x_promotion_payout_manifests(id) on delete restrict,
  add column manifest_hash text not null
    check (manifest_hash ~ '^0x[0-9a-f]{64}$'),
  add constraint reward_x_promotion_payout_signed_manifest_uidx
    unique(manifest_id);

alter table public.reward_x_promotion_payout_submissions
  add column manifest_id bigint not null
    references public.reward_x_promotion_payout_manifests(id) on delete restrict,
  add column manifest_hash text not null
    check (manifest_hash ~ '^0x[0-9a-f]{64}$'),
  add constraint reward_x_promotion_payout_submission_manifest_uidx
    unique(manifest_id);

create or replace function public.create_reward_x_promotion_payout_checkpoint_v1(
  p_intent_id bigint,
  p_block_id text,
  p_block_number bigint,
  p_block_timestamp bigint
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_intent public.reward_x_promotion_payout_intents%rowtype;
  v_manifest public.reward_x_promotion_payout_manifests%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_verification public.reward_x_promotion_post_verifications%rowtype;
  v_existing public.reward_x_promotion_payout_checkpoints%rowtype;
  v_cfg public.reward_runtime_config%rowtype;
begin
  p_block_id:=lower(btrim(coalesce(p_block_id,'')));

  if p_intent_id is null or p_intent_id<1 then
    raise exception 'REWARD_X_PROMOTION_INTENT_ID_INVALID';
  end if;
  if p_block_id !~ '^0x[0-9a-f]{64}$'
     or p_block_number is null or p_block_number<0
     or p_block_timestamp is null or p_block_timestamp<0 then
    raise exception 'REWARD_X_PROMOTION_CHECKPOINT_INVALID';
  end if;

  select * into v_intent
  from public.reward_x_promotion_payout_intents i
  where i.id=p_intent_id;

  if not found then
    raise exception 'REWARD_X_PROMOTION_PAYOUT_INTENT_MISSING';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_x_promotion_' || v_intent.invite_code,0)
  );

  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found
     or not v_cfg.reward_x_promotion_enabled
     or v_cfg.reward_x_promotion_live_started_at is null then
    raise exception 'REWARD_X_PROMOTION_LIVE_DISABLED';
  end if;

  select * into v_manifest
  from public.reward_x_promotion_payout_manifests m
  where m.intent_id=p_intent_id;

  if not found
     or v_manifest.network<>v_intent.network
     or v_manifest.invite_code<>v_intent.invite_code
     or v_manifest.recipient_wallet<>v_intent.recipient_wallet
     or v_manifest.amount_wei<>v_intent.amount_wei
     or v_manifest.public_proof_id<>v_intent.public_proof_id then
    raise exception 'REWARD_X_PROMOTION_CHECKPOINT_MANIFEST_MISSING_OR_MISMATCH';
  end if;

  select * into v_existing
  from public.reward_x_promotion_payout_checkpoints c
  where c.intent_id=p_intent_id;

  if found then
    if v_existing.network=v_intent.network
       and v_existing.manifest_id=v_manifest.id
       and v_existing.manifest_hash=v_manifest.manifest_hash
       and v_existing.block_id=p_block_id
       and v_existing.block_number=p_block_number
       and v_existing.block_timestamp=p_block_timestamp then
      return jsonb_build_object(
        'created',false,'intentId',p_intent_id,
        'manifestId',v_existing.manifest_id,
        'manifestHash',v_existing.manifest_hash,
        'blockId',v_existing.block_id,
        'blockNumber',v_existing.block_number
      );
    end if;
    raise exception 'REWARD_X_PROMOTION_CHECKPOINT_IMMUTABLE_MISMATCH';
  end if;

  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.id=v_intent.obligation_id;

  select * into v_verification
  from public.reward_x_promotion_post_verifications p
  where p.id=v_intent.verification_id;

  if v_obligation.id is null
     or v_obligation.financial_state<>'HELD'
     or v_verification.id is null
     or v_verification.verification_state<>'FINAL_VERIFIED'
     or not public.reward_x_promotion_security_clear_v1(
       v_intent.invite_code,
       v_intent.network
     ) then
    raise exception 'REWARD_X_PROMOTION_PAYOUT_AUTHORITY_NOT_READY';
  end if;

  insert into public.reward_x_promotion_payout_checkpoints(
    intent_id,manifest_id,manifest_hash,network,
    block_id,block_number,block_timestamp
  ) values (
    v_intent.id,v_manifest.id,v_manifest.manifest_hash,v_intent.network,
    p_block_id,p_block_number,p_block_timestamp
  );

  return jsonb_build_object(
    'created',true,'intentId',p_intent_id,
    'manifestId',v_manifest.id,
    'manifestHash',v_manifest.manifest_hash,
    'blockId',p_block_id,'blockNumber',p_block_number
  );
end;
$function$;

create or replace function public.register_reward_x_promotion_signed_submission_v1(
  p_intent_id bigint,
  p_tx_id text,
  p_operator_wallet text,
  p_raw_tx_hex text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_intent public.reward_x_promotion_payout_intents%rowtype;
  v_manifest public.reward_x_promotion_payout_manifests%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_verification public.reward_x_promotion_post_verifications%rowtype;
  v_checkpoint public.reward_x_promotion_payout_checkpoints%rowtype;
  v_existing_signed public.reward_x_promotion_payout_signed_transactions%rowtype;
  v_existing_submission public.reward_x_promotion_payout_submissions%rowtype;
  v_signed public.reward_x_promotion_payout_signed_transactions%rowtype;
  v_submission public.reward_x_promotion_payout_submissions%rowtype;
  v_cfg public.reward_runtime_config%rowtype;
begin
  p_tx_id:=lower(btrim(coalesce(p_tx_id,'')));
  p_operator_wallet:=lower(btrim(coalesce(p_operator_wallet,'')));
  p_raw_tx_hex:=lower(btrim(coalesce(p_raw_tx_hex,'')));

  if p_intent_id is null or p_intent_id<1
     or p_tx_id !~ '^0x[0-9a-f]{64}$'
     or p_operator_wallet !~ '^0x[0-9a-f]{40}$'
     or p_raw_tx_hex !~ '^0x[0-9a-f]+$' then
    raise exception 'REWARD_X_PROMOTION_SIGNED_SUBMISSION_INVALID';
  end if;

  select * into v_intent
  from public.reward_x_promotion_payout_intents i
  where i.id=p_intent_id;

  if not found then
    raise exception 'REWARD_X_PROMOTION_PAYOUT_INTENT_MISSING';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_x_promotion_' || v_intent.invite_code,0)
  );

  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found
     or not v_cfg.reward_x_promotion_enabled
     or v_cfg.reward_x_promotion_live_started_at is null then
    raise exception 'REWARD_X_PROMOTION_LIVE_DISABLED';
  end if;

  select * into v_manifest
  from public.reward_x_promotion_payout_manifests m
  where m.intent_id=p_intent_id;

  if not found
     or v_manifest.network<>v_intent.network
     or v_manifest.invite_code<>v_intent.invite_code
     or v_manifest.recipient_wallet<>v_intent.recipient_wallet
     or v_manifest.amount_wei<>v_intent.amount_wei
     or v_manifest.public_proof_id<>v_intent.public_proof_id
     or v_manifest.operator_wallet<>p_operator_wallet then
    raise exception 'REWARD_X_PROMOTION_SIGNING_MANIFEST_MISMATCH';
  end if;

  select * into v_existing_signed
  from public.reward_x_promotion_payout_signed_transactions s
  where s.intent_id=p_intent_id;

  select * into v_existing_submission
  from public.reward_x_promotion_payout_submissions s
  where s.intent_id=p_intent_id;

  if v_existing_signed.id is not null
     or v_existing_submission.id is not null then
    if v_existing_signed.id is not null
       and v_existing_submission.id is not null
       and v_existing_signed.manifest_id=v_manifest.id
       and v_existing_signed.manifest_hash=v_manifest.manifest_hash
       and v_existing_signed.tx_id=p_tx_id
       and v_existing_signed.operator_wallet=p_operator_wallet
       and v_existing_signed.raw_tx_hex=p_raw_tx_hex
       and v_existing_submission.manifest_id=v_manifest.id
       and v_existing_submission.manifest_hash=v_manifest.manifest_hash
       and v_existing_submission.signed_transaction_id=v_existing_signed.id
       and v_existing_submission.tx_id=p_tx_id
       and v_existing_submission.operator_wallet=p_operator_wallet then
      return jsonb_build_object(
        'created',false,
        'signedTransactionId',v_existing_signed.id,
        'submissionId',v_existing_submission.id,
        'intentId',p_intent_id,
        'manifestId',v_manifest.id,
        'manifestHash',v_manifest.manifest_hash,
        'txId',p_tx_id
      );
    end if;
    raise exception 'REWARD_X_PROMOTION_SIGNED_SUBMISSION_PARTIAL_OR_MISMATCH';
  end if;

  if exists (
    select 1 from public.reward_payout_signed_transactions s
    where s.tx_id=p_tx_id
    union all
    select 1 from public.reward_payout_transaction_submissions s
    where s.tx_id=p_tx_id
    union all
    select 1 from public.reward_payout_transaction_settlements s
    where s.tx_id=p_tx_id
    union all
    select 1 from public.reward_payouts p
    where p.tx_id=p_tx_id
  ) then
    raise exception 'REWARD_X_PROMOTION_TX_ALREADY_USED_BY_REFERRAL_REWARD';
  end if;

  select * into v_checkpoint
  from public.reward_x_promotion_payout_checkpoints c
  where c.intent_id=p_intent_id;

  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.id=v_intent.obligation_id
  for update;

  select * into v_verification
  from public.reward_x_promotion_post_verifications p
  where p.id=v_intent.verification_id;

  if v_checkpoint.intent_id is null
     or v_checkpoint.network<>v_intent.network
     or v_checkpoint.manifest_id<>v_manifest.id
     or v_checkpoint.manifest_hash<>v_manifest.manifest_hash
     or v_obligation.id is null
     or v_obligation.financial_state<>'HELD'
     or v_verification.id is null
     or v_verification.verification_state<>'FINAL_VERIFIED'
     or not public.reward_x_promotion_security_clear_v1(
       v_intent.invite_code,
       v_intent.network
     ) then
    raise exception 'REWARD_X_PROMOTION_SIGNING_AUTHORITY_NOT_READY';
  end if;

  insert into public.reward_x_promotion_payout_signed_transactions(
    intent_id,manifest_id,manifest_hash,network,
    tx_id,operator_wallet,raw_tx_hex
  ) values (
    v_intent.id,v_manifest.id,v_manifest.manifest_hash,v_intent.network,
    p_tx_id,p_operator_wallet,p_raw_tx_hex
  )
  returning * into v_signed;

  insert into public.reward_x_promotion_payout_submissions(
    intent_id,manifest_id,manifest_hash,signed_transaction_id,
    network,tx_id,operator_wallet
  ) values (
    v_intent.id,v_manifest.id,v_manifest.manifest_hash,v_signed.id,
    v_intent.network,p_tx_id,p_operator_wallet
  )
  returning * into v_submission;

  return jsonb_build_object(
    'created',true,
    'signedTransactionId',v_signed.id,
    'submissionId',v_submission.id,
    'intentId',p_intent_id,
    'manifestId',v_manifest.id,
    'manifestHash',v_manifest.manifest_hash,
    'txId',p_tx_id
  );
end;
$function$;

create or replace function public.finalize_reward_x_promotion_payout_v1(
  p_intent_id bigint,
  p_tx_id text,
  p_tx_origin text,
  p_block_id text,
  p_block_number bigint,
  p_block_timestamp bigint,
  p_finalized_head_id text,
  p_finalized_head_number bigint,
  p_clause_count integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_intent public.reward_x_promotion_payout_intents%rowtype;
  v_manifest public.reward_x_promotion_payout_manifests%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_verification public.reward_x_promotion_post_verifications%rowtype;
  v_checkpoint public.reward_x_promotion_payout_checkpoints%rowtype;
  v_signed public.reward_x_promotion_payout_signed_transactions%rowtype;
  v_submission public.reward_x_promotion_payout_submissions%rowtype;
  v_existing public.reward_x_promotion_payout_settlements%rowtype;
  v_settlement public.reward_x_promotion_payout_settlements%rowtype;
  v_receipt public.reward_x_promotion_receipts%rowtype;
  v_paid_at timestamptz;
begin
  p_tx_id:=lower(btrim(coalesce(p_tx_id,'')));
  p_tx_origin:=lower(btrim(coalesce(p_tx_origin,'')));
  p_block_id:=lower(btrim(coalesce(p_block_id,'')));
  p_finalized_head_id:=lower(btrim(coalesce(p_finalized_head_id,'')));

  if p_intent_id is null or p_intent_id<1
     or p_tx_id !~ '^0x[0-9a-f]{64}$'
     or p_tx_origin !~ '^0x[0-9a-f]{40}$'
     or p_block_id !~ '^0x[0-9a-f]{64}$'
     or p_finalized_head_id !~ '^0x[0-9a-f]{64}$'
     or p_block_number is null or p_block_number<0
     or p_block_timestamp is null or p_block_timestamp<0
     or p_finalized_head_number is null
     or p_finalized_head_number<p_block_number
     or p_clause_count<>1 then
    raise exception 'REWARD_X_PROMOTION_SETTLEMENT_INVALID';
  end if;

  select * into v_intent
  from public.reward_x_promotion_payout_intents i
  where i.id=p_intent_id;

  if not found then
    raise exception 'REWARD_X_PROMOTION_PAYOUT_INTENT_MISSING';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_x_promotion_' || v_intent.invite_code,0)
  );

  select * into v_existing
  from public.reward_x_promotion_payout_settlements s
  where s.intent_id=p_intent_id;

  if found then
    if v_existing.tx_id=p_tx_id
       and v_existing.tx_origin=p_tx_origin
       and v_existing.block_id=p_block_id
       and v_existing.block_number=p_block_number
       and v_existing.block_timestamp=p_block_timestamp
       and v_existing.finalized_head_id=p_finalized_head_id
       and v_existing.finalized_head_number=p_finalized_head_number
       and v_existing.clause_count=p_clause_count then
      return jsonb_build_object(
        'created',false,'settlementId',v_existing.id,
        'intentId',p_intent_id,'txId',v_existing.tx_id,
        'paidAt',v_existing.paid_at
      );
    end if;
    raise exception 'REWARD_X_PROMOTION_SETTLEMENT_IMMUTABLE_MISMATCH';
  end if;

  if exists (
    select 1 from public.reward_payout_transaction_settlements s
    where s.tx_id=p_tx_id
    union all
    select 1 from public.reward_payouts p
    where p.tx_id=p_tx_id
  ) then
    raise exception 'REWARD_X_PROMOTION_TX_ALREADY_USED_BY_REFERRAL_REWARD';
  end if;

  select * into v_manifest
  from public.reward_x_promotion_payout_manifests m
  where m.intent_id=p_intent_id;

  select * into v_checkpoint
  from public.reward_x_promotion_payout_checkpoints c
  where c.intent_id=p_intent_id;

  select * into v_signed
  from public.reward_x_promotion_payout_signed_transactions s
  where s.intent_id=p_intent_id;

  select * into v_submission
  from public.reward_x_promotion_payout_submissions s
  where s.intent_id=p_intent_id;

  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.id=v_intent.obligation_id
  for update;

  select * into v_verification
  from public.reward_x_promotion_post_verifications p
  where p.id=v_intent.verification_id;

  if v_manifest.id is null
     or v_manifest.operator_wallet<>p_tx_origin
     or v_checkpoint.intent_id is null
     or v_checkpoint.manifest_id<>v_manifest.id
     or v_checkpoint.manifest_hash<>v_manifest.manifest_hash
     or v_signed.id is null
     or v_signed.manifest_id<>v_manifest.id
     or v_signed.manifest_hash<>v_manifest.manifest_hash
     or v_submission.id is null
     or v_submission.manifest_id<>v_manifest.id
     or v_submission.manifest_hash<>v_manifest.manifest_hash
     or v_signed.tx_id<>p_tx_id
     or v_submission.tx_id<>p_tx_id
     or v_signed.operator_wallet<>p_tx_origin
     or v_submission.operator_wallet<>p_tx_origin
     or v_signed.network<>v_intent.network
     or v_submission.network<>v_intent.network
     or v_obligation.id is null
     or v_obligation.financial_state<>'HELD'
     or v_verification.id is null
     or v_verification.verification_state<>'FINAL_VERIFIED'
     or p_block_number<=v_checkpoint.block_number then
    raise exception 'REWARD_X_PROMOTION_SETTLEMENT_PROOF_MISMATCH';
  end if;

  v_paid_at:=to_timestamp(p_block_timestamp);

  if v_paid_at < v_manifest.created_at - interval '60 seconds' then
    raise exception 'REWARD_X_PROMOTION_SETTLEMENT_PREDATES_MANIFEST';
  end if;

  insert into public.reward_x_promotion_payout_settlements(
    intent_id,submission_id,network,tx_id,tx_origin,
    block_id,block_number,block_timestamp,
    finalized_head_id,finalized_head_number,clause_count,paid_at
  ) values (
    v_intent.id,v_submission.id,v_intent.network,p_tx_id,p_tx_origin,
    p_block_id,p_block_number,p_block_timestamp,
    p_finalized_head_id,p_finalized_head_number,p_clause_count,v_paid_at
  )
  returning * into v_settlement;

  insert into public.reward_x_promotion_receipts(
    intent_id,settlement_id,obligation_id,split_id,invite_code,network,
    source_reward_cohort_round_id,source_allocation_receipt_id,
    recipient_wallet,amount_wei,public_proof_id,x_post_id,x_author_id,
    tx_id,paid_at
  ) values (
    v_intent.id,v_settlement.id,v_intent.obligation_id,v_intent.split_id,
    v_intent.invite_code,v_intent.network,
    v_intent.source_reward_cohort_round_id,v_intent.source_allocation_receipt_id,
    v_intent.recipient_wallet,v_intent.amount_wei,v_intent.public_proof_id,
    v_intent.x_post_id,v_intent.x_author_id,p_tx_id,v_paid_at
  )
  returning * into v_receipt;

  update public.reward_x_promotion_obligations o
  set financial_state='PAID',
      paid_at=v_paid_at,
      released_at=null,
      release_reason=null,
      updated_at=now()
  where o.id=v_obligation.id
    and o.financial_state='HELD';

  if not found then
    raise exception 'REWARD_X_PROMOTION_OBLIGATION_PAID_TRANSITION_FAILED';
  end if;

  return jsonb_build_object(
    'created',true,'settlementId',v_settlement.id,
    'receiptId',v_receipt.id,'intentId',p_intent_id,
    'manifestId',v_manifest.id,
    'manifestHash',v_manifest.manifest_hash,
    'txId',p_tx_id,'paidAt',v_paid_at
  );
end;
$function$;

comment on column public.reward_x_promotion_payout_checkpoints.manifest_id is
  'Immutable promotion payout manifest that authorized this chain checkpoint.';
comment on column public.reward_x_promotion_payout_signed_transactions.manifest_id is
  'Immutable promotion payout manifest that authorized this signed transaction.';
comment on column public.reward_x_promotion_payout_submissions.manifest_id is
  'Immutable promotion payout manifest that authorized this transaction submission.';
