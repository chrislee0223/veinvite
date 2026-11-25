\set ON_ERROR_STOP on
-- Disposable PostgreSQL only. Install actual original canonical trigger
-- definitions from the read-only production catalog, not synthetic approvals.
ALTER TABLE public.invitations
 ADD COLUMN apps_completed integer DEFAULT 0,
 ADD COLUMN rewards_received integer DEFAULT 0,
 ADD COLUMN apps_completed_at timestamptz,
 ADD COLUMN apps_completed_block bigint,
 ADD COLUMN vot3_converted boolean DEFAULT false,
 ADD COLUMN vot3_converted_at timestamptz,
 ADD COLUMN vot3_converted_block bigint,
 ADD COLUMN vot3_conversion_tx_id text,
 ADD COLUMN vot3_conversion_amount_wei text,
 ADD COLUMN vote_completed_at timestamptz,
 ADD COLUMN vote_completed_block bigint,
 ADD COLUMN vote_round_id bigint,
 ADD COLUMN impact_last_synced_block bigint,
 ADD COLUMN impact_last_synced_at timestamptz,
 ADD COLUMN impact_sync_complete_at timestamptz,
 ADD COLUMN reward_paid_at timestamptz,
 ADD COLUMN reward_eligible_at timestamptz,
 ADD COLUMN sybil_checked_at timestamptz;
ALTER TABLE public.reward_payouts ADD COLUMN tx_id text,ADD COLUMN paid_at timestamptz;
CREATE TABLE public.invite_impact_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 invite_code text,network text,wallet_address text,event_type text,tx_id text,
 block_number bigint,block_timestamp timestamptz,app_id text,vote_round_id bigint,
 amount_wei text,tx_index bigint,clause_index bigint
);
INSERT INTO public.invite_impact_events
 (invite_code,network,wallet_address,event_type,tx_id,block_number,block_timestamp,app_id,amount_wei,tx_index,clause_index)
SELECT 'EDFW4Y7','mainnet',invitee_wallet,'DAPP_REWARD','0x'||repeat('9',64),
  150,now(),'0x'||repeat('9',64),'5',0,0
FROM public.invitations WHERE invite_code='EDFW4Y7';
INSERT INTO public.invite_impact_events
 (invite_code,network,wallet_address,event_type,tx_id,block_number,block_timestamp,app_id,amount_wei,tx_index,clause_index)
SELECT 'ACXKGKC','mainnet',invitee_wallet,'DAPP_REWARD','0x'||repeat('8',64),
  151,now(),'0x'||repeat('8',64),'5',0,0
FROM public.invitations WHERE invite_code='ACXKGKC';

CREATE OR REPLACE FUNCTION public.enforce_invitation_execution_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
     or new.vot3_conversion_amount_wei is null
     or new.vote_completed_block is null
     or new.vote_completed_at is null
     or new.vote_round_id is null then
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
      and exists(
        select 1
        from public.invite_impact_events v
        where v.invite_code = new.invite_code
          and v.network = new.activation_network
          and v.wallet_address = lower(new.invitee_wallet)
          and v.event_type = 'ALLOCATION_VOTE'
          and v.block_number = new.vote_completed_block
          and v.block_timestamp = new.vote_completed_at
          and v.vote_round_id = new.vote_round_id
          and v.tx_index is not null
          and v.clause_index is not null
          and (
            c.block_number < v.block_number
            or (
              c.block_number = v.block_number
              and (
                c.tx_index < v.tx_index
                or (
                  c.tx_index = v.tx_index
                  and c.clause_index < v.clause_index
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
$function$;

CREATE OR REPLACE FUNCTION public.sync_invitation_reward_eligibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_has_paid_payout boolean := false;
  v_has_eligible_entry_check boolean := false;
  v_has_three_reward_events boolean := false;
  v_has_third_app_checkpoint boolean := false;
  v_has_conversion_event boolean := false;
  v_has_vote_event boolean := false;
begin
  select exists(
    select 1
    from public.reward_payouts rp
    where rp.invite_code = new.invite_code
      and rp.status = 'PAID'
      and rp.tx_id is not null
      and rp.paid_at is not null
  ) into v_has_paid_payout;

  if v_has_paid_payout then
    new.reward_status := 'PAID';
    if new.reward_paid_at is null then
      select rp.paid_at
      into new.reward_paid_at
      from public.reward_payouts rp
      where rp.invite_code = new.invite_code
        and rp.status = 'PAID'
      order by rp.paid_at desc
      limit 1;
    end if;
    return new;
  end if;

  new.reward_paid_at := null;

  if new.status = 'CANCELLED' or new.sybil_status = 'BLOCKED' then
    new.reward_status := 'FORFEITED';
    new.reward_eligible_at := null;
    return new;
  end if;

  if new.invitee_wallet is null
     or new.activation_block is null
     or new.activation_network is null
     or coalesce(new.apps_completed, 0) < 3
     or new.apps_completed_at is null
     or new.apps_completed_block is null
     or new.apps_completed_block < new.activation_block then
    new.apps_completed_at := null;
    new.apps_completed_block := null;
  end if;

  if coalesce(new.vot3_converted, false) = false
     or new.invitee_wallet is null
     or new.activation_block is null
     or new.activation_network is null
     or new.vot3_converted_at is null
     or new.vot3_converted_block is null
     or new.vot3_conversion_tx_id is null
     or new.vot3_conversion_amount_wei is null
     or new.vot3_converted_block < new.activation_block
     or new.vot3_conversion_tx_id !~ '^0x[0-9a-f]{64}$'
     or new.vot3_conversion_amount_wei !~ '^[0-9]+$'
     or new.vot3_conversion_amount_wei::numeric <= 0 then
    new.vot3_converted := false;
    new.vot3_converted_at := null;
    new.vot3_converted_block := null;
    new.vot3_conversion_tx_id := null;
    new.vot3_conversion_amount_wei := null;
    new.vote_completed := false;
    new.vote_completed_at := null;
    new.vote_completed_block := null;
    new.vote_round_id := null;
  else
    if coalesce(new.vote_completed, false) = false
       or new.vote_completed_at is null
       or new.vote_completed_block is null
       or new.vote_round_id is null
       or new.vote_completed_block < new.vot3_converted_block then
      new.vote_completed := false;
      new.vote_completed_at := null;
      new.vote_completed_block := null;
      new.vote_round_id := null;
    end if;
  end if;

  if new.eligibility_check_id is not null
     and new.invitee_wallet is not null
     and new.activation_network is not null
     and new.activation_block is not null then
    select exists(
      select 1
      from public.eligibility_check_events e
      where e.id = new.eligibility_check_id
        and e.invite_code = new.invite_code
        and e.wallet_address = lower(new.invitee_wallet)
        and e.network = new.activation_network
        and e.outcome = 'ELIGIBLE'
        and e.entry_class in ('NEW', 'RETURNING')
        and e.checked_block <= new.activation_block
    ) into v_has_eligible_entry_check;
  end if;

  if new.invitee_wallet is not null
     and new.activation_network is not null
     and new.activation_block is not null
     and new.apps_completed_at is not null
     and new.apps_completed_block is not null then
    select count(distinct e.app_id) >= 3
    into v_has_three_reward_events
    from public.invite_impact_events e
    where e.invite_code = new.invite_code
      and e.network = new.activation_network
      and e.wallet_address = lower(new.invitee_wallet)
      and e.event_type = 'DAPP_REWARD'
      and e.block_number >= new.activation_block
      and e.block_number <= new.apps_completed_block;

    select exists(
      select 1
      from public.invite_impact_events e
      where e.invite_code = new.invite_code
        and e.network = new.activation_network
        and e.wallet_address = lower(new.invitee_wallet)
        and e.event_type = 'DAPP_REWARD'
        and e.block_number = new.apps_completed_block
        and e.block_timestamp = new.apps_completed_at
    ) into v_has_third_app_checkpoint;
  end if;

  if new.invitee_wallet is not null
     and new.activation_network is not null
     and new.activation_block is not null
     and new.vot3_converted = true
     and new.vot3_converted_at is not null
     and new.vot3_converted_block is not null
     and new.vot3_conversion_tx_id is not null
     and new.vot3_conversion_amount_wei is not null then
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
        and c.amount_wei ~ '^[0-9]+$'
        and c.amount_wei::numeric > 0
        and exists(
          select 1
          from public.invite_impact_events r
          where r.invite_code = new.invite_code
            and r.network = new.activation_network
            and r.wallet_address = lower(new.invitee_wallet)
            and r.event_type = 'DAPP_REWARD'
            and r.block_number >= new.activation_block
            and r.block_number <= c.block_number
        )
    ) into v_has_conversion_event;
  end if;

  if new.invitee_wallet is not null
     and new.activation_network is not null
     and new.vot3_converted_block is not null
     and new.vote_completed_at is not null
     and new.vote_completed_block is not null
     and new.vote_round_id is not null then
    select exists(
      select 1
      from public.invite_impact_events e
      where e.invite_code = new.invite_code
        and e.network = new.activation_network
        and e.wallet_address = lower(new.invitee_wallet)
        and e.event_type = 'ALLOCATION_VOTE'
        and e.block_number = new.vote_completed_block
        and e.block_timestamp = new.vote_completed_at
        and e.vote_round_id = new.vote_round_id
        and e.block_number >= new.vot3_converted_block
    ) into v_has_vote_event;
  end if;

  if new.status = 'COMPLETED'
     and v_has_eligible_entry_check
     and v_has_three_reward_events
     and v_has_third_app_checkpoint
     and v_has_conversion_event
     and v_has_vote_event
     and new.impact_sync_complete_at is not null
     and new.invitee_wallet is not null
     and new.activation_block is not null
     and new.activation_network is not null
     and coalesce(new.apps_completed, 0) >= 3
     and new.apps_completed_at is not null
     and new.apps_completed_block is not null
     and new.apps_completed_block >= new.activation_block
     and new.vot3_converted = true
     and new.vot3_converted_at is not null
     and new.vot3_converted_block is not null
     and new.vot3_converted_block >= new.activation_block
     and new.vot3_conversion_tx_id is not null
     and new.vot3_conversion_amount_wei is not null
     and new.vot3_conversion_amount_wei::numeric > 0
     and coalesce(new.vote_completed, false) = true
     and new.vote_completed_at is not null
     and new.vote_completed_block is not null
     and new.vote_round_id is not null
     and new.vote_completed_block >= new.vot3_converted_block
     and new.sybil_status = 'CLEAR'
     and new.sybil_checked_at is not null
     and new.sybil_checked_at >= new.vote_completed_at then
    new.reward_status := 'ELIGIBLE';
    new.reward_eligible_at := coalesce(
      new.reward_eligible_at,
      new.impact_sync_complete_at,
      new.sybil_checked_at,
      new.vote_completed_at,
      now()
    );
  elsif new.invitee_wallet is not null then
    new.reward_status := 'PENDING';
    new.reward_eligible_at := null;
  else
    new.reward_status := 'NONE';
    new.reward_eligible_at := null;
  end if;

  return new;
end;
$function$;

CREATE TRIGGER invitations_sync_reward_eligibility BEFORE UPDATE ON public.invitations
 FOR EACH ROW EXECUTE FUNCTION public.sync_invitation_reward_eligibility();
CREATE TRIGGER zz_invitations_enforce_execution_order BEFORE UPDATE ON public.invitations
 FOR EACH ROW EXECUTE FUNCTION public.enforce_invitation_execution_order();
