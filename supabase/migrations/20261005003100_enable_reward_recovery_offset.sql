begin;

update public.reward_runtime_config
set reward_recovery_enabled = true
where id = 1;

commit;
