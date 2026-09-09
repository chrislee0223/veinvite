create or replace function public.read_outstanding_reward_liability(
  p_network text,
  p_app_id text
)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_network text := lower(btrim(coalesce(p_network, '')));
  v_app_id text := lower(btrim(coalesce(p_app_id, '')));
  v_reserved_existing numeric(78,0) := 0;
  v_legacy_reserved numeric(78,0) := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;

  if v_app_id <> v_veinvite_app_id then
    raise exception 'reward liability can only target the VeInvite app';
  end if;

  -- Keep this definition aligned with prepare_reward_cohort_batch: every
  -- unpaid fixed reservation remains a liability even after it is claimed or
  -- assigned to an immutable payout round.
  select coalesce(sum(q.reserved_amount_wei),0)
  into v_reserved_existing
  from public.reward_queue_entries q
  where q.network = v_network
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    and not exists (
      select 1
      from public.reward_payouts paid
      where paid.invite_code = q.invite_code
        and paid.status = 'PAID'
    );

  -- Historical/manual payouts that predate fixed queue reservations still
  -- count, but never double-count a payout already backed by a reservation.
  select coalesce(sum(rp.amount_wei),0)
  into v_legacy_reserved
  from public.reward_payouts rp
  join public.reward_rounds rr
    on rr.id = rp.round_id
  where rr.network = v_network
    and rr.app_id = v_app_id
    and rp.status in ('PENDING','SENDING','FAILED')
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code = rp.invite_code
        and q.reserved_amount_wei is not null
    );

  return (v_reserved_existing + v_legacy_reserved)::text;
end;
$function$;

revoke all on function public.read_outstanding_reward_liability(text,text)
  from public;
revoke execute on function public.read_outstanding_reward_liability(text,text)
  from anon, authenticated;
grant execute on function public.read_outstanding_reward_liability(text,text)
  to service_role;
