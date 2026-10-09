-- Tighten X submission URL ↔ Post ID identity matching.
-- LIVE remains disabled; this only hardens the dormant submission foundation.

do $$
declare
  v_enabled boolean;
begin
  select reward_x_promotion_enabled
  into v_enabled
  from public.reward_runtime_config
  where id=1;

  if coalesce(v_enabled,false) then
    raise exception 'REWARD_X_PROMOTION_SUBMISSION_URL_HARDENING_REQUIRES_LIVE_DISABLED';
  end if;
end $$;

alter table public.reward_x_promotion_post_submissions
  drop constraint if exists reward_x_promotion_post_submission_url_id_check,
  add constraint reward_x_promotion_post_submission_url_id_check
    check (
      submitted_post_url ~
        ('/status/' || x_post_id || '([/?#]|$)')
    );

create or replace function public.validate_reward_x_promotion_post_submission_insert()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
declare
  v_opportunity public.reward_x_promotion_opportunities%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_split public.reward_x_promotion_splits%rowtype;
begin
  select * into v_opportunity
  from public.reward_x_promotion_opportunities x
  where x.id=new.opportunity_id;

  if not found
     or v_opportunity.obligation_id<>new.obligation_id
     or v_opportunity.split_id<>new.split_id
     or v_opportunity.invite_code<>new.invite_code
     or v_opportunity.network<>new.network
     or v_opportunity.recipient_wallet<>new.recipient_wallet
     or v_opportunity.policy_version<>'x-promotion-split-v1'
     or v_opportunity.submission_grace_seconds<>900 then
    raise exception 'REWARD_X_PROMOTION_SUBMISSION_OPPORTUNITY_MISMATCH';
  end if;

  if new.submission_state<>'PENDING'
     or new.verified_at is not null
     or new.invalidated_at is not null
     or new.state_reason is not null then
    raise exception 'REWARD_X_PROMOTION_SUBMISSION_INITIAL_STATE_INVALID';
  end if;

  if new.submitted_at<v_opportunity.opened_at
     or new.submitted_at>
        v_opportunity.post_deadline_at+
        make_interval(secs=>v_opportunity.submission_grace_seconds) then
    raise exception 'REWARD_X_PROMOTION_SUBMISSION_WINDOW_MISMATCH';
  end if;

  if new.submitted_post_url !~
       ('/status/' || new.x_post_id || '([/?#]|$)') then
    raise exception 'REWARD_X_PROMOTION_SUBMISSION_POST_ID_MISMATCH';
  end if;

  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.id=new.obligation_id;

  if not found
     or v_obligation.split_id<>new.split_id
     or v_obligation.invite_code<>new.invite_code
     or v_obligation.network<>new.network
     or v_obligation.recipient_wallet<>new.recipient_wallet
     or v_obligation.financial_state<>'HELD' then
    raise exception 'REWARD_X_PROMOTION_SUBMISSION_OBLIGATION_MISMATCH';
  end if;

  select * into v_split
  from public.reward_x_promotion_splits s
  where s.id=new.split_id;

  if not found
     or v_split.mode<>'LIVE'
     or v_split.invite_code<>new.invite_code
     or v_split.network<>new.network
     or v_split.recipient_wallet<>new.recipient_wallet
     or v_split.policy_version<>'x-promotion-split-v1' then
    raise exception 'REWARD_X_PROMOTION_SUBMISSION_SPLIT_MISMATCH';
  end if;

  return new;
end;
$function$;

create or replace function public.record_reward_x_promotion_post_submission_v1(
  p_invite_code text,
  p_x_post_id text,
  p_submitted_post_url text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_post_id text := btrim(coalesce(p_x_post_id,''));
  v_url text := btrim(coalesce(p_submitted_post_url,''));
  v_now timestamptz := clock_timestamp();
  v_opportunity public.reward_x_promotion_opportunities%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_existing public.reward_x_promotion_post_submissions%rowtype;
  v_created public.reward_x_promotion_post_submissions%rowtype;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;
  if v_post_id !~ '^[0-9]{1,32}$' then
    raise exception 'REWARD_X_PROMOTION_POST_ID_INVALID';
  end if;
  if char_length(v_url) not between 1 and 2048
     or v_url !~* '^https://(www\.)?x\.com/[^/?#]+/status/[0-9]+' then
    raise exception 'REWARD_X_PROMOTION_SUBMITTED_URL_INVALID';
  end if;
  if v_url !~ ('/status/' || v_post_id || '([/?#]|$)') then
    raise exception 'REWARD_X_PROMOTION_SUBMISSION_POST_ID_MISMATCH';
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

  if v_now>
     v_opportunity.post_deadline_at+
     make_interval(secs=>v_opportunity.submission_grace_seconds) then
    raise exception 'REWARD_X_PROMOTION_POST_SUBMISSION_EXPIRED';
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

  select * into v_existing
  from public.reward_x_promotion_post_submissions s
  where s.opportunity_id=v_opportunity.id
    and s.submission_state in ('PENDING','VERIFIED');

  if found then
    if v_existing.x_post_id=v_post_id then
      return jsonb_build_object(
        'recorded',true,
        'reason','ALREADY_SUBMITTED',
        'inviteCode',v_code,
        'submissionId',v_existing.id,
        'xPostId',v_existing.x_post_id,
        'submittedAt',v_existing.submitted_at,
        'state',v_existing.submission_state
      );
    end if;
    raise exception 'REWARD_X_PROMOTION_POST_SUBMISSION_ALREADY_ACTIVE';
  end if;

  if exists (
    select 1
    from public.reward_x_promotion_post_submissions s
    where s.x_post_id=v_post_id
  ) then
    raise exception 'REWARD_X_PROMOTION_POST_ALREADY_USED';
  end if;

  insert into public.reward_x_promotion_post_submissions(
    opportunity_id,
    obligation_id,
    split_id,
    invite_code,
    network,
    recipient_wallet,
    x_post_id,
    submitted_post_url,
    submitted_at,
    submission_state
  ) values (
    v_opportunity.id,
    v_opportunity.obligation_id,
    v_opportunity.split_id,
    v_code,
    v_opportunity.network,
    v_opportunity.recipient_wallet,
    v_post_id,
    v_url,
    v_now,
    'PENDING'
  )
  returning * into v_created;

  return jsonb_build_object(
    'recorded',true,
    'reason','SUBMITTED',
    'inviteCode',v_code,
    'submissionId',v_created.id,
    'xPostId',v_created.x_post_id,
    'submittedAt',v_created.submitted_at,
    'state',v_created.submission_state
  );
end;
$function$;

revoke all on function public.validate_reward_x_promotion_post_submission_insert()
  from public,anon,authenticated;
revoke all on function public.record_reward_x_promotion_post_submission_v1(text,text,text)
  from public,anon,authenticated;
grant execute on function public.record_reward_x_promotion_post_submission_v1(text,text,text)
  to service_role;
