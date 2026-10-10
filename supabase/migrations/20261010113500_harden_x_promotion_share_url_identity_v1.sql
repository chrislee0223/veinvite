-- Pre-LIVE hardening: require the exact canonical VeInvite referral share
-- URL for both initial and final X promotion verification.
-- LIVE and payout remain disabled while this migration is introduced.

do $guard$
declare
  v_live boolean;
  v_payout boolean;
begin
  select
    reward_x_promotion_enabled,
    reward_x_promotion_payout_enabled
  into v_live,v_payout
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  if coalesce(v_live,false) or coalesce(v_payout,false) then
    raise exception 'REWARD_X_PROMOTION_URL_HARDENING_REQUIRES_LIVE_AND_PAYOUT_DISABLED';
  end if;
end $guard$;

create or replace function public.reward_x_promotion_share_url_matches_v1(
  p_url text,
  p_share_token uuid,
  p_recipient_wallet text,
  p_require_active boolean
)
returns boolean
language plpgsql
stable
strict
set search_path to 'pg_catalog','public'
as $function$
declare
  v_url text := btrim(p_url);
  v_wallet text := lower(btrim(p_recipient_wallet));
  v_match text[];
  v_referral_key text;
  v_token text;
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    return false;
  end if;

  select regexp_match(
    v_url,
    '^https://veinvite\.vercel\.app/s/([A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22,64})/?\?xp=([0-9a-fA-F-]{36})$'
  )
  into v_match;

  if v_match is null or cardinality(v_match)<>2 then
    return false;
  end if;

  v_referral_key:=v_match[1];
  v_token:=lower(v_match[2]);

  if v_token<>lower(p_share_token::text) then
    return false;
  end if;

  return exists (
    select 1
    from public.referral_links r
    where r.referral_key=v_referral_key
      and lower(r.inviter_wallet)=v_wallet
      and r.status<>'REVOKED'
      and (not p_require_active or r.status='ACTIVE')
  );
end;
$function$;

alter table public.reward_x_promotion_post_verifications
  drop constraint if exists reward_x_promotion_post_verifications_canonical_share_url_check,
  add constraint reward_x_promotion_post_verifications_canonical_share_url_check
    check (
      lower(btrim(matched_expanded_url)) ~
      '^https://veinvite\.vercel\.app/s/([a-z0-9_-]{16}|[a-z0-9_-]{22,64})/?\?xp=[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
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
  v_recipient_wallet text;
begin
  select o.share_token,o.recipient_wallet
  into v_token,v_recipient_wallet
  from public.reward_x_promotion_opportunities o
  where o.invite_code=v_code;

  if not found
     or not public.reward_x_promotion_share_url_matches_v1(
       p_matched_expanded_url,
       v_token,
       v_recipient_wallet,
       true
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
  v_recipient_wallet text;
  v_initial_url text;
begin
  select o.share_token,o.recipient_wallet,p.matched_expanded_url
  into v_token,v_recipient_wallet,v_initial_url
  from public.reward_x_promotion_opportunities o
  join public.reward_x_promotion_post_verifications p
    on p.opportunity_id=o.id
  where o.invite_code=v_code;

  if not found
     or btrim(p_matched_expanded_url)<>btrim(v_initial_url)
     or not public.reward_x_promotion_share_url_matches_v1(
       p_matched_expanded_url,
       v_token,
       v_recipient_wallet,
       false
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

revoke all on function public.reward_x_promotion_share_url_matches_v1(text,uuid,text,boolean)
  from public,anon,authenticated,service_role;

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

drop function if exists public.reward_x_promotion_share_url_matches_v1(text,uuid);

comment on function public.reward_x_promotion_share_url_matches_v1(text,uuid,text,boolean) is
  'Accepts only the canonical VeInvite referral share URL /s/<owned-referral-key>?xp=<exact opportunity token>; initial verification can require the key to remain ACTIVE.';
