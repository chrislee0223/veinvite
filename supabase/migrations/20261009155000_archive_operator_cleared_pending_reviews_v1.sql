-- Archive only superseded operator-cleared preclaim reviews.
-- No payouts, Sybil decisions, invitation statuses, or genuine read receipts are modified.
-- If a subsequent review starts or a restriction activates, the projection no longer treats it as cleared.
begin;

CREATE OR REPLACE FUNCTION public.acknowledge_invite_notification_history(p_inviter_wallet text, p_ids bigint[] DEFAULT NULL::bigint[], p_through_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_wallet text := lower(btrim(p_inviter_wallet));
  v_row public.invite_notification_history%rowtype;
  v_count integer := 0;
  v_stage integer;
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid notification wallet';
  end if;

  if (p_ids is null and p_through_id is null)
     or (p_ids is not null and p_through_id is not null) then
    raise exception 'choose ids or through id';
  end if;

  if p_ids is not null then
    if cardinality(p_ids) < 1 or cardinality(p_ids) > 100 then
      raise exception 'invalid notification id count';
    end if;
  elsif p_through_id is null or p_through_id < 1 then
    raise exception 'invalid through id';
  end if;

  for v_row in
    select h.*
    from public.invite_notification_history h
    where coalesce(h.recipient_wallet, h.inviter_wallet) = v_wallet
    -- Operator-cleared, older preclaim review is closed; no user-read mutation.
    and not (
      h.kind = 'SECURITY_REVIEW_STARTED'
      and h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:preclaim-r%'
      and coalesce(h.recipient_wallet, h.inviter_wallet) = h.inviter_wallet
      and exists (
        select 1
        from public.sybil_v2_referral_assessments resolved_review
        join public.invitations inv on inv.invite_code = resolved_review.invite_code
        where resolved_review.invite_code = h.invite_code
          and resolved_review.state = 'CLEAR'
          and resolved_review.updated_at >= h.event_at
          and resolved_review.reason_codes @> '["OPERATOR_CLEARED"]'::jsonb
          and inv.inviter_wallet = h.inviter_wallet
          and inv.sybil_status <> 'BLOCKED'
          and inv.reward_status <> 'FORFEITED'
          and not exists (
            select 1 from public.sybil_v2_wallet_restrictions block
            where block.related_invite_code = h.invite_code
              and block.status = 'ACTIVE'
          )
          and not exists (
            select 1 from public.invite_notification_history later
            where later.invite_code = h.invite_code
              and later.id > h.id
              and later.kind = 'SECURITY_REVIEW_STARTED'
          )
      )
    )
    -- Ignore only past security-review / inviter-hold notices for a finalized
    -- blocked-and-forfeited invitation with a released slot.
    and not (
      h.kind in ('SECURITY_REVIEW_STARTED', 'SECURITY_INVITER_HOLD')
      and (
        (h.kind = 'SECURITY_INVITER_HOLD')
        or (
          h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:preclaim-%'
          and coalesce(h.recipient_wallet, h.inviter_wallet) = h.inviter_wallet
        )
      )
      and exists (
        select 1
        from public.invitations terminal_invite
        where terminal_invite.invite_code = h.invite_code
          and terminal_invite.inviter_wallet = h.inviter_wallet
          and terminal_invite.status = 'CANCELLED'
          and terminal_invite.sybil_status = 'BLOCKED'
          and terminal_invite.reward_status = 'FORFEITED'
          and terminal_invite.slot_released_at is not null
      )
    )
    -- Terminal security outcomes supersede earlier progress / review notices.
    -- Leave audit/history rows and real read receipts untouched.
    and not (exists (
      select 1
      from public.invite_notification_history final_outcome
      where final_outcome.invite_code = h.invite_code
        and coalesce(final_outcome.recipient_wallet, final_outcome.inviter_wallet)
            = coalesce(h.recipient_wallet, h.inviter_wallet)
        and final_outcome.id > h.id
        and final_outcome.event_at >= h.event_at
        and (
          (h.kind = 'SECURITY_REVIEW_STARTED'
            and final_outcome.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REVIEW_CLEARED', 'SECURITY_REFERRAL_INVALIDATED'))
          or (h.kind = 'SECURITY_POST_PAYOUT_REVIEW_STARTED'
            and final_outcome.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_POST_PAYOUT_REVIEW_CLEARED'))
          or (h.kind = 'SECURITY_REVIEW_STARTED'
AND h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:postpayout-r%'
AND final_outcome.kind = 'SECURITY_INVITER_ACCESS_RESTORED'
AND final_outcome.dedupe_key like 'security-v2:%:SECURITY_INVITER_ACCESS_RESTORED:postpayout-clear-r%')
          or (h.kind = 'SECURITY_INVITER_HOLD'
            and final_outcome.kind in ('SECURITY_INVITER_RESTRICTED', 'SECURITY_INVITER_ACCESS_RESTORED', 'SECURITY_REFERRAL_INVALIDATED'))
          or (h.kind in ('INVITE_ACCEPTED', 'DAPP_PROGRESS', 'VOT3_CONVERTED', 'REWARD_READY')
            and final_outcome.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REFERRAL_INVALIDATED', 'REWARD_PAID'))
        )
    ))
    -- One blacklist outcome per recipient: retain append-only history while
    -- masking a generic ineligible event generated for the same decision.
    and not (
      h.kind = 'INVITE_INELIGIBLE'
      and exists (
        select 1
        from public.invite_notification_history security_outcome
        where security_outcome.invite_code = h.invite_code
          and security_outcome.kind = 'SECURITY_RESTRICTION_CONFIRMED'
          and coalesce(security_outcome.recipient_wallet, security_outcome.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and h.event_at between security_outcome.event_at - interval '10 minutes'
                             and security_outcome.event_at + interval '10 minutes'
      )
    )
    and (
      h.kind not in ('SECURITY_REVIEW_STARTED', 'SECURITY_POST_PAYOUT_REVIEW_STARTED', 'SECURITY_INVITER_HOLD')
      or h.event_at <= clock_timestamp() - interval '10 seconds'
    )
      and (
        (p_ids is not null and h.id = any(p_ids))
        or (
          p_through_id is not null
          and h.id <= p_through_id
          and h.kind <> 'REWARD_PAID'
        )
      )
      and not exists (
        select 1
        from public.invite_notification_history_reads r
        where r.notification_id = h.id
      )
      and not (
        h.kind = 'SECURITY_REVIEW_STARTED'
        and exists (
          select 1
          from public.invite_notification_history later
          where coalesce(later.recipient_wallet, later.inviter_wallet)
                = coalesce(h.recipient_wallet, h.inviter_wallet)
            and later.invite_code = h.invite_code
            and later.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REVIEW_CLEARED')
            and later.event_at >= h.event_at
            and later.event_at <= h.event_at + interval '10 seconds'
        )
      )
      and not (
        h.kind = 'SECURITY_POST_PAYOUT_REVIEW_STARTED'
        and exists (
          select 1
          from public.invite_notification_history later
          where coalesce(later.recipient_wallet, later.inviter_wallet)
                = coalesce(h.recipient_wallet, h.inviter_wallet)
            and later.invite_code = h.invite_code
            and later.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_POST_PAYOUT_REVIEW_CLEARED')
            and later.event_at >= h.event_at
            and later.event_at <= h.event_at + interval '10 seconds'
        )
      )
      and not (
        h.kind = 'SECURITY_INVITER_HOLD'
        and exists (
          select 1
          from public.invite_notification_history later
          where coalesce(later.recipient_wallet, later.inviter_wallet)
                = coalesce(h.recipient_wallet, h.inviter_wallet)
            and later.invite_code = h.invite_code
            and later.kind in ('SECURITY_INVITER_RESTRICTED', 'SECURITY_INVITER_ACCESS_RESTORED')
            and later.event_at >= h.event_at
            and later.event_at <= h.event_at + interval '10 seconds'
        )
      )
    order by h.id
  loop
    insert into public.invite_notification_history_reads(
      notification_id,
      inviter_wallet,
      read_at
    ) values (
      v_row.id,
      v_wallet,
      now()
    )
    on conflict (notification_id) do nothing;

    if found then
      if v_row.kind not like 'SECURITY_%' then
        v_stage := case
          when v_row.kind = 'DAPP_PROGRESS'
            and coalesce(v_row.dapp_progress, 0) < 3
          then null
          else v_row.stage
        end;

        perform public.acknowledge_invite_notification_v2(
          v_row.invite_code,
          v_wallet,
          v_stage,
          v_row.dapp_progress,
          v_row.kind = 'REWARD_READY'
        );
      end if;

      v_count := v_count + 1;
    end if;
  end loop;

  return jsonb_build_object('acknowledged', v_count);
end;
$function$;

CREATE OR REPLACE FUNCTION public.count_invite_notification_history_unread(p_inviter_wallet text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_wallet text := lower(btrim(p_inviter_wallet));
  v_count bigint;
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid notification wallet';
  end if;

  select count(*)
  into v_count
  from public.invite_notification_history h
  where coalesce(h.recipient_wallet, h.inviter_wallet) = v_wallet
    -- Operator-cleared, older preclaim review is closed; no user-read mutation.
    and not (
      h.kind = 'SECURITY_REVIEW_STARTED'
      and h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:preclaim-r%'
      and coalesce(h.recipient_wallet, h.inviter_wallet) = h.inviter_wallet
      and exists (
        select 1
        from public.sybil_v2_referral_assessments resolved_review
        join public.invitations inv on inv.invite_code = resolved_review.invite_code
        where resolved_review.invite_code = h.invite_code
          and resolved_review.state = 'CLEAR'
          and resolved_review.updated_at >= h.event_at
          and resolved_review.reason_codes @> '["OPERATOR_CLEARED"]'::jsonb
          and inv.inviter_wallet = h.inviter_wallet
          and inv.sybil_status <> 'BLOCKED'
          and inv.reward_status <> 'FORFEITED'
          and not exists (
            select 1 from public.sybil_v2_wallet_restrictions block
            where block.related_invite_code = h.invite_code
              and block.status = 'ACTIVE'
          )
          and not exists (
            select 1 from public.invite_notification_history later
            where later.invite_code = h.invite_code
              and later.id > h.id
              and later.kind = 'SECURITY_REVIEW_STARTED'
          )
      )
    )
    -- Ignore only past security-review / inviter-hold notices for a finalized
    -- blocked-and-forfeited invitation with a released slot.
    and not (
      h.kind in ('SECURITY_REVIEW_STARTED', 'SECURITY_INVITER_HOLD')
      and (
        (h.kind = 'SECURITY_INVITER_HOLD')
        or (
          h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:preclaim-%'
          and coalesce(h.recipient_wallet, h.inviter_wallet) = h.inviter_wallet
        )
      )
      and exists (
        select 1
        from public.invitations terminal_invite
        where terminal_invite.invite_code = h.invite_code
          and terminal_invite.inviter_wallet = h.inviter_wallet
          and terminal_invite.status = 'CANCELLED'
          and terminal_invite.sybil_status = 'BLOCKED'
          and terminal_invite.reward_status = 'FORFEITED'
          and terminal_invite.slot_released_at is not null
      )
    )
    -- Terminal security outcomes supersede earlier progress / review notices.
    -- Leave audit/history rows and real read receipts untouched.
    and not (exists (
      select 1
      from public.invite_notification_history final_outcome
      where final_outcome.invite_code = h.invite_code
        and coalesce(final_outcome.recipient_wallet, final_outcome.inviter_wallet)
            = coalesce(h.recipient_wallet, h.inviter_wallet)
        and final_outcome.id > h.id
        and final_outcome.event_at >= h.event_at
        and (
          (h.kind = 'SECURITY_REVIEW_STARTED'
            and final_outcome.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REVIEW_CLEARED', 'SECURITY_REFERRAL_INVALIDATED'))
          or (h.kind = 'SECURITY_POST_PAYOUT_REVIEW_STARTED'
            and final_outcome.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_POST_PAYOUT_REVIEW_CLEARED'))
          or (h.kind = 'SECURITY_REVIEW_STARTED'
AND h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:postpayout-r%'
AND final_outcome.kind = 'SECURITY_INVITER_ACCESS_RESTORED'
AND final_outcome.dedupe_key like 'security-v2:%:SECURITY_INVITER_ACCESS_RESTORED:postpayout-clear-r%')
          or (h.kind = 'SECURITY_INVITER_HOLD'
            and final_outcome.kind in ('SECURITY_INVITER_RESTRICTED', 'SECURITY_INVITER_ACCESS_RESTORED', 'SECURITY_REFERRAL_INVALIDATED'))
          or (h.kind in ('INVITE_ACCEPTED', 'DAPP_PROGRESS', 'VOT3_CONVERTED', 'REWARD_READY')
            and final_outcome.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REFERRAL_INVALIDATED', 'REWARD_PAID'))
        )
    ))
    -- One blacklist outcome per recipient: retain append-only history while
    -- masking a generic ineligible event generated for the same decision.
    and not (
      h.kind = 'INVITE_INELIGIBLE'
      and exists (
        select 1
        from public.invite_notification_history security_outcome
        where security_outcome.invite_code = h.invite_code
          and security_outcome.kind = 'SECURITY_RESTRICTION_CONFIRMED'
          and coalesce(security_outcome.recipient_wallet, security_outcome.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and h.event_at between security_outcome.event_at - interval '10 minutes'
                             and security_outcome.event_at + interval '10 minutes'
      )
    )
    and (
      h.kind not in ('SECURITY_REVIEW_STARTED', 'SECURITY_POST_PAYOUT_REVIEW_STARTED', 'SECURITY_INVITER_HOLD')
      or h.event_at <= clock_timestamp() - interval '10 seconds'
    )
    and not exists (
      select 1
      from public.invite_notification_history_reads r
      where r.notification_id = h.id
        and r.inviter_wallet = v_wallet
    )
    and not (
      h.kind = 'SECURITY_REVIEW_STARTED'
      and exists (
        select 1
        from public.invite_notification_history later
        where coalesce(later.recipient_wallet, later.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and later.invite_code = h.invite_code
          and later.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REVIEW_CLEARED')
          and later.event_at >= h.event_at
          and later.event_at <= h.event_at + interval '10 seconds'
      )
    )
    and not (
      h.kind = 'SECURITY_POST_PAYOUT_REVIEW_STARTED'
      and exists (
        select 1
        from public.invite_notification_history later
        where coalesce(later.recipient_wallet, later.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and later.invite_code = h.invite_code
          and later.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_POST_PAYOUT_REVIEW_CLEARED')
          and later.event_at >= h.event_at
          and later.event_at <= h.event_at + interval '10 seconds'
      )
    )
    and not (
      h.kind = 'SECURITY_INVITER_HOLD'
      and exists (
        select 1
        from public.invite_notification_history later
        where coalesce(later.recipient_wallet, later.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and later.invite_code = h.invite_code
          and later.kind in ('SECURITY_INVITER_RESTRICTED', 'SECURITY_INVITER_ACCESS_RESTORED')
          and later.event_at >= h.event_at
          and later.event_at <= h.event_at + interval '10 seconds'
      )
    );

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_invite_notification_history(p_inviter_wallet text, p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 30)
 RETURNS TABLE(id bigint, invite_code text, kind text, stage smallint, event_at timestamp with time zone, reward_amount_wei text, dapp_progress smallint, collapsed_progress boolean, friend_wallet text, read_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_wallet text := lower(btrim(p_inviter_wallet));
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 50));
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid notification wallet';
  end if;

  return query
  select
    h.id,
    h.invite_code,
    case when (
      h.kind = 'SECURITY_REVIEW_STARTED'
      and h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:preclaim-r%'
      and coalesce(h.recipient_wallet, h.inviter_wallet) = h.inviter_wallet
      and exists (
        select 1
        from public.sybil_v2_referral_assessments resolved_review
        join public.invitations inv on inv.invite_code = resolved_review.invite_code
        where resolved_review.invite_code = h.invite_code
          and resolved_review.state = 'CLEAR'
          and resolved_review.updated_at >= h.event_at
          and resolved_review.reason_codes @> '["OPERATOR_CLEARED"]'::jsonb
          and inv.inviter_wallet = h.inviter_wallet
          and inv.sybil_status <> 'BLOCKED'
          and inv.reward_status <> 'FORFEITED'
          and not exists (
            select 1 from public.sybil_v2_wallet_restrictions block
            where block.related_invite_code = h.invite_code
              and block.status = 'ACTIVE'
          )
          and not exists (
            select 1 from public.invite_notification_history later
            where later.invite_code = h.invite_code
              and later.id > h.id
              and later.kind = 'SECURITY_REVIEW_STARTED'
          )
      )
    ) then 'SECURITY_REVIEW_CLEARED' else
    case when (
      h.kind = 'SECURITY_REVIEW_STARTED'
      and h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:preclaim-%'
      and coalesce(h.recipient_wallet, h.inviter_wallet) = h.inviter_wallet
      and exists (
        select 1
        from public.invitations terminal_invite
        where terminal_invite.invite_code = h.invite_code
          and terminal_invite.inviter_wallet = h.inviter_wallet
          and terminal_invite.status = 'CANCELLED'
          and terminal_invite.sybil_status = 'BLOCKED'
          and terminal_invite.reward_status = 'FORFEITED'
          and terminal_invite.slot_released_at is not null
      )
      and not exists (
        select 1
        from public.invite_notification_history explicit_outcome
        where explicit_outcome.invite_code = h.invite_code
          and explicit_outcome.id > h.id
          and coalesce(explicit_outcome.recipient_wallet, explicit_outcome.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and explicit_outcome.kind in (
            'SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REFERRAL_INVALIDATED',
            'SECURITY_REVIEW_CLEARED', 'INVITE_INELIGIBLE'
          )
      )
    ) then 'INVITE_INELIGIBLE' else h.kind end end as kind,
    h.stage,
    h.event_at,
    h.reward_amount_wei,
    h.dapp_progress,
    h.collapsed_progress,
    h.friend_wallet,
    coalesce(
      r.read_at,
      (
        select min(final_outcome.event_at)
        from public.invite_notification_history final_outcome
        where final_outcome.invite_code = h.invite_code
          and coalesce(final_outcome.recipient_wallet, final_outcome.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and final_outcome.id > h.id
          and final_outcome.event_at >= h.event_at
          and (
            (h.kind = 'SECURITY_REVIEW_STARTED'
              and final_outcome.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REVIEW_CLEARED', 'SECURITY_REFERRAL_INVALIDATED'))
            or (h.kind = 'SECURITY_POST_PAYOUT_REVIEW_STARTED'
              and final_outcome.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_POST_PAYOUT_REVIEW_CLEARED'))
            or (h.kind = 'SECURITY_REVIEW_STARTED'
AND h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:postpayout-r%'
AND final_outcome.kind = 'SECURITY_INVITER_ACCESS_RESTORED'
AND final_outcome.dedupe_key like 'security-v2:%:SECURITY_INVITER_ACCESS_RESTORED:postpayout-clear-r%')
          or (h.kind = 'SECURITY_INVITER_HOLD'
              and final_outcome.kind in ('SECURITY_INVITER_RESTRICTED', 'SECURITY_INVITER_ACCESS_RESTORED', 'SECURITY_REFERRAL_INVALIDATED'))
            or (h.kind in ('INVITE_ACCEPTED', 'DAPP_PROGRESS', 'VOT3_CONVERTED', 'REWARD_READY')
              and final_outcome.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REFERRAL_INVALIDATED', 'REWARD_PAID'))
          )
      )
      ,(
        select greatest(resolved_review.updated_at, h.event_at)
        from public.sybil_v2_referral_assessments resolved_review
        where resolved_review.invite_code = h.invite_code
          and (h.kind = 'SECURITY_REVIEW_STARTED'
      and h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:preclaim-r%'
      and coalesce(h.recipient_wallet, h.inviter_wallet) = h.inviter_wallet
      and exists (
        select 1
        from public.sybil_v2_referral_assessments resolved_review
        join public.invitations inv on inv.invite_code = resolved_review.invite_code
        where resolved_review.invite_code = h.invite_code
          and resolved_review.state = 'CLEAR'
          and resolved_review.updated_at >= h.event_at
          and resolved_review.reason_codes @> '["OPERATOR_CLEARED"]'::jsonb
          and inv.inviter_wallet = h.inviter_wallet
          and inv.sybil_status <> 'BLOCKED'
          and inv.reward_status <> 'FORFEITED'
          and not exists (
            select 1 from public.sybil_v2_wallet_restrictions block
            where block.related_invite_code = h.invite_code
              and block.status = 'ACTIVE'
          )
          and not exists (
            select 1 from public.invite_notification_history later
            where later.invite_code = h.invite_code
              and later.id > h.id
              and later.kind = 'SECURITY_REVIEW_STARTED'
          )
      ))
        limit 1
      )
      ,(
        select greatest(terminal_invite.slot_released_at, h.event_at)
        from public.invitations terminal_invite
        where terminal_invite.invite_code = h.invite_code
          and terminal_invite.inviter_wallet = h.inviter_wallet
          and terminal_invite.status = 'CANCELLED'
          and terminal_invite.sybil_status = 'BLOCKED'
          and terminal_invite.reward_status = 'FORFEITED'
          and terminal_invite.slot_released_at is not null
          and (
            h.kind = 'SECURITY_INVITER_HOLD'
            or (
              h.kind = 'SECURITY_REVIEW_STARTED'
              and h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:preclaim-%'
              and coalesce(h.recipient_wallet, h.inviter_wallet) = h.inviter_wallet
            )
          )
      )
    ) as read_at
  from public.invite_notification_history h
  left join public.invite_notification_history_reads r
    on r.notification_id = h.id
   and r.inviter_wallet = v_wallet
  where coalesce(h.recipient_wallet, h.inviter_wallet) = v_wallet
    -- One blacklist outcome per recipient: retain append-only history while
    -- masking a generic ineligible event generated for the same decision.
    and not (
      h.kind = 'INVITE_INELIGIBLE'
      and exists (
        select 1
        from public.invite_notification_history security_outcome
        where security_outcome.invite_code = h.invite_code
          and security_outcome.kind = 'SECURITY_RESTRICTION_CONFIRMED'
          and coalesce(security_outcome.recipient_wallet, security_outcome.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and h.event_at between security_outcome.event_at - interval '10 minutes'
                             and security_outcome.event_at + interval '10 minutes'
      )
    )
    and (
      h.kind not in ('SECURITY_REVIEW_STARTED', 'SECURITY_POST_PAYOUT_REVIEW_STARTED', 'SECURITY_INVITER_HOLD')
      or h.event_at <= clock_timestamp() - interval '10 seconds'
    )
    and (p_before_id is null or h.id < p_before_id)
    and not (
      h.kind = 'SECURITY_REVIEW_STARTED'
      and exists (
        select 1
        from public.invite_notification_history later
        where coalesce(later.recipient_wallet, later.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and later.invite_code = h.invite_code
          and later.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REVIEW_CLEARED')
          and later.event_at >= h.event_at
          and later.event_at <= h.event_at + interval '10 seconds'
      )
    )
    and not (
      h.kind = 'SECURITY_POST_PAYOUT_REVIEW_STARTED'
      and exists (
        select 1
        from public.invite_notification_history later
        where coalesce(later.recipient_wallet, later.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and later.invite_code = h.invite_code
          and later.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_POST_PAYOUT_REVIEW_CLEARED')
          and later.event_at >= h.event_at
          and later.event_at <= h.event_at + interval '10 seconds'
      )
    )
    and not (
      h.kind = 'SECURITY_INVITER_HOLD'
      and exists (
        select 1
        from public.invite_notification_history later
        where coalesce(later.recipient_wallet, later.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and later.invite_code = h.invite_code
          and later.kind in ('SECURITY_INVITER_RESTRICTED', 'SECURITY_INVITER_ACCESS_RESTORED')
          and later.event_at >= h.event_at
          and later.event_at <= h.event_at + interval '10 seconds'
      )
    )
  order by h.id desc
  limit v_limit;
end;
$function$;

commit;
