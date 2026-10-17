-- Sybil HOLD liveness v2: count actionable wait from when action became due,
-- not from when the wallet first entered an intentionally safe HOLD.
-- Read-only; does not change verdicts, sessions, invitations or rewards.
-- Preserve the four-column service RPC contract used by both alert sources.

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
      -- LEAST ignores NULL arguments in PostgreSQL. Each cause gets its
      -- own actual "first actionable" timestamp, rather than using the
      -- potentially days-old start of a harmless early HOLD.
      least(
        -- Operator-owned HOLDS have always been explicitly actionable.
        case when a.source = 'OPERATOR' or i.invite_code is null
          then coalesce(a.first_held_at, a.assessed_at)
        end,

        -- Fully complete immutable milestones must be present; never count
        -- partial pre-mission referrals. The latest milestone timestamp
        -- cannot precede the time the decision became actionable.
        case when
          coalesce(i.apps_completed, 0) >= 3
          and coalesce(i.rewards_received, 0) >= 3
          and i.vot3_converted is true
          and i.vote_completed is true
          and i.activation_block is not null
          and i.apps_completed_block is not null
          and i.vot3_converted_block is not null
          and i.vote_completed_block is not null
          then greatest(
            coalesce(a.first_held_at, a.assessed_at),
            coalesce(i.apps_completed_at, i.updated_at),
            coalesce(i.vot3_converted_at, i.updated_at),
            coalesce(i.vote_completed_at, i.updated_at)
          )
        end,

        -- Existing readiness semantic stays intact. Prefer the first HOLD
        -- assessment event with all core checks complete. Do not reset its
        -- timer on a harmless revision/heartbeat; if historical events are
        -- unavailable, conservatively start at the current assessment time.
        case when (
          (coalesce(a.required_checks, '[]'::jsonb) - 'CHAIN_FINALITY')
            <@ coalesce(a.completed_checks, '[]'::jsonb)
          )
          then greatest(
            coalesce(a.first_held_at, a.assessed_at),
            coalesce(core_completed.first_completed_at, a.updated_at)
          )
        end,

        -- The scan must have exhausted three attempts and still have an
        -- unresolved error. Its latest attempted-at time, not HOLD start,
        -- is the only timestamp available from the existing checkpoint.
        case when scan_fail.checked_at is not null
          then greatest(
            coalesce(a.first_held_at, a.assessed_at),
            scan_fail.checked_at
          )
        end,

        -- Evidence delivered now must not instantly inherit a pre-existing
        -- 24-hour HOLD age. Only previously unrepresented medium/high
        -- evidence for a SYSTEM HOLD enters this service-only view.
        case when fresh_evidence.priority_at is not null
          then greatest(
            coalesce(a.first_held_at, a.assessed_at),
            fresh_evidence.priority_at
          )
        end
      ) as actionable_since
    from public.operator_sybil_v2_operator_action_candidates a
    left join public.invitations i
      on i.invite_code = a.invite_code
      and i.activation_network = a.network
    left join lateral (
      select min(ev.created_at) as first_completed_at
      from public.sybil_v2_assessment_events ev
      where ev.invite_code = a.invite_code
        and ev.network = a.network
        and ev.state = 'HOLD'
        and ev.created_at >= coalesce(a.first_held_at, a.assessed_at)
        and (
          (coalesce(ev.required_checks, '[]'::jsonb) - 'CHAIN_FINALITY')
            <@ coalesce(ev.completed_checks, '[]'::jsonb)
        )
    ) core_completed on true
    left join lateral (
      select coalesce(s.checked_at, s.updated_at) as checked_at
      from public.sybil_v2_scan_checkpoints s
      where s.invite_code = a.invite_code
        and s.network = a.network
        and s.attempt_count >= 3
        and s.last_error is not null
      order by s.checked_at desc nulls last
      limit 1
    ) scan_fail on true
    left join lateral (
      select e.priority_at
      from public.operator_sybil_v2_hold_new_evidence_candidates e
      where e.invite_code = a.invite_code
        and e.network = a.network
      order by e.priority_at asc
      limit 1
    ) fresh_evidence on true
    where a.network = lower(btrim(p_network))
  )
  select
    count(*)::bigint,
    count(*) filter (where incomplete_core)::bigint,
    count(*) filter (
      where actionable_since <= now() - interval '1 hour'
    )::bigint,
    count(*) filter (
      where actionable_since <= now() - interval '24 hours'
    )::bigint
  from active_episodes;
$function$;

revoke all on function public.read_sybil_v2_early_hold_liveness(text)
from public, anon, authenticated;

grant execute on function public.read_sybil_v2_early_hold_liveness(text)
to service_role;

comment on function public.read_sybil_v2_early_hold_liveness(text) is
  'Count early HOLDs separately from overdue actionable checks; each operator, immutable mission, completed-core, failed-scan or new-evidence condition ages from its own actionable timestamp.';
