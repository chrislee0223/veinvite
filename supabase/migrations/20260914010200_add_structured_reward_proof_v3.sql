-- Add VeInvite payout manifest v3 structured Proof support while preserving
-- byte-for-byte rebuild compatibility for historical v2 manifests.

create or replace function public.infer_reward_manifest_version()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  -- create_reward_payout_manifest intentionally keeps its existing RPC
  -- signature. New clients are identified by the structured-proof clause
  -- shape, while legacy v2 callers continue to store v2 exactly as before.
  if new.manifest_version = 'veinvite-payout-manifest-v2'
     and jsonb_typeof(new.clauses) = 'array'
     and jsonb_array_length(new.clauses) > 0
     and (new.clauses->0) ? 'proofTypes' then
    new.manifest_version := 'veinvite-payout-manifest-v3';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_00_infer_reward_manifest_version
on public.reward_payout_manifests;

create trigger trg_00_infer_reward_manifest_version
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
  if new.manifest_version = 'veinvite-payout-manifest-v2' then
    if exists (
      select 1
      from jsonb_array_elements(new.clauses) as c(value)
      where coalesce(c.value->>'payoutId', '') !~ '^[1-9][0-9]*$'
         or c.value->>'proof' is distinct from
            ('veinvite:referral-onboarding:v1:payout:' || (c.value->>'payoutId'))
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
         or c.value->>'proof' is distinct from
            ('veinvite:referral-onboarding:v2:payout:' || (c.value->>'payoutId'))
         or c.value->'proofTypes' is distinct from '["text","link"]'::jsonb
         or c.value->'proofValues' is distinct from jsonb_build_array(
              'veinvite:referral-onboarding:v2:payout:' || (c.value->>'payoutId'),
              'https://veinvite.vercel.app/proofs/' || (c.value->>'payoutId')
            )
         or c.value->'impactCodes' is distinct from '[]'::jsonb
         or c.value->'impactValues' is distinct from '[]'::jsonb
         or c.value->>'description' is distinct from
            'VeInvite verified referral onboarding reward.'
    ) then
      raise exception 'Payout manifest contains an invalid v3 structured referral proof';
    end if;

    return new;
  end if;

  raise exception 'Unsupported VeInvite payout manifest version: %', new.manifest_version;
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
          'tx_id', rp.tx_id
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
