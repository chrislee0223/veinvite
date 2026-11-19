-- VeInvite: production READ-ONLY aggregate audit for onboarding eligibility.
-- No individual wallet addresses are returned. No inserts, updates or DDL.
-- The counts here are diagnostic only; never use them as payout authorization.
WITH RECURSIVE status AS (
  SELECT i.id,i.status,i.activation_network,i.vote_round_id,i.activation_block,
    i.apps_completed_block,i.vote_completed_block,i.vot3_converted_block,
    i.apps_completed,i.vote_completed,i.vot3_converted,i.reward_status,
    i.sybil_status,i.identity_link_status,
    EXISTS(
      SELECT 1 FROM public.sybil_v2_referral_invalidations v
      WHERE v.invite_code=i.invite_code
        AND v.network=i.activation_network AND v.status='ACTIVE'
    ) AS bad_invalidation,
    EXISTS(
      SELECT 1 FROM public.sybil_v2_wallet_restrictions w
      WHERE w.wallet_address=i.invitee_wallet
        AND w.network=i.activation_network AND w.status='ACTIVE'
    ) AS bad_wallet,
    EXISTS(
      SELECT 1 FROM public.sybil_v2_referral_assessments a
      WHERE a.invite_code=i.invite_code
        AND a.network=i.activation_network
        AND a.state='CLEAR' AND a.revision>=1
    ) AS clear_assessment
  FROM public.invitations i
  WHERE i.activation_network='mainnet'
),
completed AS (SELECT * FROM status WHERE status='COMPLETED'),
parent_graph AS (
  SELECT network,lower(child_wallet) AS child,lower(sponsor_wallet) AS sponsor,
    relationship_effective_block AS cutoff
  FROM public.network_qualified_referral_relationships
  WHERE network='mainnet' AND relationship_effective_block IS NOT NULL
),
depths AS (
  SELECT e.child AS actor,e.sponsor AS ancestor,1 AS depth,
    ARRAY[e.child,e.sponsor] AS visited,e.cutoff AS event_cutoff,false AS cycle
  FROM parent_graph e
  UNION ALL
  SELECT d.actor,e.sponsor,d.depth+1,
    d.visited||e.sponsor,d.event_cutoff,e.sponsor=ANY(d.visited)
  FROM depths d JOIN parent_graph e ON d.ancestor=e.child
    AND e.cutoff<=d.event_cutoff
  WHERE d.depth<5 AND NOT d.cycle
),
counts AS (
  SELECT count(*) AS completed_total,
    count(*) FILTER(WHERE bad_invalidation) AS invalidated,
    count(*) FILTER(WHERE bad_wallet) AS wallet_restricted,
    count(*) FILTER(WHERE clear_assessment AND NOT bad_invalidation
      AND NOT bad_wallet) AS eligible_sybil_snapshot,
    count(*) FILTER(WHERE clear_assessment AND NOT bad_invalidation
      AND NOT bad_wallet AND apps_completed>=3 AND vote_completed
      AND vot3_converted AND activation_block IS NOT NULL
      AND apps_completed_block IS NOT NULL AND vote_completed_block IS NOT NULL
      AND vote_round_id IS NOT NULL) AS structurally_complete,
    count(*) FILTER(WHERE apps_completed_block IS NOT NULL
      AND vote_completed_block IS NOT NULL
      AND apps_completed_block>=vote_completed_block) AS wrong_block_order,
    count(*) FILTER(WHERE vote_round_id IS NULL) AS missing_vote_round,
    count(*) FILTER(WHERE vot3_converted_block IS NULL) AS missing_vot3_block
  FROM completed
)
SELECT c.*, (SELECT count(*) FROM depths WHERE depth=1) AS level1_links,
  (SELECT count(*) FROM depths WHERE depth=2) AS level2_links,
  (SELECT count(*) FROM depths WHERE depth=3) AS level3_links,
  (SELECT count(*) FROM depths WHERE depth=4) AS level4_links,
  (SELECT count(*) FROM depths WHERE depth=5) AS level5_links,
  (SELECT count(*) FROM depths WHERE cycle) AS cycle_links
FROM counts c;
