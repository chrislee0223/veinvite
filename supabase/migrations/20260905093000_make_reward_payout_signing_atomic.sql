-- Ensure a durable signed payout transaction and its submission record are
-- committed atomically before any broadcast attempt. This closes the crash
-- window where a signed transaction could exist without a submission row.

create or replace function public.register_reward_payout_signed_transaction(
  p_manifest_id bigint,
  p_tx_id text,
  p_operator_wallet text,
  p_raw_tx_hex text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_manifest public.reward_payout_manifests%rowtype;
  v_existing public.reward_payout_signed_transactions%rowtype;
  v_id bigint;
begin
  p_tx_id := lower(btrim(p_tx_id));
  p_operator_wallet := lower(btrim(p_operator_wallet));
  p_raw_tx_hex := lower(btrim(p_raw_tx_hex));

  if p_manifest_id is null or p_manifest_id < 1 then
    raise exception 'manifest_id must be positive';
  end if;
  if p_tx_id is null or p_tx_id !~ '^0x[0-9a-f]{64}$' then
    raise exception 'tx_id must be a lowercase 32-byte hex value';
  end if;
  if p_operator_wallet is null or p_operator_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'operator wallet must be a lowercase VeChain address';
  end if;
  if p_raw_tx_hex is null or p_raw_tx_hex !~ '^0x[0-9a-f]+$' then
    raise exception 'raw signed transaction must be lowercase hex';
  end if;

  select * into v_manifest
  from public.reward_payout_manifests
  where id = p_manifest_id;

  if not found then
    raise exception 'reward payout manifest not found';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_reward_signed_tx_' || v_manifest.round_id::text,
      0
    )
  );

  if v_manifest.operator_wallet <> p_operator_wallet then
    raise exception 'operator wallet does not match payout manifest';
  end if;

  if not exists (
    select 1
    from public.reward_payout_manifest_chain_checkpoints c
    where c.manifest_id = v_manifest.id
  ) then
    raise exception 'payout manifest chain checkpoint must exist before signing';
  end if;

  if exists (
    select 1
    from public.reward_payout_transaction_settlements s
    where s.manifest_id = v_manifest.id
  ) then
    raise exception 'reward payout manifest is already finalized';
  end if;

  select * into v_existing
  from public.reward_payout_signed_transactions
  where manifest_id = v_manifest.id;

  if found then
    if v_existing.tx_id = p_tx_id
       and v_existing.operator_wallet = p_operator_wallet
       and v_existing.raw_tx_hex = p_raw_tx_hex
       and v_existing.manifest_hash = v_manifest.manifest_hash then
      perform public.register_reward_payout_transaction_submission(
        p_manifest_id,
        p_tx_id,
        p_operator_wallet
      );

      return jsonb_build_object(
        'signed_transaction_id', v_existing.id,
        'created', false,
        'tx_id', v_existing.tx_id
      );
    end if;

    raise exception 'reward payout manifest already has a different signed transaction';
  end if;

  if exists (
    select 1 from public.reward_payout_signed_transactions s
    where s.tx_id = p_tx_id and s.manifest_id <> v_manifest.id
  ) then
    raise exception 'signed transaction is already bound to another manifest';
  end if;

  insert into public.reward_payout_signed_transactions(
    manifest_id,
    round_id,
    network,
    manifest_hash,
    tx_id,
    operator_wallet,
    raw_tx_hex
  ) values (
    v_manifest.id,
    v_manifest.round_id,
    v_manifest.network,
    v_manifest.manifest_hash,
    p_tx_id,
    p_operator_wallet,
    p_raw_tx_hex
  ) returning id into v_id;

  perform public.register_reward_payout_transaction_submission(
    p_manifest_id,
    p_tx_id,
    p_operator_wallet
  );

  return jsonb_build_object(
    'signed_transaction_id', v_id,
    'created', true,
    'tx_id', p_tx_id
  );
end;
$function$;

revoke execute on function public.register_reward_payout_signed_transaction(bigint,text,text,text)
  from public, anon, authenticated;
grant execute on function public.register_reward_payout_signed_transaction(bigint,text,text,text)
  to service_role;
