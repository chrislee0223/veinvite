-- X Post lookup retry cadence: retain the existing 15m Vercel cron,
-- immutable 24h retention, Sybil, X payout, and $5 monthly budget policy.
-- Production function checksum guards against drift from concurrent work.
BEGIN;
DO $verify$
BEGIN
  IF md5(pg_get_functiondef('public.read_reward_x_promotion_pending_post_candidates_v1(text,integer)'::regprocedure))
     <> '24072a1b5be02805a2facbc80823a3ca' THEN
    RAISE EXCEPTION 'X_PROMOTION_PENDING_CANDIDATE_FUNCTION_DRIFT';
  END IF;
END
$verify$;

CREATE OR REPLACE FUNCTION public.read_reward_x_promotion_pending_post_candidates_v1(p_network text, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_limit integer := greatest(1,least(coalesce(p_limit,10),50));
  v_rows jsonb;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'inviteCode',c.invite_code,
        'submissionId',c.submission_id,
        'xPostId',c.x_post_id,
        'shareToken',c.share_token,
        'submittedAt',c.submitted_at
      )
      order by c.submitted_at,c.submission_id
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      u.invite_code,
      u.id as submission_id,
      u.x_post_id,
      x.share_token::text as share_token,
      u.submitted_at
    from public.reward_x_promotion_post_submissions u
    join public.reward_x_promotion_opportunities x
      on x.id=u.opportunity_id
    join public.reward_x_promotion_obligations o
      on o.id=u.obligation_id
    left join lateral (
      select a.attempted_at as latest_attempt_at, a.reason as latest_reason
      from public.reward_x_promotion_verification_attempts a
      where a.submission_id=u.id
        and a.phase='INITIAL_RETRY'
      order by a.attempted_at desc,a.id desc
      limit 1
    ) retry on true
    where u.network=v_network
      and u.submission_state='PENDING'
      and o.financial_state='HELD'
      and u.submitted_at <= now()-interval '10 minutes'
      and (
        retry.latest_attempt_at is null
        or retry.latest_attempt_at <= now() - (
          case
            -- Avoid making repeated billable X calls during provider throttles.
            when retry.latest_reason in ('X_API_RATE_LIMITED','X_API_AUTH_FAILED')
              then interval '60 minutes'
            when retry.latest_reason='X_API_BUDGET_EXHAUSTED'
              then interval '60 minutes'
            -- 12m headroom for a 15m cron tick; avoids the historical
            -- boundary miss that made ordinary retries take ~30m.
            else interval '12 minutes'
          end
        )
      )
    order by
      coalesce(retry.latest_attempt_at,u.submitted_at),
      u.id
    limit v_limit
  ) c;

  return jsonb_build_object(
    'network',v_network,
    'candidateCount',jsonb_array_length(v_rows),
    'candidates',v_rows
  );
end;
$function$
;

COMMIT;
