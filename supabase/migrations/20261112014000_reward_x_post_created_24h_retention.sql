BEGIN;
-- The retention clock begins when X confirms the Post was created, not when
-- the asynchronous initial verification finally ran.
-- No Sybil, base reward, X bonus financial state, or payout path is modified.
DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.reward_x_promotion_post_verifications p
    WHERE p.verify_after IS DISTINCT FROM
      p.x_post_created_at+make_interval(secs=>p.retention_seconds)
      AND NOT (
        p.verification_state IN ('INITIAL_VERIFIED','REVIEW_REQUIRED')
        AND p.verify_after=p.initial_verified_at+make_interval(secs=>p.retention_seconds)
      )
  ) THEN
    RAISE EXCEPTION 'X_PROMOTION_POST_RETENTION_BACKFILL_UNSAFE';
  END IF;
END;
$guard$;
-- The immutable row guard is suspended only within this one SQL transaction
-- to correct historical due dates; an error rolls the suspension back.
ALTER TABLE public.reward_x_promotion_post_verifications
  DISABLE TRIGGER guard_reward_x_promotion_post_verification_mutation_trigger;
UPDATE public.reward_x_promotion_post_verifications p
SET verify_after=p.x_post_created_at+make_interval(secs=>p.retention_seconds),
    updated_at=clock_timestamp()
WHERE p.verification_state IN ('INITIAL_VERIFIED','REVIEW_REQUIRED')
  AND p.verify_after=p.initial_verified_at+make_interval(secs=>p.retention_seconds)
  AND p.verify_after IS DISTINCT FROM
    p.x_post_created_at+make_interval(secs=>p.retention_seconds);
ALTER TABLE public.reward_x_promotion_post_verifications
  ENABLE TRIGGER guard_reward_x_promotion_post_verification_mutation_trigger;
ALTER TABLE public.reward_x_promotion_post_verifications
  ADD CONSTRAINT reward_x_promotion_post_created_retention_check
  CHECK (verify_after=x_post_created_at+make_interval(secs=>retention_seconds));
CREATE OR REPLACE FUNCTION public.record_reward_x_promotion_initial_post_verification_v1(p_invite_code text, p_x_post_id text, p_x_author_id text, p_x_post_created_at timestamp with time zone, p_matched_expanded_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_post_id text := btrim(coalesce(p_x_post_id,''));
  v_author_id text := btrim(coalesce(p_x_author_id,''));
  v_url text := btrim(coalesce(p_matched_expanded_url,''));
  v_now timestamptz := clock_timestamp();
  v_opportunity public.reward_x_promotion_opportunities%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_submission public.reward_x_promotion_post_submissions%rowtype;
  v_identity public.reward_x_promotion_x_identities%rowtype;
  v_existing public.reward_x_promotion_post_verifications%rowtype;
  v_created public.reward_x_promotion_post_verifications%rowtype;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;
  if v_post_id !~ '^[0-9]{1,32}$' then
    raise exception 'REWARD_X_PROMOTION_POST_ID_INVALID';
  end if;
  if v_author_id !~ '^[0-9]{1,32}$' then
    raise exception 'REWARD_X_PROMOTION_AUTHOR_ID_INVALID';
  end if;
  if p_x_post_created_at is null then
    raise exception 'REWARD_X_PROMOTION_POST_CREATED_AT_REQUIRED';
  end if;
  if char_length(v_url) not between 1 and 2048
     or v_url !~* '^https://veinvite\.vercel\.app/' then
    raise exception 'REWARD_X_PROMOTION_MATCHED_URL_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_x_promotion_' || v_code,0)
  );

  select * into v_opportunity
  from public.reward_x_promotion_opportunities x
  where x.invite_code=v_code;

  if not found then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_MISSING';
  end if;

  select * into v_existing
  from public.reward_x_promotion_post_verifications p
  where p.opportunity_id=v_opportunity.id;

  if found then
    if v_existing.x_post_id=v_post_id
       and v_existing.x_author_id=v_author_id then
      return jsonb_build_object(
        'recorded',true,
        'reason','ALREADY_RECORDED',
        'inviteCode',v_code,
        'verificationId',v_existing.id,
        'verifyAfter',v_existing.verify_after,
        'state',v_existing.verification_state
      );
    end if;
    raise exception 'REWARD_X_PROMOTION_POST_ALREADY_SUBMITTED';
  end if;

  select * into v_submission
  from public.reward_x_promotion_post_submissions s
  where s.opportunity_id=v_opportunity.id
    and s.x_post_id=v_post_id
    and s.submission_state='PENDING'
  for update;

  if not found then
    raise exception 'REWARD_X_PROMOTION_POST_SUBMISSION_MISSING';
  end if;

  if p_x_post_created_at<v_opportunity.opened_at
     or p_x_post_created_at>v_opportunity.post_deadline_at then
    raise exception 'REWARD_X_PROMOTION_POST_CREATED_OUTSIDE_WINDOW';
  end if;

  if position(v_opportunity.share_token::text in v_url)=0 then
    raise exception 'REWARD_X_PROMOTION_POST_SHARE_TOKEN_MISSING';
  end if;

  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.id=v_opportunity.obligation_id
  for update;

  if not found
     or v_obligation.financial_state<>'HELD'
     or v_obligation.recipient_wallet<>v_opportunity.recipient_wallet then
    raise exception 'REWARD_X_PROMOTION_POST_OBLIGATION_NOT_HELD';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_x_promotion_wallet_' || v_opportunity.network || '_' ||
      v_opportunity.recipient_wallet,
      0
    )
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_x_promotion_author_' || v_opportunity.network || '_' ||
      v_author_id,
      0
    )
  );

  select * into v_identity
  from public.reward_x_promotion_x_identities i
  where i.network=v_opportunity.network
    and i.recipient_wallet=v_opportunity.recipient_wallet;

  if found then
    if v_identity.x_author_id<>v_author_id then
      raise exception 'REWARD_X_PROMOTION_WALLET_AUTHOR_MISMATCH';
    end if;
  else
    select * into v_identity
    from public.reward_x_promotion_x_identities i
    where i.network=v_opportunity.network
      and i.x_author_id=v_author_id;

    if found and v_identity.recipient_wallet<>v_opportunity.recipient_wallet then
      raise exception 'REWARD_X_PROMOTION_AUTHOR_ALREADY_BOUND';
    end if;

    if not found then
      insert into public.reward_x_promotion_x_identities(
        network,
        recipient_wallet,
        x_author_id,
        policy_version,
        first_verified_at
      ) values (
        v_opportunity.network,
        v_opportunity.recipient_wallet,
        v_author_id,
        v_opportunity.policy_version,
        v_now
      )
      returning * into v_identity;
    end if;
  end if;

  insert into public.reward_x_promotion_post_verifications(
    submission_id,
    opportunity_id,
    obligation_id,
    split_id,
    invite_code,
    network,
    recipient_wallet,
    x_post_id,
    x_author_id,
    x_post_created_at,
    matched_expanded_url,
    initial_verified_at,
    retention_seconds,
    verify_after,
    verification_state
  ) values (
    v_submission.id,
    v_opportunity.id,
    v_opportunity.obligation_id,
    v_opportunity.split_id,
    v_code,
    v_opportunity.network,
    v_opportunity.recipient_wallet,
    v_post_id,
    v_author_id,
    p_x_post_created_at,
    v_url,
    v_now,
    86400,
    p_x_post_created_at+make_interval(secs=>86400),
    'INITIAL_VERIFIED'
  )
  returning * into v_created;

  update public.reward_x_promotion_post_submissions s
  set submission_state='VERIFIED',
      verified_at=v_now,
      invalidated_at=null,
      state_reason=null,
      updated_at=v_now
  where s.id=v_submission.id;

  return jsonb_build_object(
    'recorded',true,
    'reason','INITIAL_VERIFIED',
    'inviteCode',v_code,
    'submissionId',v_submission.id,
    'verificationId',v_created.id,
    'xPostId',v_created.x_post_id,
    'verifyAfter',v_created.verify_after,
    'state',v_created.verification_state
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_reward_x_promotion_post_verification_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_submission public.reward_x_promotion_post_submissions%rowtype;
  v_opportunity public.reward_x_promotion_opportunities%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_split public.reward_x_promotion_splits%rowtype;
  v_identity public.reward_x_promotion_x_identities%rowtype;
begin
  select * into v_submission
  from public.reward_x_promotion_post_submissions s
  where s.id=new.submission_id;

  if not found
     or v_submission.opportunity_id<>new.opportunity_id
     or v_submission.obligation_id<>new.obligation_id
     or v_submission.split_id<>new.split_id
     or v_submission.invite_code<>new.invite_code
     or v_submission.network<>new.network
     or v_submission.recipient_wallet<>new.recipient_wallet
     or v_submission.x_post_id<>new.x_post_id
     or v_submission.submission_state<>'PENDING' then
    raise exception 'REWARD_X_PROMOTION_POST_SUBMISSION_MISMATCH';
  end if;

  select * into v_opportunity
  from public.reward_x_promotion_opportunities x
  where x.id=new.opportunity_id;

  if not found
     or v_opportunity.obligation_id<>new.obligation_id
     or v_opportunity.split_id<>new.split_id
     or v_opportunity.invite_code<>new.invite_code
     or v_opportunity.network<>new.network
     or v_opportunity.recipient_wallet<>new.recipient_wallet
     or v_opportunity.policy_version<>'x-promotion-additive-v2'
     or v_opportunity.submission_grace_seconds<>900 then
    raise exception 'REWARD_X_PROMOTION_POST_OPPORTUNITY_MISMATCH';
  end if;

  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.id=new.obligation_id;

  if not found
     or v_obligation.split_id<>new.split_id
     or v_obligation.invite_code<>new.invite_code
     or v_obligation.network<>new.network
     or v_obligation.recipient_wallet<>new.recipient_wallet
     or v_obligation.financial_state<>'HELD'
     or v_obligation.held_at is null then
    raise exception 'REWARD_X_PROMOTION_POST_OBLIGATION_MISMATCH';
  end if;

  select * into v_split
  from public.reward_x_promotion_splits s
  where s.id=new.split_id;

  if not found
     or v_split.mode<>'LIVE'
     or v_split.invite_code<>new.invite_code
     or v_split.network<>new.network
     or v_split.recipient_wallet<>new.recipient_wallet
     or v_split.policy_version<>'x-promotion-additive-v2' then
    raise exception 'REWARD_X_PROMOTION_POST_SPLIT_MISMATCH';
  end if;

  select * into v_identity
  from public.reward_x_promotion_x_identities i
  where i.network=new.network
    and i.recipient_wallet=new.recipient_wallet;

  if not found
     or v_identity.x_author_id<>new.x_author_id
     or v_identity.policy_version<>'x-promotion-additive-v2' then
    raise exception 'REWARD_X_PROMOTION_POST_IDENTITY_MISMATCH';
  end if;

  if new.verification_state<>'INITIAL_VERIFIED'
     or new.final_verified_at is not null
     or new.invalidated_at is not null
     or new.state_reason is not null then
    raise exception 'REWARD_X_PROMOTION_POST_INITIAL_STATE_INVALID';
  end if;

  if new.x_post_created_at<v_opportunity.opened_at
     or new.x_post_created_at>v_opportunity.post_deadline_at
     or v_submission.submitted_at<v_opportunity.opened_at
     or v_submission.submitted_at>
        v_opportunity.post_deadline_at+
        make_interval(secs=>v_opportunity.submission_grace_seconds)
     or new.initial_verified_at<v_submission.submitted_at
     or new.initial_verified_at<new.x_post_created_at
     or new.retention_seconds<>86400
     or new.verify_after<>
        new.x_post_created_at+make_interval(secs=>new.retention_seconds) then
    raise exception 'REWARD_X_PROMOTION_POST_WINDOW_MISMATCH';
  end if;

  if position(v_opportunity.share_token::text in new.matched_expanded_url)=0 then
    raise exception 'REWARD_X_PROMOTION_POST_SHARE_TOKEN_MISSING';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.read_reward_x_promotion_post_verification_audit(p_network text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_total integer := 0;
  v_binding integer := 0;
  v_submission_binding integer := 0;
  v_identity integer := 0;
  v_window integer := 0;
  v_token integer := 0;
  v_final_too_early integer := 0;
  v_verified_without_verification integer := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where x.id is null
         or o.id is null
         or s.id is null
         or p.obligation_id<>x.obligation_id
         or p.split_id<>x.split_id
         or p.invite_code<>x.invite_code
         or p.network<>x.network
         or p.recipient_wallet<>x.recipient_wallet
         or o.id<>p.obligation_id
         or o.split_id<>p.split_id
         or s.id<>p.split_id
         or s.mode<>'LIVE'
    )::integer,
    count(*) filter (
      where u.id is null
         or u.opportunity_id<>p.opportunity_id
         or u.obligation_id<>p.obligation_id
         or u.split_id<>p.split_id
         or u.invite_code<>p.invite_code
         or u.network<>p.network
         or u.recipient_wallet<>p.recipient_wallet
         or u.x_post_id<>p.x_post_id
         or u.submission_state<>'VERIFIED'
    )::integer,
    count(*) filter (
      where i.id is null
         or i.recipient_wallet<>p.recipient_wallet
         or i.x_author_id<>p.x_author_id
    )::integer,
    count(*) filter (
      where p.x_post_created_at<x.opened_at
         or p.x_post_created_at>x.post_deadline_at
         or u.submitted_at<x.opened_at
         or u.submitted_at>
            x.post_deadline_at+make_interval(secs=>x.submission_grace_seconds)
         or p.initial_verified_at<u.submitted_at
         or p.initial_verified_at<p.x_post_created_at
         or p.retention_seconds<>86400
         or p.verify_after<>
            p.x_post_created_at+make_interval(secs=>p.retention_seconds)
    )::integer,
    count(*) filter (
      where position(x.share_token::text in p.matched_expanded_url)=0
    )::integer,
    count(*) filter (
      where p.verification_state='FINAL_VERIFIED'
        and (
          p.final_verified_at is null
          or p.final_verified_at<p.verify_after
        )
    )::integer
  into
    v_total,
    v_binding,
    v_submission_binding,
    v_identity,
    v_window,
    v_token,
    v_final_too_early
  from public.reward_x_promotion_post_verifications p
  left join public.reward_x_promotion_post_submissions u
    on u.id=p.submission_id
  left join public.reward_x_promotion_opportunities x
    on x.id=p.opportunity_id
  left join public.reward_x_promotion_obligations o
    on o.id=p.obligation_id
  left join public.reward_x_promotion_splits s
    on s.id=p.split_id
  left join public.reward_x_promotion_x_identities i
    on i.network=p.network
   and i.recipient_wallet=p.recipient_wallet
  where p.network=v_network;

  select count(*)::integer
  into v_verified_without_verification
  from public.reward_x_promotion_post_submissions u
  where u.network=v_network
    and u.submission_state='VERIFIED'
    and not exists (
      select 1
      from public.reward_x_promotion_post_verifications p
      where p.submission_id=u.id
    );

  return jsonb_build_object(
    'ok',
      v_binding=0
      and v_submission_binding=0
      and v_identity=0
      and v_window=0
      and v_token=0
      and v_final_too_early=0
      and v_verified_without_verification=0,
    'network',v_network,
    'totalCount',v_total,
    'violations',jsonb_build_object(
      'binding',v_binding,
      'submissionBinding',v_submission_binding,
      'identity',v_identity,
      'window',v_window,
      'shareToken',v_token,
      'finalTooEarly',v_final_too_early,
      'verifiedSubmissionWithoutVerification',v_verified_without_verification
    )
  );
end;
$function$
;
COMMIT;
