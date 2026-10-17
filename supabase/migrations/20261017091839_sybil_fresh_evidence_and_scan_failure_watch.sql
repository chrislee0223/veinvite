-- Close two read/monitor-only Sybil V2 gaps.
-- 1) Every new DISTINCT evidence record can re-open a SYSTEM HOLD assessment,
--    even if its signal code was present in an earlier verdict.
-- 2) Preserve the beginning of an unresolved on-chain scan failure across
--    retries and expose a service-only, aggregate liveness counter.
-- No verdict, restriction, payout, reservation or reward logic is changed.

create or replace view public.operator_sybil_v2_hold_new_evidence_candidates
with (security_invoker = true) as
select
  a.invite_code,
  a.network,
  fresh.created_at as priority_at
from public.sybil_v2_referral_assessments a
join public.invitations i
  on i.invite_code = a.invite_code
 and i.activation_network = a.network
join lateral (
  select e.created_at
  from public.sybil_v2_evidence_records e
  where e.invite_code = a.invite_code
    and e.network = a.network
    and e.subject_wallet = lower(i.invitee_wallet)
    -- An already stored row is unique by evidence dedupe_key.
    -- Timestamp is the durable freshness boundary for this assessment.
    -- A NEW row with the SAME signal_code can corroborate a different
    -- wallet, block or transaction; never discard it by reason_codes alone.
    and e.created_at > a.updated_at
    and e.strength in ('MEDIUM', 'HIGH')
    and e.score > 0
  order by e.created_at asc
  limit 1
) fresh on true
where public.sybil_v2_enforcement_enabled()
  and a.state = 'HOLD'
  and a.source = 'SYSTEM'
  and i.invitee_wallet is not null
  and i.status in ('ACTIVATING', 'UNDER_REVIEW', 'COMPLETED')
  and i.reward_status not in ('PAID', 'FORFEITED')
  and not exists (
    select 1 from public.reward_queue_entries q
    where q.invite_code = a.invite_code
      and q.status = 'ASSIGNED'
  );

revoke all on public.operator_sybil_v2_hold_new_evidence_candidates
from public, anon, authenticated;
grant select on public.operator_sybil_v2_hold_new_evidence_candidates
to service_role;

comment on view public.operator_sybil_v2_hold_new_evidence_candidates is
  'Service-only read of SYSTEM HOLDs with new medium/high evidence rows, even when the signal code is repeated. No operator verdict or paid reservation is modified.';

alter table public.sybil_v2_scan_checkpoints
  add column if not exists first_failed_at timestamptz;

-- A failed checkpoint can start before this migration. Seed its episode age
-- from the latest prior checkpoint write (conservative; do not fabricate age).
update public.sybil_v2_scan_checkpoints
set first_failed_at = updated_at
where first_failed_at is null
  and last_error is not null
  and (historical_chain_status = 'FAILED' or funding_chain_status = 'FAILED');

create or replace function public.preserve_sybil_v2_scan_first_failed_at()
returns trigger
language plpgsql
security invoker
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.last_error is not null
     and (new.historical_chain_status = 'FAILED'
          or new.funding_chain_status = 'FAILED') then
    -- Repeat failures never reset the earliest timestamp. The initial
    -- PENDING checkpoint upsert before every retry must not reset it either.
    if tg_op = 'UPDATE' then
      new.first_failed_at :=
        coalesce(old.first_failed_at, new.first_failed_at, transaction_timestamp());
    else
      new.first_failed_at :=
        coalesce(new.first_failed_at, transaction_timestamp());
    end if;
  elsif new.historical_chain_status = 'COMPLETE'
        and new.funding_chain_status = 'COMPLETE'
        and new.last_error is null then
    -- Recovery ends the entire failure episode.
    new.first_failed_at := null;
  elsif tg_op = 'UPDATE' then
    -- In-progress/PENDING retry: hold the previous failure age even when
    -- application upsert temporarily clears last_error.
    new.first_failed_at := old.first_failed_at;
  else
    new.first_failed_at := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists preserve_sybil_v2_scan_first_failed_at_trigger
on public.sybil_v2_scan_checkpoints;
create trigger preserve_sybil_v2_scan_first_failed_at_trigger
before insert or update on public.sybil_v2_scan_checkpoints
for each row execute function public.preserve_sybil_v2_scan_first_failed_at();

revoke all on function public.preserve_sybil_v2_scan_first_failed_at()
from public, anon, authenticated;
grant execute on function public.preserve_sybil_v2_scan_first_failed_at()
to service_role;

-- Scanner failures and HOLDs are not equivalent. ANALYSIS_FAILED / PENDING
-- checkpoints must be monitored even without a HOLD assessment.
-- Restrict the alert to live, unpaid active invitations only.
create or replace function public.read_sybil_v2_failed_scan_liveness(
  p_network text
)
returns table(
  failed_scans bigint,
  failed_over_1h bigint,
  failed_over_24h bigint
)
language sql
stable
security invoker
set search_path to 'pg_catalog', 'public'
as $function$
  select
    count(*)::bigint,
    count(*) filter (
      where s.attempt_count >= 3
        and s.first_failed_at <= now() - interval '1 hour'
    )::bigint,
    count(*) filter (
      where s.attempt_count >= 3
        and s.first_failed_at <= now() - interval '24 hours'
    )::bigint
  from public.sybil_v2_scan_checkpoints s
  join public.invitations i
    on i.invite_code = s.invite_code
    and i.activation_network = s.network
  left join public.sybil_v2_referral_assessments a
    on a.invite_code = s.invite_code
    and a.network = s.network
  where s.network = lower(btrim(p_network))
    and s.last_error is not null
    and (s.historical_chain_status = 'FAILED'
         or s.funding_chain_status = 'FAILED')
    and i.invitee_wallet is not null
    and i.status in ('ACTIVATING', 'UNDER_REVIEW', 'COMPLETED')
    and i.reward_status not in ('PAID', 'FORFEITED')
    and a.state is distinct from 'RESTRICTED';
$function$;

revoke all on function public.read_sybil_v2_failed_scan_liveness(text)
from public, anon, authenticated;
grant execute on function public.read_sybil_v2_failed_scan_liveness(text)
to service_role;

comment on function public.read_sybil_v2_failed_scan_liveness(text) is
  'Service-only aggregate of active unpaid Sybil chain scan failures, aged since the first failure episode rather than the last retry. Does not change any assessment or reward.';
