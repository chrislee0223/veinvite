alter table public.reward_x_promotion_external_runtime_checks
  drop constraint if exists reward_x_promotion_external_runtime_checks_status_check,
  add constraint reward_x_promotion_external_runtime_checks_status_check
    check (
      status in (
        'READY',
        'POST_NOT_FOUND',
        'PAYOUT_SIGNER_NOT_READY',
        'X_API_NOT_CONFIGURED',
        'X_API_AUTH_FAILED',
        'X_API_RATE_LIMITED',
        'X_API_UNAVAILABLE',
        'X_API_RESPONSE_INVALID'
      )
    );

comment on constraint reward_x_promotion_external_runtime_checks_status_check
  on public.reward_x_promotion_external_runtime_checks is
  'External X promotion readiness must fail closed when either the payout signer runtime or X API runtime is unavailable.';
