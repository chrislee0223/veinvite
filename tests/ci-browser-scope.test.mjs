import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRunBrowserQa } from '../scripts/should-run-browser-qa.mjs';

test('main pushes always run browser QA', () => {
  assert.equal(
    shouldRunBrowserQa({
      eventName: 'push',
      ref: 'refs/heads/main',
      changedPaths: ['src/lib/sybil/v2/pipeline.ts'],
    }),
    true,
  );
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
