alter table public.invitations
  add column sybil_source text not null default 'SYSTEM';

alter table public.invitations
  add constraint invitations_sybil_source_check
    check (sybil_source = any (array['SYSTEM'::text, 'VEPASSPORT'::text, 'ONCHAIN'::text, 'OPERATOR'::text]));

create or replace function public.log_invitation_sybil_decision()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.sybil_status = 'NOT_CHECKED' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.sybil_status is not distinct from old.sybil_status
     and new.sybil_risk_level is not distinct from old.sybil_risk_level
     and new.sybil_risk_score is not distinct from old.sybil_risk_score
     and new.sybil_reason is not distinct from old.sybil_reason
     and new.sybil_checked_at is not distinct from old.sybil_checked_at
     and new.sybil_source is not distinct from old.sybil_source then
    return new;
  end if;

  if new.invitee_wallet is null then
    return new;
  end if;

  insert into public.sybil_review_events (
    invite_code,
    wallet_address,
    resulting_status,
    risk_level,
    risk_score,
    signal_code,
    source,
    summary,
    details
  ) values (
    new.invite_code,
    new.invitee_wallet,
    new.sybil_status,
    new.sybil_risk_level,
    new.sybil_risk_score,
    case new.sybil_status
      when 'CLEAR' then 'POST_VOTE_BASELINE_CLEAR'
      when 'REVIEW' then 'REVIEW_REQUIRED'
      when 'BLOCKED' then 'CONFIRMED_ABUSE'
      else null
    end,
    new.sybil_source,
    coalesce(
      nullif(btrim(new.sybil_reason), ''),
      case new.sybil_status
        when 'CLEAR' then 'Post-vote Sybil gate passed.'
        when 'REVIEW' then 'Additional Sybil review is required.'
        when 'BLOCKED' then 'Confirmed abuse blocked from rewards.'
        else 'Sybil decision updated.'
      end
    ),
    jsonb_build_object(
      'invite_status', new.status,
      'reward_status', new.reward_status
    )
  );

  return new;
end;
$function$;

revoke all on function public.log_invitation_sybil_decision() from public, anon, authenticated;

drop trigger if exists invitations_log_sybil_decision on public.invitations;
create trigger invitations_log_sybil_decision
after insert or update on public.invitations
for each row execute function public.log_invitation_sybil_decision();