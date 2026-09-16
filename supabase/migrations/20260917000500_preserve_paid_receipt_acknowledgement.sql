-- Keep REWARD_PAID unread until the user acknowledges the rich reward receipt.
-- Bulk mark-all uses a watermark and must not bypass that acknowledgement path.

begin;

create or replace function public.acknowledge_invite_notification_history(
  p_inviter_wallet text,
  p_ids bigint[] default null,
  p_through_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_wallet text := lower(btrim(p_inviter_wallet));
  v_row public.invite_notification_history%rowtype;
  v_count integer := 0;
  v_stage integer;
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid inviter wallet';
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
    where h.inviter_wallet = v_wallet
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
      v_count := v_count + 1;
    end if;
  end loop;

  return jsonb_build_object('acknowledged', v_count);
end;
$$;

revoke all on function public.acknowledge_invite_notification_history(text,bigint[],bigint) from public, anon, authenticated;
grant execute on function public.acknowledge_invite_notification_history(text,bigint[],bigint) to service_role;

commit;
