create or replace function public.security_identity_assessment_supported(
  p_status text,
  p_policy_version text,
  p_evidence jsonb
)
returns boolean
language sql
immutable
set search_path to 'pg_catalog', 'public'
as $function$
  select
    p_status = 'NO_KNOWN_LINK'
    and p_policy_version = 'security_client_v2'
    and coalesce(p_evidence ->> 'observedClientCount', '') ~ '^[1-9][0-9]*$'
    and coalesce(p_evidence ->> 'sameInviterClient', 'false') = 'false'
    and coalesce(p_evidence ->> 'relatedActiveParticipant', 'false') = 'false'
    and coalesce(p_evidence ->> 'relatedCompletedOrRewardedParticipant', 'false') = 'false';
$function$;

create or replace function public.enforce_invitation_identity_reward_gate()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.reward_status = 'ELIGIBLE'
     and not public.security_identity_reward_gate_passes(
       new.identity_link_status,
       new.identity_link_checked_at,
       new.vote_completed_at,
       new.identity_link_policy_version,
       new.identity_link_evidence
     ) then
    new.reward_status := 'PENDING';
    new.reward_eligible_at := null;
  elsif new.reward_status = 'PAID' then
    if tg_op = 'INSERT' then
      if not public.security_identity_reward_gate_passes(
        new.identity_link_status,
        new.identity_link_checked_at,
        new.vote_completed_at,
        new.identity_link_policy_version,
        new.identity_link_evidence
      ) then
        raise exception 'PAID_REWARD_IDENTITY_GATE_NOT_SATISFIED';
      end if;
    elsif old.reward_status is distinct from 'PAID'
          and not public.security_identity_reward_gate_passes(
            new.identity_link_status,
            new.identity_link_checked_at,
            new.vote_completed_at,
            new.identity_link_policy_version,
            new.identity_link_evidence
          ) then
      raise exception 'PAID_REWARD_IDENTITY_GATE_NOT_SATISFIED';
    end if;
  end if;

  return new;
end;
$function$;
