-- Keep the Network surface fail-closed during the first Production rollout.
-- The operator explicitly enables it only after the application deployment,
-- authenticated smoke test, and advisor checks are complete.
update public.network_runtime_config
set
  enabled = false,
  note = 'Staged OFF for explicit post-deploy Network rollout',
  updated_at = now()
where id = 1;
