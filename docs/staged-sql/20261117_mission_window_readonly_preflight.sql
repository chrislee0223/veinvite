-- READ-ONLY Production preflight. Run as an operator; NEVER writes or resets.
-- The present shared-pool policy already excludes unfinished mission balances
-- from physical reward liabilities. No old invite should be cancelled here.
WITH current_round AS (
  SELECT coalesce(max(vebetter_round_id),0)+1 AS round_id
  FROM public.vebetter_round_allocations
  WHERE network='mainnet'
    AND app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
), overview AS (
  SELECT
    count(*) FILTER (
      WHERE status='ACTIVATING' AND reward_status='PENDING'
    ) AS unfinished,
    count(*) FILTER (
      WHERE status='ACTIVATING' AND reward_status='PENDING'
        AND activated_at < clock_timestamp()-interval '7 days'
    ) AS unfinished_older_than_week,
    count(*) FILTER (
      WHERE status='ACTIVATING' AND reward_status='PENDING'
        AND activated_at >= clock_timestamp()-interval '7 days'
    ) AS unfinished_recent,
    count(*) FILTER (
      WHERE status='COMPLETED' AND reward_status='ELIGIBLE'
    ) AS verified_unclaimed,
    count(*) FILTER (
      WHERE status='COMPLETED' AND reward_status='PAID'
    ) AS paid_immutable
  FROM public.invitations
  WHERE activation_network='mainnet'
)
SELECT jsonb_build_object(
  'readOnly',true,
  'estimatedCurrentRoundFromAllocation',r.round_id,
  'unfinished',o.unfinished,
  'unfinishedOlderThanSevenDays',o.unfinished_older_than_week,
  'unfinishedRecentlyActivated',o.unfinished_recent,
  'verifiedUnclaimedProtected',o.verified_unclaimed,
  'historicalPaidProtected',o.paid_immutable,
  'sharedPoolMode',public.read_reward_shared_pool_mode_v1('mainnet'),
  'voteRoundCloseMode',public.read_reward_vote_round_close_mode_v1('mainnet'),
  'existingCompletedClaims',
    (SELECT count(*) FROM public.reward_queue_entries q
     WHERE q.network='mainnet' AND q.reserved_amount_wei IS NOT NULL)
)
FROM current_round r CROSS JOIN overview o;
