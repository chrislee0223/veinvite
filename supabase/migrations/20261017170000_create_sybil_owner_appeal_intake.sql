-- Append-only intake for verified-wallet Sybil review requests.
-- This is NOT a CLEAR, REINSTATE, BLACKLIST or reward-authorizing path.
-- All claims/restrictions/payout gates remain unchanged.
create table if not exists public.sybil_v2_appeal_requests (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null references public.invitations(invite_code) on update cascade on delete restrict,
  network text not null check (network in ('mainnet','testnet')),
  wallet_address text not null check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  assessment_revision bigint not null check (assessment_revision > 0),
  restriction_kind text not null check (restriction_kind in ('BLACKLIST','PRE_CLAIM_HOLD')),
  category text not null check (
    category in ('DISTINCT_PERSON_SHARED_DEVICE','INCORRECT_IDENTITY_LINK','MISSING_ACTIVITY','OTHER')
  ),
  explanation text not null check (char_length(btrim(explanation)) between 25 and 600),
  status text not null default 'PENDING' check (status in ('PENDING','UNDER_REVIEW','RESOLVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sybil_v2_appeal_requests_once_per_revision
    unique (invite_code, network, wallet_address, assessment_revision)
);

create index if not exists sybil_v2_appeal_requests_operator_queue_idx
  on public.sybil_v2_appeal_requests (network,status,created_at);
create index if not exists sybil_v2_appeal_requests_owner_idx
  on public.sybil_v2_appeal_requests (wallet_address,network,invite_code,created_at desc);

alter table public.sybil_v2_appeal_requests enable row level security;
revoke all on table public.sybil_v2_appeal_requests from public,anon,authenticated;
grant select,insert on table public.sybil_v2_appeal_requests to service_role;

comment on table public.sybil_v2_appeal_requests is
  'Verified-wallet, once-per-assessment-revision request to review a Sybil HOLD/BLACKLIST. PENDING never changes restrictions, mission or rewards. Not a verdict.';

create or replace function public.submit_sybil_v2_appeal(
  p_invite_code text,
  p_network text,
  p_wallet_address text,
  p_expected_revision bigint,
  p_category text,
  p_explanation text
)
returns table(submitted boolean, already_submitted boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_assessment record;
  v_invitation record;
  v_wallet text;
  v_kind text;
  v_inserted uuid;
begin
  v_wallet := lower(btrim(p_wallet_address));
  if p_network not in ('mainnet','testnet')
     or p_invite_code !~ '^[A-HJ-NP-Z2-9]{7}$'
     or v_wallet !~ '^0x[0-9a-f]{40}$'
     or p_expected_revision is null or p_expected_revision <= 0
     or p_category not in (
       'DISTINCT_PERSON_SHARED_DEVICE','INCORRECT_IDENTITY_LINK','MISSING_ACTIVITY','OTHER'
     )
     or char_length(btrim(coalesce(p_explanation,''))) not between 25 and 600 then
    raise exception 'SYBIL_APPEAL_INVALID_INPUT';
  end if;

  -- Fail closed at the database boundary even if a web request races an
  -- operator decision. No user-supplied invitation selector reaches here
  -- without a wallet session check in the HTTP layer.
  select a.state,a.revision,a.network
    into v_assessment
    from public.sybil_v2_referral_assessments a
   where a.invite_code=p_invite_code and a.network=p_network
   for share;
  select i.invitee_wallet,i.activation_network
    into v_invitation
    from public.invitations i
   where i.invite_code=p_invite_code
   for share;

  if not found or v_assessment.revision is null
     or v_invitation.invitee_wallet is null
     or lower(v_invitation.invitee_wallet) <> v_wallet
     or v_invitation.activation_network <> p_network
     or v_assessment.revision <> p_expected_revision then
    raise exception 'SYBIL_APPEAL_CASE_CHANGED';
  end if;

  if exists (
    select 1 from public.sybil_v2_wallet_restrictions r
     where r.wallet_address=v_wallet
       and r.network=p_network
       and r.status='ACTIVE'
       and r.related_invite_code=p_invite_code
  ) and v_assessment.state='RESTRICTED' then
    v_kind := 'BLACKLIST';
  elsif exists (
    select 1 from public.operator_sybil_v2_temporary_participation_holds h
     where h.wallet_address=v_wallet
       and h.network=p_network
       and h.restriction_kind='PRE_CLAIM_HOLD'
       and h.related_invite_code=p_invite_code
  ) and v_assessment.state='HOLD' then
    v_kind := 'PRE_CLAIM_HOLD';
  else
    raise exception 'SYBIL_APPEAL_NO_ACTIVE_CASE';
  end if;

  insert into public.sybil_v2_appeal_requests (
    invite_code,network,wallet_address,assessment_revision,
    restriction_kind,category,explanation
  ) values (
    p_invite_code,p_network,v_wallet,p_expected_revision,
    v_kind,p_category,btrim(p_explanation)
  )
  on conflict on constraint sybil_v2_appeal_requests_once_per_revision
    do nothing
  returning id into v_inserted;

  return query select (v_inserted is not null), (v_inserted is null);
end;
$function$;

revoke all on function public.submit_sybil_v2_appeal(text,text,text,bigint,text,text)
  from public,anon,authenticated;
grant execute on function public.submit_sybil_v2_appeal(text,text,text,bigint,text,text)
  to service_role;

comment on function public.submit_sybil_v2_appeal(text,text,text,bigint,text,text) is
  'Submit one owner review request per unchanged Sybil assessment revision. No verdict, wallet release, reward transfer or claims.';
