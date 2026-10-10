-- Pre-LIVE hardening: require the exact canonical VeInvite referral share
-- URL for both initial and final X promotion verification.
-- LIVE and payout remain disabled while this migration is introduced.

create or replace function public.reward_x_promotion_share_url_matches_v1(
  p_url text,
  p_share_token uuid
)
returns boolean
language sql
immutable
strict
set search_path to 'pg_catalog','public'
as $function$
  select
    lower(btrim(p_url)) ~ (
      '^https://veinvite\\.vercel\\.app/s/' ||
      '([a-z0-9_-]{16}|[a-z0-9_-]{22,64})/?\\?xp=' ||
      lower(p_share_token::text) ||
      '$'
    );
$function$;

alter table public.reward_x_promotion_post_verifications
  drop constraint if exists reward_x_promotion_post_verifications_canonical_share_url_check,
  add constraint reward_x_promotion_post_verifications_canonical_share_url_check
    check (
      lower(btrim(matched_expanded_url)) ~
      '^https://veinvite\\.vercel\\.app/s/([a-z0-9_-]{16}|[a-z0-9_-]{22,64})/?\\?xp=[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    );

create or replace function public.record_reward_x_promotion_initial_post_verification_v2(
  p_invite_code text,
  p_x_post_id text,
  p_x_author_id text,
  p_x_post_created_at timestamptz,
  p_matched_expanded_url text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_token uuid;
begin
  select o.share_token
  into v_token
  from public.reward_x_promotion_opportunities o
  where o.invite_code=v_code;

  if not found
     or not public.reward_x_promotion_share_url_matches_v1(
       p_matched_expanded_url,
       v_token
     ) then
    raise exception 'REWARD_X_PROMOTION_MATCHED_URL_IDENTITY_INVALID';
  end if;

  return public.record_reward_x_promotion_initial_post_verification_v1(
    p_invite_code,
    p_x_post_id,
    p_x_author_id,
    p_x_post_created_at,
    p_matched_expanded_url
  );
end;
$function$;

create or replace function public.finalize_reward_x_promotion_post_verification_v2(
  p_invite_code text,
  p_x_post_id text,
  p_x_author_id text,
  p_matched_expanded_url text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_token uuid;
begin
  select o.share_token
  into v_token
  from public.reward_x_promotion_opportunities o
  where o.invite_code=v_code;

  if not found
     or not public.reward_x_promotion_share_url_matches_v1(
       p_matched_expanded_url,
       v_token
     ) then
    raise exception 'REWARD_X_PROMOTION_MATCHED_URL_IDENTITY_INVALID';
  end if;

  return public.finalize_reward_x_promotion_post_verification_v1(
    p_invite_code,
    p_x_post_id,
    p_x_author_id,
    p_matched_expanded_url
  );
end;
$function$;

revoke all on function public.reward_x_promotion_share_url_matches_v1(text,uuid)
  from public,anon,authenticated;
grant execute on function public.reward_x_promotion_share_url_matches_v1(text,uuid)
  to service_role;

revoke all on function public.record_reward_x_promotion_initial_post_verification_v1(text,text,text,timestamptz,text)
  from public,anon,authenticated,service_role;
revoke all on function public.finalize_reward_x_promotion_post_verification_v1(text,text,text,text)
  from public,anon,authenticated,service_role;

revoke all on function public.record_reward_x_promotion_initial_post_verification_v2(text,text,text,timestamptz,text)
  from public,anon,authenticated;
grant execute on function public.record_reward_x_promotion_initial_post_verification_v2(text,text,text,timestamptz,text)
  to service_role;

revoke all on function public.finalize_reward_x_promotion_post_verification_v2(text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.finalize_reward_x_promotion_post_verification_v2(text,text,text,text)
  to service_role;

comment on function public.reward_x_promotion_share_url_matches_v1(text,uuid) is
  'Accepts only the canonical VeInvite referral share URL /s/<referral-key>?xp=<exact opportunity token>.';
