-- Make multi-notification acknowledgement all-or-nothing.
-- The API validates that every requested acknowledgement still matches the
-- currently visible notification before calling this RPC. This wrapper keeps
-- all monotonic state updates in one PostgreSQL transaction so a transient
-- failure cannot leave only part of a "mark read" batch committed.

create or replace function public.acknowledge_invite_notifications_v2_batch(
  p_inviter_wallet text,
  p_items jsonb
)
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_wallet text := lower(btrim(p_inviter_wallet));
  v_item jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_stage integer;
  v_dapp_progress integer;
  v_reward_ready boolean;
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid inviter wallet';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'notification acknowledgements must be an array';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 10 then
    raise exception 'invalid notification acknowledgement count';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid notification acknowledgement';
    end if;

    v_stage := case
      when v_item ? 'stage' and v_item -> 'stage' <> 'null'::jsonb
        then (v_item ->> 'stage')::integer
      else null
    end;
    v_dapp_progress := case
      when v_item ? 'dappProgress' and v_item -> 'dappProgress' <> 'null'::jsonb
        then (v_item ->> 'dappProgress')::integer
      else null
    end;
    v_reward_ready := coalesce((v_item ->> 'rewardReady')::boolean, false);

    v_result := public.acknowledge_invite_notification_v2(
      v_item ->> 'inviteCode',
      v_wallet,
      v_stage,
      v_dapp_progress,
      v_reward_ready
    );
    v_results := v_results || jsonb_build_array(v_result);
  end loop;

  return v_results;
end;
$$;

revoke all on function public.acknowledge_invite_notifications_v2_batch(text,jsonb)
  from public, anon, authenticated;
grant execute on function public.acknowledge_invite_notifications_v2_batch(text,jsonb)
  to service_role;
