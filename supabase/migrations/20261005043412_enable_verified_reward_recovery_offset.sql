begin;

-- Final activation after source parity, planning-authority alignment,
-- full regression CI, Production READY deployment and clean pre-activation
-- reward invariants.
update public.reward_runtime_config
set reward_recovery_enabled = true
where id = 1;

commit;
