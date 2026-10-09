create or replace function public.invalidate_reward_x_promotion_post_submission_v1(
  p_invite_code text,
  p_x_post_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_post_id text := btrim(coalesce(p_x_post_id,''));
  v_reason text := upper(btrim(coalesce(p_reason,'')));
  v_submission public.reward_x_promotion_post_submissions%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  if v_post_id !~ '^[0-9]{1,32}$' then
    raise exception 'REWARD_X_PROMOTION_POST_ID_INVALID';
  end if;

  if v_reason not in (
    'POST_NOT_FOUND',
    'SHARE_TOKEN_MISSING',
    'POST_NOT_ORIGINAL',
    'POST_CREATED_OUTSIDE_WINDOW',
    'WALLET_AUTHOR_MISMATCH',
    'AUTHOR_ALREADY_BOUND',
    'POST_IDENTITY_MISMATCH'
  ) then
    raise exception 'REWARD_X_PROMOTION_SUBMISSION_INVALID_REASON';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_x_promotion_' || v_code,0)
  );

  select * into v_submission
  from public.reward_x_promotion_post_submissions s
  where s.invite_code=v_code
    and s.x_post_id=v_post_id
  for update;

  if not found then
    raise exception 'REWARD_X_PROMOTION_POST_SUBMISSION_MISSING';
  end if;

  if v_submission.submission_state='INVALID' then
    return jsonb_build_object(
      'invalidated',true,
      'reason','ALREADY_INVALID',
      'inviteCode',v_code,
      'submissionId',v_submission.id,
      'xPostId',v_submission.x_post_id,
      'state',v_submission.submission_state,
      'stateReason',v_submission.state_reason
    );
  end if;

  if v_submission.submission_state<>'PENDING' then
    raise exception 'REWARD_X_PROMOTION_SUBMISSION_NOT_INVALIDATABLE';
  end if;

  update public.reward_x_promotion_post_submissions s
  set submission_state='INVALID',
      verified_at=null,
      invalidated_at=v_now,
      state_reason=v_reason,
      updated_at=v_now
  where s.id=v_submission.id
  returning * into v_submission;

  return jsonb_build_object(
    'invalidated',true,
    'reason',v_reason,
    'inviteCode',v_code,
    'submissionId',v_submission.id,
    'xPostId',v_submission.x_post_id,
    'invalidatedAt',v_submission.invalidated_at,
    'state',v_submission.submission_state
  );
end;
$function$;

revoke all on function public.invalidate_reward_x_promotion_post_submission_v1(text,text,text)
  from PUBLIC,anon,authenticated;
grant execute on function public.invalidate_reward_x_promotion_post_submission_v1(text,text,text)
  to service_role;
