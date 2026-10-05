begin;

-- Keep recovery offset execution disabled while the Production-only hardening
-- migrations are reconciled into source control and final regression checks run.
-- A separate verified activation migration must explicitly re-enable it.
update public.reward_runtime_config
set reward_recovery_enabled = false
where id = 1;

commit;
