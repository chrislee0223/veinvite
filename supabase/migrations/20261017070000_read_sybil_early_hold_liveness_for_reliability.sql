-- Lightweight read-only HOLD liveness for the existing 15-minute reliability watcher.
-- An assessment re-run can update assessed_at without resolving the HOLD.
-- Compute first_held_at from the active continuous HOLD episode instead.
-- This function does not change a restriction, review, invitation or payout.
create or replace function public.read_sybil_v2_early_hold_liveness(
  p_network text
)
returns table(
  open_holds bigint,
  incomplete_core_holds bigint,
  stalled_over_1h bigint,
  stalled_over_24h bigint
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  with active_episodes as (
    select
      a.invite_code,
      not (
        (coalesce(a.required_checks, '[]'::jsonb) - 'CHAIN_FINALITY')
        <@ coalesce(a.completed_checks, '[]'::jsonb)
      ) as incomplete_core,
      coalesce(
        (
          select min(h.created_at)
          from public.sybil_v2_assessment_events h
          where h.invite_code = a.invite_code
            and h.network = a.network
            and h.state = 'HOLD'
            and h.revision > coalesce(
              (
                select max(previous.revision)
                from public.sybil_v2_assessment_events previous
                where previous.invite_code = a.invite_code
                  and previous.network = a.network
                  and previous.state <> 'HOLD'
              ), 0
            )
        ),
        a.assessed_at
      ) as first_held_at
    from public.operator_sybil_v2_operator_action_candidates a
    where a.network = lower(btrim(p_network))
  )
  select
    count(*)::bigint,
    count(*) filter (where incomplete_core)::bigint,
    count(*) filter (
      where first_held_at <= now() - interval '1 hour'
    )::bigint,
    count(*) filter (
      where first_held_at <= now() - interval '24 hours'
    )::bigint
  from active_episodes;
$function$;

revoke all on function public.read_sybil_v2_early_hold_liveness(text)
from public, anon, authenticated;
grant execute on function public.read_sybil_v2_early_hold_liveness(text)
to service_role;

comment on function public.read_sybil_v2_early_hold_liveness(text) is
  'Count early Sybil HOLDs and incomplete core checks for a read-only 15-minute reliability alert. First HOLD date survives repeat assessments, but resets on a resolved/non-HOLD episode; never automatically clears or blacklists.';
