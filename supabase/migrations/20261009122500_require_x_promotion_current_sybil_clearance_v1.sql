-- Require current Sybil v2 CLEAR authority before final X promotion verification.
-- LIVE X promotion remains disabled. This only hardens the dormant verification path.

do $$
declare
  v_enabled boolean;
begin
  select reward_x_promotion_enabled
  into v_enabled
  from public.reward_runtime_config
  where id=1;

  if coalesce(v_enabled,false) then
    raise exception 'REWARD_X_PROMOTION_SYBIL_HARDENING_REQUIRES_LIVE_DISABLED';
  end if;
end $$;

create or replace function public.finalize_reward_x_promotion_post_verification_v1(
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
  v_post_id text := btrim(coalesce(p_x_post_id,''));
  v_author_id text := btrim(coalesce(p_x_author_id,''));
  v_url text := btrim(coalesce(p_matched_expanded_url,''));
  v_now timestamptz := clock_timestamp();
  v_verification public.reward_x_promotion_post_verifications%rowtype;
  v_opportunity public.reward_x_promotion_opportunities%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_invitation public.invitations%rowtype;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;
  if v_post_id !~ '^[0-9]{1,32}$'
     or v_author_id !~ '^[0-9]{1,32}$' then
    raise exception 'REWARD_X_PROMOTION_POST_IDENTITY_INVALID';
  end if;
  if char_length(v_url) not between 1 and 2048
     or v_url !~* '^https://veinvite\.vercel\.app/' then
    raise exception 'REWARD_X_PROMOTION_MATCHED_URL_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_x_promotion_' || v_code,0)
  );

  select * into v_verification
  from public.reward_x_promotion_post_verifications p
  where p.invite_code=v_code
  for update;

  if not found then
    raise exception 'REWARD_X_PROMOTION_POST_VERIFICATION_MISSING';
  end if;

  if v_verification.verification_state='FINAL_VERIFIED' then
    return jsonb_build_object(
      'finalized',true,
      'reason','ALREADY_FINAL_VERIFIED',
      'inviteCode',v_code,
      'verificationId',v_verification.id,
      'finalVerifiedAt',v_verification.final_verified_at
    );
  end if;

  if v_verification.verification_state not in ('INITIAL_VERIFIED','REVIEW_REQUIRED') then
    raise exception 'REWARD_X_PROMOTION_POST_NOT_FINALIZABLE';
  end if;

  if v_now<v_verification.verify_after then
    raise exception 'REWARD_X_PROMOTION_POST_RETENTION_PENDING';
  end if;

  if v_verification.x_post_id<>v_post_id
     or v_verification.x_author_id<>v_author_id then
    raise exception 'REWARD_X_PROMOTION_POST_IDENTITY_MISMATCH';
  end if;

  select * into v_opportunity
  from public.reward_x_promotion_opportunities x
  where x.id=v_verification.opportunity_id;

  if not found
     or position(v_opportunity.share_token::text in v_url)=0 then
    raise exception 'REWARD_X_PROMOTION_POST_SHARE_TOKEN_MISSING';
  end if;

  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.id=v_verification.obligation_id;

  if not found or v_obligation.financial_state<>'HELD' then
    raise exception 'REWARD_X_PROMOTION_POST_OBLIGATION_NOT_HELD';
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code=v_code;

  if not found
     or v_invitation.sybil_status<>'CLEAR'
     or public.is_sybil_v2_referral_invalidated(v_code,v_verification.network)
     or exists (
       select 1
       from public.sybil_v2_wallet_restrictions r
       where r.network=v_verification.network
         and r.status='ACTIVE'
         and r.wallet_address in (
           lower(v_verification.recipient_wallet),
           lower(v_invitation.invitee_wallet)
         )
     )
     or (
       public.sybil_v2_enforcement_enabled()
       and not exists (
         select 1
         from public.sybil_v2_referral_assessments a
         join public.sybil_v2_reward_clearances c
           on c.invite_code=a.invite_code
          and c.network=a.network
          and c.assessment_revision=a.revision
          and c.verdict='CLEAR'
         where a.invite_code=v_code
           and a.network=v_verification.network
           and a.state='CLEAR'
       )
     ) then
    raise exception 'REWARD_X_PROMOTION_POST_SECURITY_NOT_CLEAR';
  end if;

  update public.reward_x_promotion_post_verifications p
  set verification_state='FINAL_VERIFIED',
      final_verified_at=v_now,
      invalidated_at=null,
      state_reason=null,
      updated_at=v_now
  where p.id=v_verification.id
  returning * into v_verification;

  return jsonb_build_object(
    'finalized',true,
    'reason','FINAL_VERIFIED',
    'inviteCode',v_code,
    'verificationId',v_verification.id,
    'finalVerifiedAt',v_verification.final_verified_at
  );
end;
$function$;

revoke all on function public.finalize_reward_x_promotion_post_verification_v1(text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.finalize_reward_x_promotion_post_verification_v1(text,text,text,text)
  to service_role;
