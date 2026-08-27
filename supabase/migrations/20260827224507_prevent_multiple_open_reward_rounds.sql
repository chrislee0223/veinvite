-- Prevent the operator workflow from reserving more than one open reward
-- round for the same VeBetterDAO network/app allocation at a time.
-- This is accounting-only hardening and does not transfer B3TR.

create unique index if not exists reward_rounds_one_open_per_network_app_idx
on public.reward_rounds(network, app_id)
where status in ('CREATED','PAYING');
