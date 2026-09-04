-- Preserve already-seen notification milestones as read history so enabling
-- the persistent notification center does not replay old notices to users.

begin;

with source as (
  select
    s.invite_code,
    lower(s.inviter_wallet) as inviter_wallet,
    s.acknowledged_at as read_at,
    s.highest_stage,
    lower(i.invitee_wallet) as friend_wallet,
    coalesce(i.activated_at, i.updated_at) as event_at
  from public.invite_notification_state s
  join public.invitations i
    on i.invite_code = s.invite_code
   and lower(i.inviter_wallet) = lower(s.inviter_wallet)
  where s.highest_stage >= 1
    and i.invitee_wallet is not null
), inserted as (
  insert into public.invite_notification_history(
    inviter_wallet, invite_code, kind, stage, event_at,
    reward_amount_wei, dapp_progress, collapsed_progress,
    friend_wallet, dedupe_key
  )
  select
    inviter_wallet, invite_code, 'INVITE_ACCEPTED', 1, event_at,
    null, null, false, friend_wallet,
    concat_ws(':','v2',invite_code,'INVITE_ACCEPTED','-')
  from source
  on conflict (dedupe_key) do nothing
  returning id, inviter_wallet, invite_code
)
insert into public.invite_notification_history_reads(notification_id, inviter_wallet, read_at)
select i.id, i.inviter_wallet, s.read_at
from inserted i
join source s using (inviter_wallet, invite_code)
on conflict (notification_id) do nothing;

with source as (
  select
    s.invite_code,
    lower(s.inviter_wallet) as inviter_wallet,
    s.acknowledged_at as read_at,
    s.dapp_progress_acknowledged as dapp_progress,
    lower(i.invitee_wallet) as friend_wallet,
    coalesce(i.apps_completed_at, i.updated_at) as event_at
  from public.invite_notification_state s
  join public.invitations i
    on i.invite_code = s.invite_code
   and lower(i.inviter_wallet) = lower(s.inviter_wallet)
  where s.dapp_progress_acknowledged between 1 and 3
    and i.invitee_wallet is not null
), inserted as (
  insert into public.invite_notification_history(
    inviter_wallet, invite_code, kind, stage, event_at,
    reward_amount_wei, dapp_progress, collapsed_progress,
    friend_wallet, dedupe_key
  )
  select
    inviter_wallet, invite_code, 'DAPP_PROGRESS', 2, event_at,
    null, dapp_progress, false, friend_wallet,
    concat_ws(':','v2',invite_code,'DAPP_PROGRESS',dapp_progress::text)
  from source
  on conflict (dedupe_key) do nothing
  returning id, inviter_wallet, invite_code
)
insert into public.invite_notification_history_reads(notification_id, inviter_wallet, read_at)
select i.id, i.inviter_wallet, s.read_at
from inserted i
join source s using (inviter_wallet, invite_code)
on conflict (notification_id) do nothing;

with source as (
  select
    s.invite_code,
    lower(s.inviter_wallet) as inviter_wallet,
    s.acknowledged_at as read_at,
    s.highest_stage,
    lower(i.invitee_wallet) as friend_wallet,
    coalesce(i.vot3_converted_at, i.updated_at) as event_at
  from public.invite_notification_state s
  join public.invitations i
    on i.invite_code = s.invite_code
   and lower(i.inviter_wallet) = lower(s.inviter_wallet)
  where s.highest_stage >= 3
    and i.vot3_converted = true
    and i.invitee_wallet is not null
), inserted as (
  insert into public.invite_notification_history(
    inviter_wallet, invite_code, kind, stage, event_at,
    reward_amount_wei, dapp_progress, collapsed_progress,
    friend_wallet, dedupe_key
  )
  select
    inviter_wallet, invite_code, 'VOT3_CONVERTED', 3, event_at,
    null, 3, false, friend_wallet,
    concat_ws(':','v2',invite_code,'VOT3_CONVERTED','3')
  from source
  on conflict (dedupe_key) do nothing
  returning id, inviter_wallet, invite_code
)
insert into public.invite_notification_history_reads(notification_id, inviter_wallet, read_at)
select i.id, i.inviter_wallet, s.read_at
from inserted i
join source s using (inviter_wallet, invite_code)
on conflict (notification_id) do nothing;

with source as (
  select
    s.invite_code,
    lower(s.inviter_wallet) as inviter_wallet,
    s.reward_ready_acknowledged_at as read_at,
    lower(i.invitee_wallet) as friend_wallet,
    q.reserved_amount_wei as reward_amount_wei,
    coalesce(q.reserved_at, s.reward_ready_acknowledged_at) as event_at
  from public.invite_notification_state s
  join public.invitations i
    on i.invite_code = s.invite_code
   and lower(i.inviter_wallet) = lower(s.inviter_wallet)
  left join lateral (
    select rqe.reserved_amount_wei, rqe.reserved_at
    from public.reward_queue_entries rqe
    where rqe.invite_code = s.invite_code
      and rqe.reserved_at is not null
    order by rqe.reserved_at desc
    limit 1
  ) q on true
  where s.reward_ready_acknowledged_at is not null
    and i.invitee_wallet is not null
    and q.reserved_amount_wei is not null
), inserted as (
  insert into public.invite_notification_history(
    inviter_wallet, invite_code, kind, stage, event_at,
    reward_amount_wei, dapp_progress, collapsed_progress,
    friend_wallet, dedupe_key
  )
  select
    inviter_wallet, invite_code, 'REWARD_READY', 4, event_at,
    reward_amount_wei, 3, false, friend_wallet,
    concat_ws(':','v2',invite_code,'REWARD_READY','3')
  from source
  on conflict (dedupe_key) do nothing
  returning id, inviter_wallet, invite_code
)
insert into public.invite_notification_history_reads(notification_id, inviter_wallet, read_at)
select i.id, i.inviter_wallet, s.read_at
from inserted i
join source s using (inviter_wallet, invite_code)
on conflict (notification_id) do nothing;

with source as (
  select
    s.invite_code,
    lower(s.inviter_wallet) as inviter_wallet,
    s.acknowledged_at as read_at,
    s.highest_stage,
    lower(i.invitee_wallet) as friend_wallet,
    p.amount_wei as reward_amount_wei,
    p.paid_at as event_at
  from public.invite_notification_state s
  join public.invitations i
    on i.invite_code = s.invite_code
   and lower(i.inviter_wallet) = lower(s.inviter_wallet)
  left join lateral (
    select rp.amount_wei, rp.paid_at
    from public.reward_payouts rp
    where rp.invite_code = s.invite_code
      and rp.status = 'PAID'
      and rp.paid_at is not null
    order by rp.paid_at desc
    limit 1
  ) p on true
  where s.highest_stage >= 5
    and i.invitee_wallet is not null
    and p.amount_wei is not null
    and p.paid_at is not null
), inserted as (
  insert into public.invite_notification_history(
    inviter_wallet, invite_code, kind, stage, event_at,
    reward_amount_wei, dapp_progress, collapsed_progress,
    friend_wallet, dedupe_key
  )
  select
    inviter_wallet, invite_code, 'REWARD_PAID', 5, event_at,
    reward_amount_wei, 3, false, friend_wallet,
    concat_ws(':','v2',invite_code,'REWARD_PAID','3')
  from source
  on conflict (dedupe_key) do nothing
  returning id, inviter_wallet, invite_code
)
insert into public.invite_notification_history_reads(notification_id, inviter_wallet, read_at)
select i.id, i.inviter_wallet, s.read_at
from inserted i
join source s using (inviter_wallet, invite_code)
on conflict (notification_id) do nothing;

with source as (
  select
    s.invite_code,
    lower(s.inviter_wallet) as inviter_wallet,
    s.acknowledged_at as read_at,
    s.highest_stage,
    lower(i.invitee_wallet) as friend_wallet,
    coalesce(i.ineligible_at, i.updated_at) as event_at
  from public.invite_notification_state s
  join public.invitations i
    on i.invite_code = s.invite_code
   and lower(i.inviter_wallet) = lower(s.inviter_wallet)
  where s.highest_stage >= 6
    and i.ineligibility_check_id is not null
), inserted as (
  insert into public.invite_notification_history(
    inviter_wallet, invite_code, kind, stage, event_at,
    reward_amount_wei, dapp_progress, collapsed_progress,
    friend_wallet, dedupe_key
  )
  select
    inviter_wallet, invite_code, 'INVITE_INELIGIBLE', 6, event_at,
    null, null, false, friend_wallet,
    concat_ws(':','v2',invite_code,'INVITE_INELIGIBLE','-')
  from source
  on conflict (dedupe_key) do nothing
  returning id, inviter_wallet, invite_code
)
insert into public.invite_notification_history_reads(notification_id, inviter_wallet, read_at)
select i.id, i.inviter_wallet, s.read_at
from inserted i
join source s using (inviter_wallet, invite_code)
on conflict (notification_id) do nothing;

commit;
