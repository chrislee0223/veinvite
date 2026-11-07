import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRunBrowserQa } from '../scripts/should-run-browser-qa.mjs';

test('main pushes with proven backend-only changes skip expensive browser QA', () => {
  for (const changedPaths of [
    ['src/app/api/rewards/claims/route.ts'],
    ['supabase/migrations/20261106031115_example.sql'],
    ['src/lib/rewards/automaticRewardPayoutWithMnemonic.ts', 'tests/reward-claim-durable-finality.test.mjs'],
    ['docs/production-notes.md', 'src/app/api/cron/reconcile/route.ts', 'tests/sql/example.sql'],
  ]) {
    assert.equal(shouldRunBrowserQa({
      eventName: 'push',
      ref: 'refs/heads/main',
      changedPaths,
    }), false, changedPaths.join(', '));
  }
});

test('main UI, dependency, workflow, and shared reward client changes run full QA', () => {
  for (const path of [
    'src/components/HomeClient.tsx',
    'src/lib/i18n/networkExperienceCopy.ts',
    'src/lib/rewards/rewardClaimClient.ts',
    'src/lib/rewards/publicRewardForecastSeed.ts',
    'src/lib/sybil/v2/pipeline.ts',
    'next.config.mjs',
    'package.json',
    'playwright.config.ts',
    'src/app/layout.tsx',
    '.github/workflows/ci.yml',
    'scripts/should-run-browser-qa.mjs',
    'tests/ci-browser-scope.test.mjs',
  ]) {
    assert.equal(shouldRunBrowserQa({
      eventName: 'push',
      ref: 'refs/heads/main',
      changedPaths: ['src/app/api/rewards/claims/route.ts', path],
    }), true, path);
  }
});

test('missing diff data and manual full QA fail safe', () => {
  for (const changedPaths of [[], null, undefined]) {
    assert.equal(shouldRunBrowserQa({
      eventName: 'push',
      ref: 'refs/heads/main',
      changedPaths,
    }), true);
  }
  assert.equal(shouldRunBrowserQa({
    eventName: 'workflow_dispatch',
    ref: 'refs/heads/main',
    changedPaths: ['src/app/api/rewards/claims/route.ts'],
  }), true);
});

test('a mixed main push never skips browser QA', () => {
  assert.equal(shouldRunBrowserQa({
    eventName: 'push',
    ref: 'refs/heads/main',
    changedPaths: [
      'supabase/migrations/20261106031115_example.sql',
      'src/components/HomeClient.tsx',
    ],
  }), true);
});

test('unknown or empty change sets fail safe to browser QA', () => {
  assert.equal(
    shouldRunBrowserQa({
      eventName: 'pull_request',
      ref: 'refs/pull/1/merge',
      changedPaths: [],
    }),
    true,
  );
});

test('backend-only Sybil, reward, API, migration, docs, scripts, and source-test changes can skip PR browser QA', () => {
  assert.equal(
    shouldRunBrowserQa({
      eventName: 'pull_request',
      ref: 'refs/pull/1/merge',
      changedPaths: [
        'src/lib/sybil/v2/pipeline.ts',
        'src/lib/rewards/automaticRewardPayout.ts',
        'src/app/api/rewards/claims/route.ts',
        'supabase/migrations/20260929194500_example.sql',
        'tests/reward-sybil-example.test.mjs',
        'scripts/check-example.mjs',
        'docs/example.md',
      ],
    }),
    false,
  );
});

test('any client or UI change keeps browser QA enabled', () => {
  for (const path of [
    'src/components/AppNetwork.tsx',
    'src/lib/networkDataClient.ts',
    'src/lib/i18n/networkExperienceCopy.ts',
    'src/components/HomeClient.tsx',
    'package.json',
    'next.config.mjs',
    'public/logo.svg',
    'tests/playwright/visual-i18n.spec.ts',
  ]) {
    assert.equal(
      shouldRunBrowserQa({
        eventName: 'pull_request',
        ref: 'refs/pull/1/merge',
        changedPaths: [path],
      }),
      true,
      path,
    );
  }
});

test('CI-only PRs use fast contract gates, while main rechecks the full browser suite', () => {
  for (const path of [
    '.github/workflows/ci.yml',
    'scripts/should-run-browser-qa.mjs',
    'tests/ci-browser-scope.test.mjs',
  ]) {
    assert.equal(shouldRunBrowserQa({
      eventName: 'pull_request',
      ref: 'refs/pull/99/merge',
      changedPaths: ['docs/readme.md', path],
    }), false, path);
    assert.equal(shouldRunBrowserQa({
      eventName: 'push',
      ref: 'refs/heads/main',
      changedPaths: ['docs/readme.md', path],
    }), true, path);
  }
  assert.equal(shouldRunBrowserQa({
    eventName: 'pull_request',
    ref: 'refs/pull/99/merge',
    changedPaths: ['playwright.config.ts'],
  }), true);
});

test('mixed backend and client changes run browser QA', () => {
  assert.equal(
    shouldRunBrowserQa({
      eventName: 'pull_request',
      ref: 'refs/pull/1/merge',
      changedPaths: [
        'src/lib/sybil/v2/pipeline.ts',
        'src/components/AppNetwork.tsx',
      ],
    }),
    true,
  );
});
