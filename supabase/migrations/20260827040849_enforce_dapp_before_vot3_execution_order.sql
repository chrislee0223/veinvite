create or replace function public.enforce_invitation_execution_order()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order_is_valid boolean := false;
begin
  if new.reward_status <> 'ELIGIBLE' then
    return new;
  end if;

  if new.invitee_wallet is null
     or new.activation_network is null
     or new.activation_block is null
     or new.vot3_conversion_tx_id is null
     or new.vot3_converted_block is null
     or new.vot3_converted_at is null
     or new.vot3_conversion_amount_wei is null then
    new.reward_status := 'PENDING';
    new.reward_eligible_at := null;
    return new;
  end if;

  select exists(
    select 1
    from public.invite_impact_events c
    where c.invite_code = new.invite_code
      and c.network = new.activation_network
      and c.wallet_address = lower(new.invitee_wallet)
      and c.event_type = 'VOT3_CONVERSION'
      and c.tx_id = new.vot3_conversion_tx_id
      and c.block_number = new.vot3_converted_block
      and c.block_timestamp = new.vot3_converted_at
      and c.amount_wei = new.vot3_conversion_amount_wei
      and c.tx_index is not null
      and c.clause_index is not null
      and exists(
        select 1
        from public.invite_impact_events r
        where r.invite_code = new.invite_code
          and r.network = new.activation_network
          and r.wallet_address = lower(new.invitee_wallet)
          and r.event_type = 'DAPP_REWARD'
          and r.block_number >= new.activation_block
          and r.tx_index is not null
          and r.clause_index is not null
          and (
            r.block_number < c.block_number
            or (
              r.block_number = c.block_number
              and (
                r.tx_index < c.tx_index
                or (
                  r.tx_index = c.tx_index
                  and r.clause_index < c.clause_index
                )
              )
            )
          )
      )
  ) into v_order_is_valid;

  if not v_order_is_valid then
    new.reward_status := 'PENDING';
    new.reward_eligible_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists zz_invitations_enforce_execution_order on public.invitations;
create trigger zz_invitations_enforce_execution_order
before insert or update on public.invitations
for each row
execute function public.enforce_invitation_execution_order();
