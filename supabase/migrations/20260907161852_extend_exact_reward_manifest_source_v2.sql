create or replace function public.read_reward_manifest_source(p_round_id bigint)
returns jsonb
language sql
set search_path to 'public'
as $$
  select jsonb_build_object(
    'round', jsonb_build_object(
      'id', r.id::text,
      'network', r.network,
      'app_id', r.app_id,
      'status', r.status,
      'distributable_wei', r.distributable_wei::text,
      'eligible_count', r.eligible_count::text
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
        'total_amount_wei', rpm.total_amount_wei::text,
        'payout_count', rpm.payout_count::text
      )
      from public.reward_payout_manifests rpm
      where rpm.round_id = r.id
    )
  )
  from public.reward_rounds r
  where r.id = p_round_id;
$$;

revoke all on function public.read_reward_manifest_source(bigint) from public;
revoke all on function public.read_reward_manifest_source(bigint) from anon;
revoke all on function public.read_reward_manifest_source(bigint) from authenticated;
grant execute on function public.read_reward_manifest_source(bigint) to service_role;
