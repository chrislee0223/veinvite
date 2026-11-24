\set ON_ERROR_STOP on
-- Isolated fake DB; NEVER connect this fixture to Production.
ALTER TABLE public.invitations
  ADD COLUMN inviter_wallet text,
  ADD COLUMN activation_block bigint,
  ADD COLUMN slot_released_at timestamptz;
UPDATE public.invitations
SET inviter_wallet='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    activation_block=100;

CREATE TABLE public.eligibility_check_events(
  id bigint PRIMARY KEY,
  invite_code text NOT NULL,
  wallet_address text NOT NULL,
  network text NOT NULL,
  outcome text NOT NULL,
  entry_class text NOT NULL,
  checked_block bigint NOT NULL
);
INSERT INTO public.eligibility_check_events
(id,invite_code,wallet_address,network,outcome,entry_class,checked_block)
SELECT eligibility_check_id,invite_code,invitee_wallet,'mainnet','ELIGIBLE','NEW',90
FROM public.invitations WHERE eligibility_check_id IS NOT NULL;

CREATE TABLE public.invite_notification_history(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inviter_wallet text NOT NULL,
  invite_code text NOT NULL,
  kind text NOT NULL,
  stage smallint NOT NULL,
  event_at timestamptz NOT NULL,
  reward_amount_wei text,
  dapp_progress smallint,
  collapsed_progress boolean NOT NULL,
  friend_wallet text,
  recipient_wallet text,
  dedupe_key text NOT NULL UNIQUE
);

-- The currently indexed 125 funding allocation proves current round 126.
INSERT INTO public.vebetter_round_allocations
(network,app_id,vebetter_round_id,claim_block_number)
VALUES ('mainnet',
'0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
125, 999);

-- Mimic the existing durable, wallet-scoped read receipt table.
CREATE TABLE public.invite_notification_history_reads(
  notification_id bigint PRIMARY KEY,
  inviter_wallet text NOT NULL,
  read_at timestamptz NOT NULL
);
