-- Allow the VeInvite mission order:
-- dApp #1 -> qualifying B3TR->VOT3 conversion -> allocation vote ->
-- dApps #2/#3 later.
--
-- Raw impact events still must belong to the claimed wallet/network and occur
-- no earlier than invite activation. Final reward eligibility separately
-- requires a qualifying conversion before the vote and three distinct rewarded
-- dApps in total.

create or replace function public.validate_invite_impact_event()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_invitee text;
  v_activation_block bigint;
  v_activation_network text;
begin
  select invitee_wallet, activation_block, activation_network
    into v_invitee, v_activation_block, v_activation_network
  from public.invitations
  where invite_code = new.invite_code;

  if not found then
    raise exception 'Invitation % does not exist', new.invite_code;
  end if;

  if v_invitee is null or lower(v_invitee) <> lower(new.wallet_address) then
    raise exception 'Impact wallet does not match invitation %', new.invite_code;
  end if;

  if v_activation_network is null or lower(v_activation_network) <> lower(new.network) then
    raise exception 'Impact network does not match invitation %', new.invite_code;
  end if;

  if v_activation_block is null or new.block_number < v_activation_block then
    raise exception 'Impact block predates invitation activation %', new.invite_code;
  end if;

  return new;
end;
$$;
