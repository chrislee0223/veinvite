begin;

create table if not exists public.sybil_v2_confirmed_cluster_hubs (
  network text not null
    check (network in ('mainnet','testnet','testnet-staging')),
  wallet_address text not null
    check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  signature_code text not null
    check (length(signature_code) between 8 and 120),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','REVOKED')),
  source text not null default 'OPERATOR'
    check (source in ('OPERATOR','SYSTEM')),
  reason text not null
    check (length(reason) between 12 and 500),
  evidence_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence_summary) = 'object'),
  confirmed_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(network, wallet_address, signature_code),
  check (
    (status = 'ACTIVE' and revoked_at is null)
    or
    (status = 'REVOKED' and revoked_at is not null)
  )
);

create index if not exists sybil_v2_confirmed_cluster_hubs_active_idx
  on public.sybil_v2_confirmed_cluster_hubs(
    network, signature_code, confirmed_at
  )
  where status = 'ACTIVE';

alter table public.sybil_v2_confirmed_cluster_hubs
  enable row level security;

revoke all on public.sybil_v2_confirmed_cluster_hubs
  from public, anon, authenticated;
grant select, insert, update on public.sybil_v2_confirmed_cluster_hubs
  to service_role;

comment on table public.sybil_v2_confirmed_cluster_hubs is
  'Service-only registry of operator-confirmed malicious cluster hubs. A hub alone never causes a restriction; the current referral must reproduce the exact confirmed high-confidence signature and must have activated after the hub was confirmed.';

-- Learn the exact cluster that was manually reviewed before this migration.
-- The query is generic: only operator BLACKLIST decisions with synchronized
-- rewards plus the same HIGH common-sink/inviter hub are promoted.
with operator_black as (
  select
    a.invite_code,
    a.network,
    a.updated_at
  from public.sybil_v2_referral_assessments a
  where a.state = 'RESTRICTED'
    and a.source = 'OPERATOR'
    and a.reason_codes @> '["OPERATOR_BLACKLIST","HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER"]'::jsonb
),
paired as (
  select
    b.network,
    lower(e.related_wallet) as wallet_address,
    b.invite_code,
    b.updated_at,
    count(distinct e.signal_code)::integer as matched_codes
  from operator_black b
  join public.sybil_v2_evidence_records e
    on e.invite_code = b.invite_code
   and e.network = b.network
  where e.signal_code in (
      'HISTORICAL_COMMON_B3TR_SINK',
      'HISTORICAL_SINK_REAPPEARS_AS_INVITER'
    )
    and e.strength = 'HIGH'
    and e.score > 0
    and e.related_wallet is not null
  group by
    b.network,
    lower(e.related_wallet),
    b.invite_code,
    b.updated_at
),
confirmed as (
  select
    p.network,
    p.wallet_address,
    count(*)::integer as confirmed_referral_count,
    max(p.updated_at) as confirmed_at
  from paired p
  where p.matched_codes = 2
    and not exists (
      select 1
      from public.sybil_v2_cluster_hub_allowlist a
      where a.network = p.network
        and a.wallet_address = p.wallet_address
    )
  group by p.network, p.wallet_address
)
insert into public.sybil_v2_confirmed_cluster_hubs(
  network,
  wallet_address,
  signature_code,
  status,
  source,
  reason,
  evidence_summary,
  confirmed_at
)
select
  c.network,
  c.wallet_address,
  'SYNC_REWARD_COMMON_SINK_INVITER_V1',
  'ACTIVE',
  'OPERATOR',
  'Operator review confirmed the synchronized-reward/common-sink/inviter signature.',
  jsonb_build_object(
    'confirmedReferralCount', c.confirmed_referral_count,
    'backfilledFromOperatorBlacklists', true
  ),
  c.confirmed_at
from confirmed c
on conflict (network, wallet_address, signature_code) do nothing;

create or replace function public.learn_confirmed_cluster_hub_from_operator_blacklist()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hub text;
  v_signature constant text :=
    'SYNC_REWARD_COMMON_SINK_INVITER_V1';
begin
  if new.state <> 'RESTRICTED'
     or new.source <> 'OPERATOR'
     or not (
       new.reason_codes @> '["OPERATOR_BLACKLIST"]'::jsonb
       and new.reason_codes @> '["HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER"]'::jsonb
     ) then
    return new;
  end if;

  select lower(e.related_wallet)
  into v_hub
  from public.sybil_v2_evidence_records e
  where e.invite_code = new.invite_code
    and e.network = new.network
    and e.signal_code in (
      'HISTORICAL_COMMON_B3TR_SINK',
      'HISTORICAL_SINK_REAPPEARS_AS_INVITER'
    )
    and e.strength = 'HIGH'
    and e.score > 0
    and e.related_wallet is not null
  group by lower(e.related_wallet)
  having count(distinct e.signal_code) = 2
  order by lower(e.related_wallet)
  limit 1;

  if v_hub is null then
    return new;
  end if;

  if exists (
    select 1
    from public.sybil_v2_cluster_hub_allowlist a
    where a.network = new.network
      and a.wallet_address = v_hub
  ) then
    return new;
  end if;

  insert into public.sybil_v2_confirmed_cluster_hubs(
    network,
    wallet_address,
    signature_code,
    status,
    source,
    reason,
    evidence_summary,
    confirmed_at,
    revoked_at,
    updated_at
  ) values (
    new.network,
    v_hub,
    v_signature,
    'ACTIVE',
    'OPERATOR',
    'Operator review confirmed the synchronized-reward/common-sink/inviter signature.',
    jsonb_build_object(
      'firstConfirmedInviteCode', new.invite_code,
      'lastConfirmedInviteCode', new.invite_code
    ),
    clock_timestamp(),
    null,
    clock_timestamp()
  )
  on conflict (network, wallet_address, signature_code)
  do update
  set
    reason = excluded.reason,
    evidence_summary =
      public.sybil_v2_confirmed_cluster_hubs.evidence_summary
      || jsonb_build_object(
        'lastConfirmedInviteCode', new.invite_code,
        'lastConfirmedAt', clock_timestamp()
      ),
    updated_at = clock_timestamp()
  where public.sybil_v2_confirmed_cluster_hubs.status = 'ACTIVE';

  return new;
end;
$$;

revoke all on function public.learn_confirmed_cluster_hub_from_operator_blacklist()
  from public, anon, authenticated, service_role;

drop trigger if exists sybil_v2_learn_confirmed_cluster_hub
  on public.sybil_v2_referral_assessments;

create trigger sybil_v2_learn_confirmed_cluster_hub
after insert or update of state, source, reason_codes
on public.sybil_v2_referral_assessments
for each row
execute function public.learn_confirmed_cluster_hub_from_operator_blacklist();

create or replace function public.apply_sybil_v2_confirmed_cluster_blacklist(
  p_invite_code text,
  p_expected_revision bigint,
  p_hub_wallet text,
  p_signature_code text,
  p_network text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text := upper(btrim(p_invite_code));
  v_hub text := lower(btrim(p_hub_wallet));
  v_signature text := btrim(p_signature_code);
  v_network text := lower(btrim(p_network));
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_invitation public.invitations%rowtype;
  v_confirmed public.sybil_v2_confirmed_cluster_hubs%rowtype;
  v_record jsonb;
  v_now timestamptz := clock_timestamp();
  v_reason text;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'INVALID_ASSESSMENT_REVISION';
  end if;
  if v_hub !~ '^0x[0-9a-f]{40}$' then
    raise exception 'INVALID_CLUSTER_HUB';
  end if;
  if v_signature <> 'SYNC_REWARD_COMMON_SINK_INVITER_V1' then
    raise exception 'UNSUPPORTED_CLUSTER_SIGNATURE';
  end if;
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'INVALID_NETWORK';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_sybil_v2_confirmed_cluster_' || v_code,
      0
    )
  );

  select *
  into v_assessment
  from public.sybil_v2_referral_assessments
  where invite_code = v_code
  for update;

  if not found then
    raise exception 'SYBIL_V2_ASSESSMENT_NOT_FOUND';
  end if;
  if v_assessment.network <> v_network then
    raise exception 'SYBIL_V2_NETWORK_MISMATCH';
  end if;
  if v_assessment.revision <> p_expected_revision then
    raise exception 'SYBIL_V2_REVIEW_STATE_CHANGED';
  end if;

  -- Automatic blacklist is deliberately narrower than HOLD:
  -- only a current SYSTEM HOLD may be promoted automatically.
  if v_assessment.state <> 'HOLD'
     or v_assessment.source <> 'SYSTEM' then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'NOT_CURRENT_SYSTEM_HOLD'
    );
  end if;

  select *
  into v_invitation
  from public.invitations
  where invite_code = v_code
  for update;

  if not found
     or v_invitation.invitee_wallet is null
     or v_invitation.activated_at is null then
    raise exception 'SYBIL_V2_INVITATION_NOT_FOUND';
  end if;

  if v_invitation.reward_status = 'PAID' then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'REWARD_ALREADY_PAID'
    );
  end if;

  if exists (
    select 1
    from public.reward_queue_entries q
    where q.invite_code = v_code
      and q.status = 'ASSIGNED'
  ) then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'REWARD_ALREADY_ASSIGNED'
    );
  end if;

  select *
  into v_confirmed
  from public.sybil_v2_confirmed_cluster_hubs h
  where h.network = v_network
    and h.wallet_address = v_hub
    and h.signature_code = v_signature
    and h.status = 'ACTIVE'
    and h.confirmed_at <= v_invitation.activated_at
    and not exists (
      select 1
      from public.sybil_v2_cluster_hub_allowlist a
      where a.network = h.network
        and a.wallet_address = h.wallet_address
    );

  if not found then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'CLUSTER_NOT_CONFIRMED_FOR_ACTIVATION'
    );
  end if;

  if not exists (
    select 1
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and e.signal_code = 'HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER'
      and e.strength = 'HIGH'
      and e.score > 0
  ) then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'MISSING_SYNCHRONIZED_REWARD_SIGNAL'
    );
  end if;

  if (
    select count(distinct e.signal_code)
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and lower(e.related_wallet) = v_hub
      and e.signal_code in (
        'HISTORICAL_COMMON_B3TR_SINK',
        'HISTORICAL_SINK_REAPPEARS_AS_INVITER'
      )
      and e.strength = 'HIGH'
      and e.score > 0
  ) <> 2 then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'CONFIRMED_CLUSTER_SIGNATURE_MISMATCH'
    );
  end if;

  v_reason :=
    'Automatic blacklist: exact operator-confirmed Sybil cluster signature reproduced.';

  update public.invitations
  set
    status = 'CANCELLED',
    sybil_status = 'BLOCKED',
    sybil_risk_level = 'HIGH',
    sybil_risk_score = 100,
    sybil_reason = v_reason,
    sybil_checked_at = v_now,
    sybil_source = 'SYSTEM'
  where invite_code = v_code;

  if not exists (
    select 1
    from public.sybil_v2_wallet_restrictions r
    where r.network = v_network
      and r.wallet_address = lower(v_invitation.invitee_wallet)
      and r.status = 'ACTIVE'
  ) then
    insert into public.sybil_v2_wallet_restrictions(
      wallet_address,
      network,
      status,
      reason_codes,
      evidence_summary,
      source,
      related_invite_code,
      imposed_at
    ) values (
      lower(v_invitation.invitee_wallet),
      v_network,
      'ACTIVE',
      v_assessment.reason_codes
        || jsonb_build_array('AUTO_CONFIRMED_CLUSTER_BLACKLIST'),
      v_assessment.evidence_summary
        || jsonb_build_object(
          'automaticDecision', 'BLACKLIST',
          'confirmedClusterHub', v_hub,
          'confirmedClusterSignature', v_signature,
          'clusterConfirmedAt', v_confirmed.confirmed_at,
          'restrictionScope', 'INVITEE_ONLY'
        ),
      'SYSTEM',
      v_code,
      v_now
    );
  end if;

  v_record := public.record_sybil_v2_assessment(
    v_code,
    v_network,
    'RESTRICTED',
    100,
    v_assessment.policy_version,
    v_assessment.analyzer_version,
    v_assessment.evidence_cutoff_block,
    v_assessment.required_checks,
    v_assessment.completed_checks,
    v_assessment.reason_codes
      || jsonb_build_array('AUTO_CONFIRMED_CLUSTER_BLACKLIST'),
    v_assessment.evidence_summary
      || jsonb_build_object(
        'automaticDecision', 'BLACKLIST',
        'confirmedClusterHub', v_hub,
        'confirmedClusterSignature', v_signature,
        'clusterConfirmedAt', v_confirmed.confirmed_at,
        'automaticDecidedAt', v_now
      ),
    'SYSTEM',
    v_assessment.revision
  );

  return jsonb_build_object(
    'changed', true,
    'state', 'RESTRICTED',
    'revision', v_record ->> 'revision',
    'reason', 'AUTO_CONFIRMED_CLUSTER_BLACKLIST',
    'restrictedWallet', lower(v_invitation.invitee_wallet),
    'confirmedClusterHub', v_hub
  );
end;
$$;

revoke all on function public.apply_sybil_v2_confirmed_cluster_blacklist(
  text, bigint, text, text, text
) from public, anon, authenticated;
grant execute on function public.apply_sybil_v2_confirmed_cluster_blacklist(
  text, bigint, text, text, text
) to service_role;

comment on function public.apply_sybil_v2_confirmed_cluster_blacklist(
  text, bigint, text, text, text
) is
  'Promotes only a prospective SYSTEM HOLD that exactly reproduces an operator-confirmed synchronized-reward/common-sink/inviter cluster signature. Hub linkage alone, historical pre-confirmation referrals, paid rewards, assigned payouts, allowlisted hubs, and operator decisions cannot be auto-blacklisted.';

commit;
