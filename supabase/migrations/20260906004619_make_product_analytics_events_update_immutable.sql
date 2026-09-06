begin;
create or replace function public.prevent_app_product_event_update()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'app_product_events are immutable; insert a new event instead of updating history';
end;
$$;
revoke all on function public.prevent_app_product_event_update() from public,anon,authenticated;
grant execute on function public.prevent_app_product_event_update() to postgres,service_role;
drop trigger if exists app_product_events_prevent_update on public.app_product_events;
create trigger app_product_events_prevent_update before update on public.app_product_events for each row execute function public.prevent_app_product_event_update();
revoke update on table public.app_product_events from service_role;
comment on table public.app_product_events is 'Privacy-safe raw VeInvite product events. Append-only for event content; service_role may insert/select and controlled cleanup paths may delete. Never reward, referral, eligibility, mission, Sybil or payout authority.';
commit;