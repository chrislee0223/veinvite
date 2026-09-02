-- Close invitations after a verified ACTIVE_EXISTING entry rejection while
-- preserving the rejection as a distinct audit outcome. This keeps the
-- inviter's slot reusable without conflating ineligibility with a successful
-- referral lifecycle.

alter table public.invitations
  add column if not exists ineligibility_check_id bigint,
  add column if not exists ineligible_at timestamptz;

alter table public.invitations
  drop constraint if exists invitations_ineligibility_check_id_fkey;

alter table public.invitations
  add constraint invitations_ineligibility_check_id_fkey
  foreign key (ineligibility_check_id)
  references public.eligibility_check_events(id)
  on delete restrict;

create index if not exists invitations_inviter_ineligible_idx
  on public.invitations (inviter_wallet, ineligible_at desc)
  where ineligibility_check_id is not null;

create or replace function public.close_invitation_on_ineligible_entry_check()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $function$
begin
  if new.outcome <> 'EXISTING_VEBETTER_USER'
     or new.entry_class <> 'ACTIVE_EXISTING' then
    return new;
  end if;

  update public.invitations i
  set
    status = 'CANCELLED',
    ineligibility_check_id = new.id,
    ineligible_at = new.created_at
  where i.invite_code = new.invite_code
    and i.status = 'PENDING_ACCEPTANCE'
    and i.invitee_wallet is null
    and i.eligibility_check_id is null
    and i.ineligibility_check_id is null;

  return new;
end;
$function$;

revoke execute on function public.close_invitation_on_ineligible_entry_check()
  from public, anon, authenticated;
grant execute on function public.close_invitation_on_ineligible_entry_check()
  to service_role;

drop trigger if exists eligibility_checks_close_ineligible_invitation
  on public.eligibility_check_events;

create trigger eligibility_checks_close_ineligible_invitation
after insert on public.eligibility_check_events
for each row
when (
  new.outcome = 'EXISTING_VEBETTER_USER'
  and new.entry_class = 'ACTIVE_EXISTING'
)
execute function public.close_invitation_on_ineligible_entry_check();

-- The live claim path uses the same row-locking discipline as an eligible
-- claim. This prevents two wallets from racing the same pending invite and
-- guarantees that the rejection evidence and terminal slot release commit as
-- one transaction. The trigger above remains a defense for direct audit
-- inserts, while this RPC is the authoritative live transition.
create or replace function public.reject_invitation_with_entry_proof(
  p_invite_code text,
  p_wallet_address text,
  p_network text,
  p_checked_block bigint,
  p_prior_reward_tx_id text default null,
  p_prior_vote_tx_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_code text := upper(btrim(p_invite_code));
  v_wallet text := lower(btrim(p_wallet_address));
  v_network text := lower(btrim(p_network));
  v_invitation public.invitations%rowtype;
  v_check_id bigint;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'invalid invite code';
  end if;

  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid wallet';
  end if;

  if v_network not in ('mainnet', 'testnet', 'testnet-staging') then
    raise exception 'unsupported network';
  end if;

  if p_checked_block is null or p_checked_block < 0 then
    raise exception 'invalid checked block';
  end if;

  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'details must be a JSON object';
  end if;

  if upper(coalesce(nullif(btrim(p_details ->> 'entryClass'), ''), ''))
     <> 'ACTIVE_EXISTING' then
    raise exception 'rejected claim requires ACTIVE_EXISTING evidence';
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code = v_code
  for update;

  if not found then
    return jsonb_build_object('result', 'NOT_FOUND');
  end if;

  if v_invitation.status = 'CANCELLED' then
    return jsonb_build_object('result', 'CANCELLED');
  end if;

  if v_invitation.invitee_wallet is not null then
    return jsonb_build_object('result', 'ALREADY_USED');
  end if;

  if lower(v_invitation.inviter_wallet) = v_wallet then
    return jsonb_build_object('result', 'SELF_REFERRAL');
  end if;

  if exists (
    select 1
    from public.invitations i
    where i.invitee_wallet = v_wallet
  ) then
    return jsonb_build_object('result', 'ALREADY_REFERRED');
  end if;

  insert into public.eligibility_check_events (
    invite_code,
    wallet_address,
    network,
    checked_block,
    outcome,
    entry_class,
    prior_reward_tx_id,
    prior_vote_tx_id,
    details
  ) values (
    v_code,
    v_wallet,
    v_network,
    p_checked_block,
    'EXISTING_VEBETTER_USER',
    'ACTIVE_EXISTING',
    p_prior_reward_tx_id,
    p_prior_vote_tx_id,
    p_details
  ) returning id into v_check_id;

  -- The AFTER INSERT trigger normally performs this update. Keep the explicit
  -- guarded update as an invariant backstop so the RPC remains self-contained
  -- if trigger ordering changes in a future migration.
  update public.invitations i
  set
    status = 'CANCELLED',
    ineligibility_check_id = v_check_id,
    ineligible_at = coalesce(i.ineligible_at, now())
  where i.invite_code = v_code
    and i.status = 'PENDING_ACCEPTANCE'
    and i.invitee_wallet is null
    and i.eligibility_check_id is null
    and i.ineligibility_check_id is null;

  select * into v_invitation
  from public.invitations i
  where i.invite_code = v_code;

  if v_invitation.status <> 'CANCELLED'
     or v_invitation.ineligibility_check_id is distinct from v_check_id
     or v_invitation.ineligible_at is null
     or v_invitation.invitee_wallet is not null
     or v_invitation.eligibility_check_id is not null then
    raise exception 'ineligible invitation closure did not reach its terminal state';
  end if;

  return jsonb_build_object(
    'result', 'REJECTED',
    'invite_code', v_invitation.invite_code,
    'ineligibility_check_id', v_check_id,
    'ineligible_at', v_invitation.ineligible_at
  );
end;
$function$;

revoke all on function public.reject_invitation_with_entry_proof(
  text, text, text, bigint, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.reject_invitation_with_entry_proof(
  text, text, text, bigint, text, text, jsonb
) to service_role;

-- Reclassify prior live rejection attempts that were left as reusable pending
-- links by the old behavior. Historical accepted legacy rows are intentionally
-- untouched because the WHERE clause only targets unconsumed pending invites.
with latest_rejection as (
  select distinct on (e.invite_code)
    e.invite_code,
    e.id as check_id,
    e.created_at as rejected_at
  from public.eligibility_check_events e
  join public.invitations i
    on i.invite_code = e.invite_code
  where e.outcome = 'EXISTING_VEBETTER_USER'
    and e.entry_class = 'ACTIVE_EXISTING'
    and i.status = 'PENDING_ACCEPTANCE'
    and i.invitee_wallet is null
    and i.eligibility_check_id is null
  order by e.invite_code, e.created_at desc, e.id desc
)
update public.invitations i
set
  status = 'CANCELLED',
  ineligibility_check_id = r.check_id,
  ineligible_at = r.rejected_at
from latest_rejection r
where i.invite_code = r.invite_code
  and i.status = 'PENDING_ACCEPTANCE'
  and i.invitee_wallet is null
  and i.eligibility_check_id is null
  and i.ineligibility_check_id is null;

alter table public.invitations
  drop constraint if exists invitations_ineligibility_shape_check;

alter table public.invitations
  add constraint invitations_ineligibility_shape_check
  check (
    (
      ineligibility_check_id is null
      and ineligible_at is null
    )
    or
    (
      ineligibility_check_id is not null
      and ineligible_at is not null
      and status = 'CANCELLED'
      and invitee_wallet is null
      and eligibility_check_id is null
    )
  ) not valid;

alter table public.invitations
  validate constraint invitations_ineligibility_shape_check;

-- Operator-facing mutually exclusive funnel buckets. This prevents rejected
-- attempts from being counted again as pending acceptance.
create or replace view public.operator_invitation_funnel
with (security_invoker = true)
as
with classified as (
  select
    i.invite_code,
    i.status,
    i.invitee_wallet,
    i.eligibility_check_id,
    i.ineligibility_check_id,
    e.outcome as eligibility_outcome,
    e.entry_class,
    case
      when i.ineligibility_check_id is not null
        then 'INELIGIBLE'
      when i.eligibility_check_id is not null
       and e.outcome = 'ELIGIBLE'
       and e.entry_class in ('NEW', 'RETURNING')
        then 'ACCEPTED'
      when i.status = 'PENDING_ACCEPTANCE'
        then 'PENDING_ACCEPTANCE'
      when i.status = 'CANCELLED'
        then 'CANCELLED_BY_INVITER'
      when i.invitee_wallet is not null
       and i.eligibility_check_id is null
        then 'LEGACY_EXCLUDED'
      else 'OTHER'
    end as funnel_bucket
  from public.invitations i
  left join public.eligibility_check_events e
    on e.id = i.eligibility_check_id
)
select
  now() as generated_at,
  count(*)::bigint as invitations_generated,
  count(*) filter (where funnel_bucket = 'PENDING_ACCEPTANCE')::bigint
    as pending_acceptance,
  count(*) filter (where funnel_bucket = 'INELIGIBLE')::bigint
    as ineligible_rejections,
  count(*) filter (where funnel_bucket = 'ACCEPTED')::bigint
    as accepted_total,
  count(*) filter (
    where funnel_bucket = 'ACCEPTED' and entry_class = 'NEW'
  )::bigint as accepted_new,
  count(*) filter (
    where funnel_bucket = 'ACCEPTED' and entry_class = 'RETURNING'
  )::bigint as accepted_returning,
  count(*) filter (where funnel_bucket = 'CANCELLED_BY_INVITER')::bigint
    as cancelled_by_inviter,
  count(*) filter (where funnel_bucket = 'LEGACY_EXCLUDED')::bigint
    as legacy_excluded,
  count(*) filter (where funnel_bucket = 'OTHER')::bigint
    as other_rows
from classified;

revoke all on public.operator_invitation_funnel from anon, authenticated;
grant select on public.operator_invitation_funnel to service_role;
