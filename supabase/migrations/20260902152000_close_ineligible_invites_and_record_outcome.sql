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
