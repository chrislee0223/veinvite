create or replace function public.expire_reward_x_promotion_opportunities_v1(
  p_network text,
  p_limit integer default 25
)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
declare
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_limit integer := greatest(1,least(coalesce(p_limit,25),100));
  v_candidate record;
  v_opportunity public.reward_x_promotion_opportunities%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_now timestamptz;
  v_considered integer := 0;
  v_released integer := 0;
  v_skipped integer := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;

  for v_candidate in
    select x.invite_code
    from public.reward_x_promotion_opportunities x
    join public.reward_x_promotion_obligations o
      on o.id=x.obligation_id
    where x.network=v_network
      and o.financial_state='HELD'
      and now() >
        x.post_deadline_at +
        make_interval(secs=>x.submission_grace_seconds)
      and not exists (
        select 1
        from public.reward_x_promotion_post_submissions s
        where s.opportunity_id=x.id
          and s.submission_state in ('PENDING','VERIFIED')
      )
      and not exists (
        select 1
        from public.reward_x_promotion_post_verifications p
        where p.opportunity_id=x.id
          and p.verification_state in (
            'INITIAL_VERIFIED','REVIEW_REQUIRED','FINAL_VERIFIED'
          )
      )
    order by x.post_deadline_at,x.id
    limit v_limit
  loop
    v_considered:=v_considered+1;

    perform pg_advisory_xact_lock(
      hashtextextended('veinvite_x_promotion_' || v_candidate.invite_code,0)
    );

    v_now:=clock_timestamp();

    select * into v_opportunity
    from public.reward_x_promotion_opportunities x
    where x.invite_code=v_candidate.invite_code;

    select * into v_obligation
    from public.reward_x_promotion_obligations o
    where o.invite_code=v_candidate.invite_code
    for update;

    if not found
       or v_obligation.financial_state<>'HELD'
       or v_now <=
          v_opportunity.post_deadline_at +
          make_interval(secs=>v_opportunity.submission_grace_seconds)
       or exists (
         select 1
         from public.reward_x_promotion_post_submissions s
         where s.opportunity_id=v_opportunity.id
           and s.submission_state in ('PENDING','VERIFIED')
       )
       or exists (
         select 1
         from public.reward_x_promotion_post_verifications p
         where p.opportunity_id=v_opportunity.id
           and p.verification_state in (
             'INITIAL_VERIFIED','REVIEW_REQUIRED','FINAL_VERIFIED'
           )
       ) then
      v_skipped:=v_skipped+1;
      continue;
    end if;

    update public.reward_x_promotion_obligations o
    set financial_state='RELEASED',
        released_at=v_now,
        release_reason='NO_VALID_POST_BEFORE_DEADLINE',
        updated_at=v_now
    where o.id=v_obligation.id;

    v_released:=v_released+1;
  end loop;

  return jsonb_build_object(
    'network',v_network,
    'consideredCount',v_considered,
    'releasedCount',v_released,
    'skippedCount',v_skipped
  );
end;
$function$;

revoke all on function public.expire_reward_x_promotion_opportunities_v1(text,integer)
  from public,anon,authenticated;
grant execute on function public.expire_reward_x_promotion_opportunities_v1(text,integer)
  to service_role;
