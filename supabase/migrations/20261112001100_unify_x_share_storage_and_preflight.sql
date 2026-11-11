-- Repair X share Post storage mismatch and prevent future billing on
-- incompatible contracts. A single immutable shape predicate is used by
-- the private URL matcher and verification table CHECK.
BEGIN;
CREATE OR REPLACE FUNCTION public.reward_x_promotion_canonical_share_url_shape_v1(p_url text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT lower(btrim(p_url)) ~
    '^https://veinvite\.vercel\.app/s/([a-z0-9_-]{16}|[a-z0-9_-]{22,64})/?\?(v=[a-z0-9_-]{1,32}&)?xp=[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
$function$
;
REVOKE ALL ON FUNCTION public.reward_x_promotion_canonical_share_url_shape_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reward_x_promotion_canonical_share_url_shape_v1(text) TO service_role;
ALTER TABLE public.reward_x_promotion_post_verifications
 DROP CONSTRAINT reward_x_promotion_post_verifications_canonical_share_url_check;
ALTER TABLE public.reward_x_promotion_post_verifications
 ADD CONSTRAINT reward_x_promotion_post_verifications_canonical_share_url_check
 CHECK (public.reward_x_promotion_canonical_share_url_shape_v1(matched_expanded_url));
CREATE OR REPLACE FUNCTION public.reward_x_promotion_share_url_matches_v1(p_url text, p_share_token uuid, p_recipient_wallet text, p_require_active boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_url text := btrim(p_url);
  v_wallet text := lower(btrim(p_recipient_wallet));
  v_match text[];
  v_referral_key text;
  v_token text;
BEGIN
  IF v_wallet !~ '^0x[0-9a-f]{40}$'
     OR NOT public.reward_x_promotion_canonical_share_url_shape_v1(v_url) THEN
    RETURN false;
  END IF;
  SELECT regexp_match(
    v_url,
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
$function$
;
REVOKE ALL ON FUNCTION public.reward_x_promotion_share_url_matches_v1(text,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reward_x_promotion_share_url_matches_v1(text,uuid,text,boolean) TO service_role;
COMMIT;
