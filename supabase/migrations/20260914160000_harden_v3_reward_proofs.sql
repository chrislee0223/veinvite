-- Harden VeInvite structured reward Proof v3 before the first live v3 payout.
-- Historical v2 manifests remain valid and immutable.

alter table public.reward_payouts
  add column if not exists public_proof_id uuid not null default gen_random_uuid();

create unique index if not exists reward_payouts_public_proof_id_uidx
  on public.reward_payouts(public_proof_id);

create or replace function public.enforce_reward_payout_immutability()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.round_id is distinct from old.round_id
     or new.invite_code is distinct from old.invite_code
     or new.recipient_wallet is distinct from old.recipient_wallet
     or new.amount_wei is distinct from old.amount_wei
     or new.public_proof_id is distinct from old.public_proof_id
     or new.created_at is distinct from old.created_at then
    raise exception 'reward payout financial identity is immutable for invite %', old.invite_code;
  end if;

  if old.status = 'PAID' then
    if new.status is distinct from old.status
       or new.tx_id is distinct from old.tx_id
       or new.paid_at is distinct from old.paid_at
       or new.attempt_count is distinct from old.attempt_count
       or new.error_message is distinct from old.error_message then
      raise exception 'paid reward payout is immutable for invite %', old.invite_code;
    end if;

    return new;
  end if;

  if old.status = 'PENDING'
     and new.status not in ('PENDING','SENDING','FAILED') then
    raise exception 'invalid payout transition from PENDING for invite %', old.invite_code;
  end if;

  if old.status = 'SENDING'
     and new.status not in ('SENDING','PAID','FAILED') then
    raise exception 'invalid payout transition from SENDING for invite %', old.invite_code;
  end if;

  if old.status = 'FAILED'
     and new.status not in ('FAILED','SENDING') then
    raise exception 'invalid payout transition from FAILED for invite %', old.invite_code;
  end if;

  if new.attempt_count < old.attempt_count then
    raise exception 'reward payout attempt_count cannot decrease for invite %', old.invite_code;
  end if;

  return new;
end;
$function$;

create or replace function public.infer_reward_manifest_version()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.manifest_version = 'veinvite-payout-manifest-v2'
     and jsonb_typeof(new.clauses) = 'array'
     and jsonb_array_length(new.clauses) > 0
     and exists (
       select 1
       from jsonb_array_elements(new.clauses) as c(value)
       where c.value ? 'proofTypes'
          or c.value ? 'proofValues'
          or c.value ? 'publicProofId'
          or c.value ? 'impactCodes'
          or c.value ? 'impactValues'
          or c.value ? 'description'
     ) then
    new.manifest_version := 'veinvite-payout-manifest-v3';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_00_infer_reward_manifest_version
  on public.reward_payout_manifests;
drop trigger if exists reward_payout_manifests_00_infer_version
  on public.reward_payout_manifests;

create trigger reward_payout_manifests_00_infer_version
before insert on public.reward_payout_manifests
for each row
execute function public.infer_reward_manifest_version();

create or replace function public.validate_reward_manifest_v2()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.clauses is null
     or jsonb_typeof(new.clauses) <> 'array'
     or jsonb_array_length(new.clauses) < 1 then
    raise exception 'Payout manifest clauses must be a non-empty JSON array';
  end if;

  if new.manifest_version = 'veinvite-payout-manifest-v2' then
    if exists (
      select 1
      from jsonb_array_elements(new.clauses) as c(value)
      where coalesce(c.value->>'payoutId', '') !~ '^[1-9][0-9]*$'
         or c.value->>'proof' is distinct from
            ('veinvite:referral-onboarding:v1:payout:' || (c.value->>'payoutId'))
         or c.value ? 'publicProofId'
         or c.value ? 'proofTypes'
         or c.value ? 'proofValues'
         or c.value ? 'impactCodes'
         or c.value ? 'impactValues'
         or c.value ? 'description'
    ) then
      raise exception 'Payout manifest contains an invalid v2 referral proof';
    end if;

    return new;
  end if;

  if new.manifest_version = 'veinvite-payout-manifest-v3' then
    if exists (
      select 1
      from jsonb_array_elements(new.clauses) as c(value)
      where coalesce(c.value->>'payoutId', '') !~ '^[1-9][0-9]*$'
         or coalesce(c.value->>'publicProofId', '') !~
            '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or c.value->>'proof' is distinct from
            ('veinvite:referral-onboarding:v2:proof:' || (c.value->>'publicProofId'))
         or c.value->'proofTypes' is distinct from '["text","link"]'::jsonb
         or c.value->'proofValues' is distinct from jsonb_build_array(
              'veinvite:referral-onboarding:v2:proof:' || (c.value->>'publicProofId'),
              'https://veinvite.vercel.app/proofs/' || (c.value->>'publicProofId')
            )
         or c.value->'impactCodes' is distinct from '[]'::jsonb
         or c.value->'impactValues' is distinct from '[]'::jsonb
         or c.value->>'description' is distinct from
            'VeInvite verified referral onboarding reward.'
         or not exists (
              select 1
              from public.reward_payouts rp
              where rp.round_id = new.round_id
                and rp.id::text = c.value->>'payoutId'
                and rp.public_proof_id::text = c.value->>'publicProofId'
            )
    ) then
      raise exception 'Payout manifest contains an invalid v3 structured referral proof';
    end if;

    return new;
  end if;

  raise exception 'Unsupported VeInvite payout manifest version: %', new.manifest_version;
end;
$function$;

create or replace function public.create_reward_payout_manifest(
  p_round_id bigint,
  p_operator_wallet text,
  p_pool_address text,
  p_manifest_hash text,
  p_clauses jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_round public.reward_rounds%rowtype;
  v_existing public.reward_payout_manifests%rowtype;
  v_manifest_version text;
  v_total_count integer := 0;
  v_pending_count integer := 0;
  v_total_amount numeric(78,0) := 0;
  v_matching_clause_count integer := 0;
  v_manifest_id bigint;
begin
  p_operator_wallet := lower(btrim(p_operator_wallet));
  p_pool_address := lower(btrim(p_pool_address));
  p_manifest_hash := lower(btrim(p_manifest_hash));

  if p_round_id is null or p_round_id < 1 then
    raise exception 'round_id must be positive';
  end if;

  if p_operator_wallet is null or p_operator_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'operator wallet must be a lowercase VeChain address';
  end if;

  if p_pool_address is null or p_pool_address !~ '^0x[0-9a-f]{40}$' then
    raise exception 'pool address must be a lowercase VeChain address';
  end if;

  if p_manifest_hash is null or p_manifest_hash !~ '^0x[0-9a-f]{64}$' then
    raise exception 'manifest hash must be a lowercase 32-byte hex value';
  end if;

  if p_clauses is null or jsonb_typeof(p_clauses) <> 'array' or jsonb_array_length(p_clauses) < 1 then
    raise exception 'manifest clauses must be a non-empty JSON array';
  end if;

  select case
    when exists (
      select 1
      from jsonb_array_elements(p_clauses) as c(value)
      where c.value ? 'proofTypes'
         or c.value ? 'proofValues'
         or c.value ? 'publicProofId'
         or c.value ? 'impactCodes'
         or c.value ? 'impactValues'
         or c.value ? 'description'
    ) then 'veinvite-payout-manifest-v3'
    else 'veinvite-payout-manifest-v2'
  end
  into v_manifest_version;

  select *
  into v_round
  from public.reward_rounds
  where id = p_round_id
  for update;

  if not found then
    raise exception 'reward round not found';
  end if;

  if v_round.status <> 'CREATED' then
    raise exception 'reward round must be CREATED before manifest generation';
  end if;

  if v_round.app_id <> v_veinvite_app_id then
    raise exception 'manifest can only target the VeInvite app';
  end if;

  select *
  into v_existing
  from public.reward_payout_manifests
  where round_id = p_round_id;

  if found then
    if v_existing.manifest_version = v_manifest_version
       and v_existing.manifest_hash = p_manifest_hash
       and v_existing.operator_wallet = p_operator_wallet
       and v_existing.x2earn_rewards_pool_address = p_pool_address
       and v_existing.clauses = p_clauses then
      return jsonb_build_object(
        'manifest_id', v_existing.id,
        'created', false
      );
    end if;

    raise exception 'reward round already has a different immutable payout manifest';
  end if;

  select
    count(*),
    count(*) filter (where status = 'PENDING' and tx_id is null),
    coalesce(sum(amount_wei), 0)
  into
    v_total_count,
    v_pending_count,
    v_total_amount
  from public.reward_payouts
  where round_id = p_round_id;

  if v_total_count < 1 then
    raise exception 'reward round has no payouts';
  end if;

  if v_pending_count <> v_total_count then
    raise exception 'all payouts must be PENDING with no tx_id before manifest generation';
  end if;

  if v_total_count <> v_round.eligible_count then
    raise exception 'payout count does not match reward round eligible_count';
  end if;

  if v_total_amount <> v_round.distributable_wei then
    raise exception 'payout total does not match reward round distributable amount';
  end if;

  if jsonb_array_length(p_clauses) <> v_total_count then
    raise exception 'manifest clause count does not match payout count';
  end if;

  with expected as (
    select
      row_number() over (order by rp.id) as ordinal,
      rp.id::text as payout_id,
      rp.invite_code,
      lower(rp.recipient_wallet) as recipient_wallet,
      rp.amount_wei::text as amount_wei,
      rp.public_proof_id::text as public_proof_id
    from public.reward_payouts rp
    where rp.round_id = p_round_id
  ), provided as (
    select
      ordinality as ordinal,
      value as clause
    from jsonb_array_elements(p_clauses) with ordinality
  )
  select count(*)
  into v_matching_clause_count
  from expected e
  join provided p using (ordinal)
  where p.clause->>'payoutId' = e.payout_id
    and p.clause->>'inviteCode' = e.invite_code
    and lower(p.clause->>'recipientWallet') = e.recipient_wallet
    and p.clause->>'amountWei' = e.amount_wei
    and lower(p.clause->>'to') = p_pool_address
    and p.clause->>'value' = '0x0'
    and p.clause->>'data' ~ '^0x[0-9a-fA-F]+$'
    and (
      v_manifest_version = 'veinvite-payout-manifest-v2'
      or p.clause->>'publicProofId' = e.public_proof_id
    );

  if v_matching_clause_count <> v_total_count then
    raise exception 'manifest clauses do not match reserved payout identities';
  end if;

  insert into public.reward_payout_manifests(
    round_id,
    manifest_version,
    network,
    app_id,
    x2earn_rewards_pool_address,
    operator_wallet,
    manifest_hash,
    payout_count,
    total_amount_wei,
    clauses
  ) values (
    p_round_id,
    v_manifest_version,
    v_round.network,
    v_round.app_id,
    p_pool_address,
    p_operator_wallet,
    p_manifest_hash,
    v_total_count,
    v_total_amount,
    p_clauses
  )
  returning id into v_manifest_id;

  return jsonb_build_object(
    'manifest_id', v_manifest_id,
    'created', true
  );
end;
$function$;

create or replace function public.read_reward_manifest_source(p_round_id bigint)
returns jsonb
language sql
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'round', jsonb_build_object(
      'id', r.id::text,
      'network', r.network,
      'app_id', r.app_id,
      'status', r.status,
      'distributable_wei', r.distributable_wei::text,
      'eligible_count', r.eligible_count::text,
      'manifest_version', (
        select rpm.manifest_version
        from public.reward_payout_manifests rpm
        where rpm.round_id = r.id
      )
    ),
    'payouts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', rp.id::text,
          'invite_code', rp.invite_code,
          'recipient_wallet', lower(rp.recipient_wallet),
          'amount_wei', rp.amount_wei::text,
          'status', rp.status,
          'tx_id', rp.tx_id,
          'public_proof_id', rp.public_proof_id::text
        )
        order by rp.id
      )
      from public.reward_payouts rp
      where rp.round_id = r.id
    ), '[]'::jsonb),
    'manifest', (
      select jsonb_build_object(
        'id', rpm.id::text,
        'manifest_version', rpm.manifest_version,
        'total_amount_wei', rpm.total_amount_wei::text,
        'payout_count', rpm.payout_count::text
      )
      from public.reward_payout_manifests rpm
      where rpm.round_id = r.id
    )
  )
  from public.reward_rounds r
  where r.id = p_round_id;
$function$;

revoke all on function public.create_reward_payout_manifest(bigint,text,text,text,jsonb) from public;
revoke all on function public.create_reward_payout_manifest(bigint,text,text,text,jsonb) from anon;
revoke all on function public.create_reward_payout_manifest(bigint,text,text,text,jsonb) from authenticated;
grant execute on function public.create_reward_payout_manifest(bigint,text,text,text,jsonb) to service_role;

revoke all on function public.read_reward_manifest_source(bigint) from public;
revoke all on function public.read_reward_manifest_source(bigint) from anon;
revoke all on function public.read_reward_manifest_source(bigint) from authenticated;
grant execute on function public.read_reward_manifest_source(bigint) to service_role;
