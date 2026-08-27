-- Cover the reward_queue_entries -> eligibility_check_events foreign key.
-- This is a performance-only index; it does not change reward eligibility or payout behavior.

begin;

create index if not exists reward_queue_entries_eligibility_check_id_idx
  on public.reward_queue_entries (eligibility_check_id);

commit;
