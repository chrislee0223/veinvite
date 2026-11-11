-- Accept the canonical X share URL emitted by VeInvite:
-- /s/<owned-key>?v=<card-version>&xp=<exact-token>, plus legacy xp-only.
-- Preserve the exact host, single token, active/owned key, and revocation
-- requirements; do not modify any X eligibility or reward financial state.
BEGIN;
CREATE OR REPLACE FUNCTION public.reward_x_promotion_share_url_matches_v1(
  p_url text,p_share_token uuid,p_recipient_wallet text,p_require_active boolean
) RETURNS boolean LANGUAGE plpgsql STABLE STRICT
SET search_path TO 'pg_catalog','public' AS $fn$
DECLARE
  v_url text := btrim(p_url);
  v_wallet text := lower(btrim(p_recipient_wallet));
  v_match text[];
  v_referral_key text;
  v_token text;
BEGIN
  IF v_wallet !~ '^0x[0-9a-f]{40}$' THEN RETURN false; END IF;
  SELECT regexp_match(v_url,
    '^https://veinvite\.vercel\.app/s/([A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22,64})/?\?(v=[A-Za-z0-9_-]{1,32}&)?xp=([0-9a-fA-F-]{36})$'
  ) INTO v_match;
  IF v_match IS NULL OR cardinality(v_match)<>3 THEN RETURN false; END IF;
  v_referral_key:=v_match[1];
  v_token:=lower(v_match[3]);
  IF v_token<>lower(p_share_token::text) THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.referral_links r
    WHERE r.referral_key=v_referral_key
      AND lower(r.inviter_wallet)=v_wallet
      AND r.status<>'REVOKED'
      AND (NOT p_require_active OR r.status='ACTIVE')
  );
END;
$fn$;

-- Preflight on actual client share version before billable X Post reads.
-- Existing verified Posts use their immutable initially matched URL.
CREATE OR REPLACE FUNCTION public.read_reward_x_promotion_share_contract_ready_v1(
  p_invite_code text,p_card_version text,p_final boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO 'pg_catalog','public' AS $fn$
DECLARE
  v_code text:=upper(btrim(coalesce(p_invite_code,'')));
  v_version text:=btrim(coalesce(p_card_version,''));
  v_opportunity public.reward_x_promotion_opportunities%rowtype;
  v_initial_url text;
BEGIN
  IF v_code !~ '^[A-HJ-NP-Z2-9]{7}$'
     OR v_version !~ '^[A-Za-z0-9_-]{1,32}$' THEN RETURN false; END IF;
  SELECT * INTO v_opportunity FROM public.reward_x_promotion_opportunities
    WHERE invite_code=v_code;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_final THEN
    SELECT matched_expanded_url INTO v_initial_url
    FROM public.reward_x_promotion_post_verifications
    WHERE opportunity_id=v_opportunity.id
      AND verification_state IN ('INITIAL_VERIFIED','REVIEW_REQUIRED','FINAL_VERIFIED')
    ORDER BY id DESC LIMIT 1;
    RETURN coalesce(public.reward_x_promotion_share_url_matches_v1(
      v_initial_url,v_opportunity.share_token,v_opportunity.recipient_wallet,false
    ),false);
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.referral_links r
    WHERE lower(r.inviter_wallet)=lower(v_opportunity.recipient_wallet)
      AND r.status='ACTIVE'
      AND public.reward_x_promotion_share_url_matches_v1(
        'https://veinvite.vercel.app/s/'||r.referral_key||
        '?v='||v_version||'&xp='||v_opportunity.share_token::text,
        v_opportunity.share_token,v_opportunity.recipient_wallet,true
      )
  );
END;
$fn$;

-- Detect three recent retries while the user's X bonus is still held.
-- No insertion, update, claim, API call or second monitor is introduced.
CREATE OR REPLACE FUNCTION public.read_reward_x_promotion_stuck_submissions_v1(
  p_network text
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'pg_catalog','public' AS $fn$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'inviteCode',q.invite_code,'retryCount',q.retry_count,
    'lastAttemptAt',q.last_attempt_at
  ) ORDER BY q.last_attempt_at DESC),'[]'::jsonb)
  FROM (
    SELECT s.invite_code,count(a.id)::integer retry_count,
           max(a.attempted_at) last_attempt_at
    FROM public.reward_x_promotion_post_submissions s
    JOIN public.reward_x_promotion_obligations o ON o.id=s.obligation_id
    JOIN public.reward_x_promotion_verification_attempts a
      ON a.submission_id=s.id AND a.phase='INITIAL_RETRY'
      AND a.outcome='RETRY'
      AND a.attempted_at >= now()-interval '3 hours'
    WHERE s.network=lower(btrim(p_network))
      AND s.submission_state='PENDING'
      AND o.financial_state='HELD'
    GROUP BY s.id,s.invite_code
    HAVING count(a.id)>=3
       AND max(a.attempted_at)>=now()-interval '60 minutes'
    ORDER BY max(a.attempted_at) DESC LIMIT 5
  ) q;
$fn$;

REVOKE ALL ON FUNCTION public.read_reward_x_promotion_share_contract_ready_v1(text,text,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_reward_x_promotion_share_contract_ready_v1(text,text,boolean)
 TO service_role;
REVOKE ALL ON FUNCTION public.read_reward_x_promotion_stuck_submissions_v1(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_reward_x_promotion_stuck_submissions_v1(text)
 TO service_role;
COMMIT;