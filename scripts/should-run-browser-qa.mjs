const BACKEND_ONLY_PREFIXES = Object.freeze([
  '.github/',
  'docs/',
  'scripts/',
  'src/app/api/',
  'src/lib/rewards/',
  'src/lib/sybil/',
  'supabase/',
]);

// Production pushes skip the slow browser suite only when every changed path
// is demonstrably backend/data/test-only. Unlike the PR classifier below, this
// allowlist intentionally does NOT include all scripts, GitHub workflows, or
// shared reward/client modules. Unknown or newly introduced paths fail closed.
const MAIN_SAFE_PREFIXES = Object.freeze([
  'docs/',
  'supabase/migrations/',
  'src/app/api/',
  'tests/sql/',
]);
const MAIN_SAFE_REWARD_FILES = new Set([
  'src/lib/rewards/automaticRewardPayout.ts',
  'src/lib/rewards/automaticRewardPayoutWithMnemonic.ts',
  'src/lib/rewards/claimPayoutContinuationQueue.ts',
  'src/lib/rewards/immediateClaimPayout.ts',
  'src/lib/rewards/submittedPayoutRecovery.ts',
  'src/lib/rewards/rewardBoostReserveScheduler.ts',
  'src/lib/rewards/rewardRecoveryMaintenance.ts',
  'src/lib/rewards/rewardReservationRecovery.ts',
  'src/lib/rewards/rewardXPromotionPayoutExecutor.ts',
  'src/lib/rewards/rewardXPromotionPayoutRuntime.ts',
]);

function isProvenMainBackendOnlyPath(path) {
  // Changes to the test-selection contract must never exempt themselves.
  if (path === 'tests/ci-browser-scope.test.mjs') return false;
  return (
    MAIN_SAFE_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    MAIN_SAFE_REWARD_FILES.has(path) ||
    /^tests\/[^/]+\.test\.mjs$/.test(path) ||
    path === 'README.md'
  );
}

function isBackendOnlyPath(path) {
  if (BACKEND_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return true;
  }

  if (path.startsWith('tests/') && !path.startsWith('tests/playwright/')) {
    return true;
  }

  return false;
}

export function shouldRunBrowserQa({
  eventName,
  ref,
  changedPaths,
}) {
  if (!Array.isArray(changedPaths) || changedPaths.length === 0) {
    // Missing, shallow, force-pushed or ambiguous diffs always run full QA.
    return true;
  }

  if (eventName === 'push' && ref === 'refs/heads/main') {
    return changedPaths.some((path) => !isProvenMainBackendOnlyPath(path));
  }

  // Manually requested verification always runs the full browser suite.
  if (eventName === 'workflow_dispatch') {
    return true;
  }

  // Keep the existing fast PR path, but changes to the browser/CI scope policy
  // itself must be covered by the full suite.
  if (changedPaths.some((path) =>
    path === 'playwright.config.ts' ||
    path === 'scripts/should-run-browser-qa.mjs' ||
    path === '.github/workflows/ci.yml' ||
    path === 'tests/ci-browser-scope.test.mjs'
  )) {
    return true;
  }

  return changedPaths.some((path) => !isBackendOnlyPath(path));
}

function readChangedPathsFromEnvironment() {
  const raw = process.env.CHANGED_PATHS ?? '';
  return raw
    .split('\n')
    .map((path) => path.trim())
    .filter(Boolean);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = shouldRunBrowserQa({
    eventName: process.env.GITHUB_EVENT_NAME ?? '',
    ref: process.env.GITHUB_REF ?? '',
    changedPaths: readChangedPathsFromEnvironment(),
  });

  process.stdout.write(result ? 'true' : 'false');
}
