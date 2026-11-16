-- DRAFT / DISABLED: must run standalone SQL tests before any Production migration.
-- Adds one bounded immediate-pricing mode while keeping the current
-- round-close policy fully authoritative until a guarded activation.
CREATE TABLE IF NOT EXISTS reward_admission_bridge.vote_window_immediate_settings (
  id smallint PRIMARY KEY CHECK(id=1),
  enabled boolean NOT NULL DEFAULT false,
  first_vote_round_id bigint NOT NULL CHECK(first_vote_round_id>0),
  last_vote_round_id bigint NOT NULL CHECK(last_vote_round_id>=first_vote_round_id)
);
INSERT INTO reward_admission_bridge.vote_window_immediate_settings
(id,enabled,first_vote_round_id,last_vote_round_id)
VALUES(1,false,125,125) ON CONFLICT(id) DO NOTHING;
REVOKE ALL ON reward_admission_bridge.vote_window_immediate_settings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON reward_admission_bridge.vote_window_immediate_settings TO service_role;

CREATE TABLE IF NOT EXISTS reward_admission_bridge.vote_window_fixed_quotes (
 network text NOT NULL CHECK(network IN ('mainnet','testnet','testnet-staging')),
 vote_round_id bigint NOT NULL CHECK(vote_round_id>0),
 source_cohort_round_id bigint NOT NULL CHECK(source_cohort_round_id>0),
 participant_count bigint NOT NULL CHECK(participant_count BETWEEN 1 AND 5000),
 quote_wei numeric(78,0) NOT NULL CHECK(quote_wei>0),
 x_reserve_per_participant_wei numeric(78,0) NOT NULL CHECK(x_reserve_per_participant_wei>=0),
 observed_pool_wei numeric(78,0) NOT NULL CHECK(observed_pool_wei>=0),
 fixed_outstanding_wei numeric(78,0) NOT NULL CHECK(fixed_outstanding_wei>=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(network,vote_round_id)
);
REVOKE ALL ON reward_admission_bridge.vote_window_fixed_quotes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON reward_admission_bridge.vote_window_fixed_quotes TO service_role;

CREATE OR REPLACE FUNCTION public.read_vote_window_immediate_mode_v1(p_network text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','reward_admission_bridge'
AS $body$
DECLARE s reward_admission_bridge.vote_window_immediate_settings%rowtype;
BEGIN
 IF p_network NOT IN ('mainnet','testnet','testnet-staging') THEN
   RAISE EXCEPTION 'INVALID_WINDOW_NETWORK';
 END IF;
 SELECT * INTO s FROM reward_admission_bridge.vote_window_immediate_settings WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'IMMEDIATE_WINDOW_SETTINGS_MISSING'; END IF;
 RETURN jsonb_build_object('enabled',s.enabled,
   'firstVoteRoundId',s.first_vote_round_id,'lastVoteRoundId',s.last_vote_round_id);
END;
$body$;
REVOKE ALL ON FUNCTION public.read_vote_window_immediate_mode_v1(text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_vote_window_immediate_mode_v1(text)
TO service_role;

-- Extends, rather than removes, the previous round-close guard.
-- Only the immutable quote row created by the new canonical writer can
-- authorize early reservation. A forged basis cannot bypass it.
CREATE OR REPLACE FUNCTION public.guard_vote_round_close_single_reservation_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','reward_admission_bridge'
AS $guard$
DECLARE cfg reward_admission_bridge.vote_round_close_settings%rowtype;
        wcfg reward_admission_bridge.vote_window_immediate_settings%rowtype;
        q reward_admission_bridge.vote_window_fixed_quotes%rowtype;
        vote_round bigint;
        source_round bigint;
BEGIN
 SELECT * INTO cfg FROM reward_admission_bridge.vote_round_close_settings WHERE id=1;
 IF NOT FOUND OR NOT cfg.enabled THEN RETURN NEW; END IF;
 SELECT i.vote_round_id,i.reward_cohort_round_id
   INTO vote_round,source_round
 FROM public.invitations i WHERE i.invite_code=NEW.invite_code
   AND i.activation_network=NEW.network;
 IF vote_round IS NULL OR vote_round<cfg.first_vote_round_id THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.reserved_amount_wei IS NOT NULL
    AND NEW.reserved_amount_wei IS NOT DISTINCT FROM OLD.reserved_amount_wei
    AND NEW.reservation_algorithm_version IS NOT DISTINCT FROM OLD.reservation_algorithm_version
    AND NEW.reservation_basis IS NOT DISTINCT FROM OLD.reservation_basis
 THEN RETURN NEW; END IF;
 IF cfg.paused THEN RAISE EXCEPTION 'VOTE_ROUND_CLOSE_NEW_RESERVATIONS_PAUSED'; END IF;
 IF coalesce(NEW.reservation_basis->>'quoteKind','')='vote_window_immediate_v1' THEN
    SELECT * INTO wcfg FROM reward_admission_bridge.vote_window_immediate_settings WHERE id=1;
    SELECT * INTO q FROM reward_admission_bridge.vote_window_fixed_quotes x
      WHERE x.network=NEW.network AND x.vote_round_id=vote_round;
    IF q.vote_round_id IS NULL OR wcfg.id IS NULL OR NOT wcfg.enabled
       OR vote_round NOT BETWEEN wcfg.first_vote_round_id AND wcfg.last_vote_round_id
       OR source_round IS DISTINCT FROM q.source_cohort_round_id
       OR NEW.reservation_algorithm_version IS DISTINCT FROM 'shared-pool-v1'
       OR NEW.reserved_amount_wei IS DISTINCT FROM q.quote_wei
       OR coalesce(NEW.reservation_basis->>'voteRoundId','')<>vote_round::text
       OR coalesce(NEW.reservation_basis->>'participantCount','')<>q.participant_count::text
    THEN RAISE EXCEPTION 'VOTE_WINDOW_UNVERIFIED_IMMEDIATE_QUOTE'; END IF;
    RETURN NEW;
 END IF;
 IF NEW.reserved_amount_wei IS NULL OR NEW.reserved_amount_wei<=0
    OR NEW.reservation_algorithm_version IS DISTINCT FROM 'shared-pool-v1'
    OR coalesce(NEW.reservation_basis->>'roundClosePolicy','')<>'vote-round-close-equal-v1'
    OR coalesce(NEW.reservation_basis->>'quoteKind','')<>'vote_round_close_equal_v1'
    OR coalesce(NEW.reservation_basis->>'voteRoundId','')<>vote_round::text
    OR coalesce(NEW.reservation_basis->>'batchVerifiedCount','') !~ '^[1-9][0-9]*$'
 THEN RAISE EXCEPTION 'VOTE_ROUND_CLOSE_LEGACY_NEW_RESERVATION_BLOCKED'; END IF;
 RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.guard_vote_round_close_single_reservation_v1()
FROM PUBLIC,anon,authenticated;
-- Existing queue BEFORE INSERT/UPDATE trigger remains unchanged.
