-- Staged, disabled-by-default vote-round reservation liveness exclusion.
-- Apply ONLY with docs/staged-sql/20261112_reward_vote_round_close_batch_v1.sql,
-- AFTER isolated financial QA. This is a full clone of the Production
-- read_stale_reward_reservation_liveness reader plus an extra guarded NOT EXISTS.
-- Existing elastic closure exclusion and all other filters are preserved.
-- Do NOT execute in Production without formal migration and deployment gates.
CREATE OR REPLACE FUNCTION public.read_stale_reward_reservation_liveness(p_network text, p_stale_minutes integer DEFAULT 15)
 RETURNS TABLE(missing_count bigint, oldest_reward_eligible_at timestamp with time zone, invite_codes text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with parameters as (
    select
      lower(btrim(p_network)) as network,
      greatest(5, least(coalesce(p_stale_minutes, 15), 1440)) as stale_minutes
  ),
  missing as (
    select
      i.invite_code,
      i.reward_eligible_at
    from public.invitations i
    cross join parameters p
    join public.sybil_v2_referral_assessments a
      on a.invite_code = i.invite_code
     and a.network = p.network
     and a.state = 'CLEAR'
    join public.sybil_v2_reward_clearances c
      on c.invite_code = i.invite_code
     and c.network = p.network
     and c.verdict = 'CLEAR'
     and c.assessment_revision = a.revision
    where i.activation_network = p.network
      and i.status = 'COMPLETED'
      and i.reward_status = 'ELIGIBLE'
      and i.reward_eligible_at is not null
      and i.reward_eligible_at <=
        clock_timestamp() - make_interval(mins => p.stale_minutes)
      and i.sybil_status = 'CLEAR'
      and i.sybil_checked_at is not null
      and i.impact_sync_complete_at is not null
      and i.eligibility_check_id is not null
      and i.reward_cohort_round_id is not null
      and i.reward_funding_allocation_receipt_id is not null
      and not exists (
        select 1
        from public.sybil_v2_wallet_restrictions r
        where r.network = p.network
          and r.status = 'ACTIVE'
          and r.wallet_address in (
            lower(i.inviter_wallet),
            lower(i.invitee_wallet)
          )
      )
      and not exists (
        select 1
        from public.reward_queue_entries q
        where q.invite_code = i.invite_code
      )
      and not exists (
        select 1
        from public.reward_recovery_settlements s
        where s.invite_code = i.invite_code
      )
      and not exists (
        select 1
        from public.reward_reservation_legacy_exclusions x
        where x.invite_code = i.invite_code
      )

      and not exists (
        select 1 from reward_admission_bridge.elastic_settlement_settings e
        where e.id=1 and e.enabled
          and i.activated_at>=e.rollout_not_before
          and not exists (
            select 1 from public.invitations old
            where old.activation_network=i.activation_network
              and old.reward_cohort_round_id=i.reward_cohort_round_id
              and old.reward_funding_allocation_receipt_id=i.reward_funding_allocation_receipt_id
              and old.status<>'CANCELLED'
              and (old.activated_at is null
                or old.activated_at<e.rollout_not_before)
          )
          and (
            not exists (
              select 1 from public.vebetter_round_allocations done
              where done.network=i.activation_network
                and done.vebetter_round_id=i.reward_cohort_round_id
                and done.observed_at<=clock_timestamp()
                    -make_interval(hours=>e.close_grace_hours)
            )
            or exists (
              select 1 from public.invitations pending
              where pending.activation_network=i.activation_network
                and pending.reward_cohort_round_id=i.reward_cohort_round_id
                and pending.reward_funding_allocation_receipt_id=i.reward_funding_allocation_receipt_id
                and pending.status<>'CANCELLED'
                and not (
                  pending.status='COMPLETED'
                  and pending.sybil_status='CLEAR'
                  and pending.vote_completed
                  and pending.reward_eligible_at is not null
                )
            )
          )
      )
      -- Vote-round shared settlement intentionally waits for the actual
      -- allocation receipt and its grace period. Such waits are not failures.
      -- If the receipt has not arrived after 14 days, or a Sybil/evidence
      -- review is still blocking a cohort 48h after grace, alert again.
      and not exists (
        select 1
        from reward_admission_bridge.vote_round_close_settings vr
        where vr.id=1 and vr.enabled
          and i.vote_round_id>=vr.first_vote_round_id
          and (
            (
              i.vote_completed_at > clock_timestamp()-interval '14 days'
              and not exists (
                select 1 from public.vebetter_round_allocations receipt
                where receipt.network=i.activation_network
                  and receipt.vebetter_round_id=i.vote_round_id
                  and receipt.app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
              )
            )
            or exists (
              select 1 from public.vebetter_round_allocations receipt
              where receipt.network=i.activation_network
                and receipt.vebetter_round_id=i.vote_round_id
                and receipt.app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
                and receipt.observed_at >
                    clock_timestamp()-make_interval(hours=>vr.grace_hours)
            )
            or exists (
              select 1 from public.vebetter_round_allocations receipt
              where receipt.network=i.activation_network
                and receipt.vebetter_round_id=i.vote_round_id
                and receipt.app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
                and receipt.observed_at >
                    clock_timestamp()-make_interval(hours=>vr.grace_hours+48)
                and exists (
                  select 1 from public.invitations pending
                  where pending.activation_network=i.activation_network
                    and pending.vote_round_id=i.vote_round_id
                    and pending.vote_completed=true
                    and pending.status='COMPLETED'
                    and pending.sybil_status<>'BLOCKED'
                    and pending.reward_status not in ('FORFEITED','PAID')
                    and pending.ineligible_at is null
                    and (
                      pending.sybil_status<>'CLEAR'
                      or pending.reward_status<>'ELIGIBLE'
                      or pending.reward_eligible_at is null
                    )
                )
            )
          )
      )
  )
  select
    count(*)::bigint,
    min(m.reward_eligible_at),
    coalesce(
      (
        select array_agg(s.invite_code order by s.reward_eligible_at, s.invite_code)
        from (
          select invite_code, reward_eligible_at
          from missing
          order by reward_eligible_at, invite_code
          limit 25
        ) s
      ),
      array[]::text[]
    )
  from missing m;
$function$;
