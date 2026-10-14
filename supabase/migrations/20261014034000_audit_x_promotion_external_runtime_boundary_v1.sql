drop trigger if exists reward_x_promotion_runtime_audit
  on public.reward_runtime_config;

create trigger reward_x_promotion_runtime_audit
after update of
  reward_x_promotion_shadow_enabled,
  reward_x_promotion_enabled,
  reward_x_promotion_payout_enabled,
  reward_x_promotion_policy_version,
  reward_x_promotion_shadow_started_at,
  reward_x_promotion_live_started_at,
  reward_x_promotion_external_verification_ready,
  reward_x_promotion_external_verification_started_at
on public.reward_runtime_config
for each row
execute function public.log_reward_x_promotion_runtime_event();

comment on trigger reward_x_promotion_runtime_audit
  on public.reward_runtime_config is
  'Audits all X promotion runtime boundary changes, including external verification readiness.';
