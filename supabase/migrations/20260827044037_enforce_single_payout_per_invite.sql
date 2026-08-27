alter table public.reward_payouts
  drop constraint if exists reward_payouts_invite_code_key,
  add constraint reward_payouts_invite_code_key unique (invite_code);
