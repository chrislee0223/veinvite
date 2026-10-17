-- Operator-only appeal disposition. This is NOT a Sybil verdict, referral
-- restriction change, clearance, signer action or reward authorization.
-- No update/delete rights for browsers or normal authenticated users.

alter table public.sybil_v2_appeal_requests
  add column if not exists resolution_outcome text,
  add column if not exists resolution_reason text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by_wallet text;

alter table public.sybil_v2_appeal_requests
  add constraint sybil_v2_appeal_resolution_shape
  check (
    (
      status <> 'RESOLVED' and
      resolution_outcome is null and resolution_reason is null and
      resolved_at is null and resolved_by_wallet is null
    ) or (
      status = 'RESOLVED' and
      resolution_outcome in ('UPHELD_RESTRICTION','CASE_VERDICT_CHANGED') and
      char_length(btrim(resolution_reason)) between 25 and 600 and
      resolved_at is not null and
      resolved_by_wallet ~ '^0x[0-9a-f]{40}$'
    )
  );

create table if not exists public.sybil_v2_appeal_review_events (
  id bigint generated always as identity primary key,
  appeal_id uuid not null references public.sybil_v2_appeal_requests(id) on delete restrict,
  network text not null check (network in ('mainnet','testnet')),
  operator_wallet text not null check (operator_wallet ~ '^0x[0-9a-f]{40}$'),
  outcome text not null check (outcome in ('UPHELD_RESTRICTION','CASE_VERDICT_CHANGED')),
  reason text not null check (char_length(btrim(reason)) between 25 and 600),
  assessment_revision_at_closure bigint not null check (assessment_revision_at_closure > 0),
  created_at timestamptz not null default now()
);

create index if not exists sybil_v2_appeal_review_events_appeal_idx
  on public.sybil_v2_appeal_review_events (appeal_id,created_at);

alter table public.sybil_v2_appeal_review_events enable row level security;
revoke all on public.sybil_v2_appeal_review_events
  from public,anon,authenticated;
grant select,insert on public.sybil_v2_appeal_review_events to service_role;

create or replace function public.close_sybil_v2_owner_appeal(
  p_appeal_id uuid,
  p_network text,
  p_expected_revision bigint,
  p_operator_wallet text,
  p_outcome text,
  p_reason text
)
returns table (closed boolean, final_status text)
language plpgsql
security definer
set search_path = pg_catalog,public
as $function$
declare
  v_appeal record;
  v_assessment record;
  v_wallet text;
  v_note text;
  v_now timestamptz := now();
begin
  v_wallet := lower(btrim(p_operator_wallet));
  v_note := btrim(coalesce(p_reason,''));
  if p_network not in ('mainnet','testnet')
     or v_wallet !~ '^0x[0-9a-f]{40}$'
     or p_expected_revision is null or p_expected_revision < 1
     or p_outcome not in ('UPHELD_RESTRICTION','CASE_VERDICT_CHANGED')
     or char_length(v_note) not between 25 and 600 then
    raise exception 'SYBIL_APPEAL_DISPOSITION_INVALID';
  end if;

  -- This function must be called by the HTTP API after its privileged
  -- reward-operator wallet authentication. DB is service-role-only.
  select * into v_appeal
  from public.sybil_v2_appeal_requests
  where id=p_appeal_id and network=p_network
  for update;
  if not found then raise exception 'SYBIL_APPEAL_NOT_FOUND'; end if;
  if v_appeal.status='RESOLVED' then
    raise exception 'SYBIL_APPEAL_ALREADY_RESOLVED';
  end if;
  if v_appeal.status not in ('PENDING','UNDER_REVIEW')
     or v_appeal.assessment_revision<>p_expected_revision then
    raise exception 'SYBIL_APPEAL_STATE_CHANGED';
  end if;

  select a.state,a.revision into v_assessment
  from public.sybil_v2_referral_assessments a
  where a.invite_code=v_appeal.invite_code and a.network=p_network
  for share;

  if v_assessment.revision is null then
    raise exception 'SYBIL_APPEAL_CASE_CHANGED';
  end if;
  if p_outcome='UPHELD_RESTRICTION' and
     (v_assessment.revision<>v_appeal.assessment_revision or
      (v_appeal.restriction_kind='BLACKLIST' and v_assessment.state<>'RESTRICTED') or
      (v_appeal.restriction_kind='PRE_CLAIM_HOLD' and v_assessment.state<>'HOLD')) then
    raise exception 'SYBIL_APPEAL_CASE_CHANGED';
  end if;
  -- Record an actual *later* decision, never reinterpret the original
  -- assessment or a stale same-revision snapshot as a changed verdict.
  if p_outcome='CASE_VERDICT_CHANGED' and
     (v_assessment.revision <= v_appeal.assessment_revision or
      (v_appeal.restriction_kind='BLACKLIST' and v_assessment.state='RESTRICTED') or
      (v_appeal.restriction_kind='PRE_CLAIM_HOLD' and v_assessment.state='HOLD')) then
    raise exception 'SYBIL_APPEAL_VERDICT_NOT_CHANGED';
  end if;

  update public.sybil_v2_appeal_requests
  set status='RESOLVED',
      resolution_outcome=p_outcome,
      resolution_reason=v_note,
      resolved_by_wallet=v_wallet,
      resolved_at=v_now,
      updated_at=v_now
  where id=p_appeal_id;

  insert into public.sybil_v2_appeal_review_events (
    appeal_id,network,operator_wallet,outcome,reason,assessment_revision_at_closure
  ) values (
    p_appeal_id,p_network,v_wallet,p_outcome,v_note,v_assessment.revision
  );

  return query select true, 'RESOLVED'::text;
end;
$function$;

revoke all on function public.close_sybil_v2_owner_appeal(uuid,text,bigint,text,text,text)
  from public,anon,authenticated;
grant execute on function public.close_sybil_v2_owner_appeal(uuid,text,bigint,text,text,text)
  to service_role;

comment on function public.close_sybil_v2_owner_appeal(uuid,text,bigint,text,text,text)
is 'Operator review request disposition only. Never changes Sybil verdicts, grants rewards, unblocks wallets, or modifies referrals.';
