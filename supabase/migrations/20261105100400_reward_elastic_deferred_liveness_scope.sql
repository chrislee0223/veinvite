-- Keep reservation-liveness monitors strict, but exclude the one intentional
-- delay: eligible new-cohort users awaiting official round close or unresolved
-- peers. This function was already service-only before this migration.
BEGIN;
DO $change$
DECLARE
 source_sql text;
 anchor_sql text := $old$
      and not exists (
        select 1
        from public.reward_reservation_legacy_exclusions x
        where x.invite_code = i.invite_code
      )$old$;
 additional_sql text := $new$
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
      )$new$;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO source_sql
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='read_stale_reward_reservation_liveness';
 IF source_sql IS NULL OR strpos(source_sql,anchor_sql)=0
    OR strpos(source_sql,'elastic_settlement_settings')>0 THEN
   RAISE EXCEPTION 'ELASTIC_LIVENESS_BASELINE_DRIFT';
 END IF;
 EXECUTE replace(source_sql,anchor_sql,anchor_sql||E'\n'||additional_sql);
END $change$;
COMMIT;
