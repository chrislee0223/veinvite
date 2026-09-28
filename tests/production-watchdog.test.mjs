import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [healthRoute, watchdogWorkflow, postDeploySmokeWorkflow] = await Promise.all([
  readFile(new URL('../src/app/api/health/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/production-watchdog.yml', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/production-post-deploy-smoke.yml', import.meta.url), 'utf8'),
]);

test('public health exposes only coarse operational freshness for the two daily jobs', () => {
  assert.match(healthRoute, /OPERATIONAL_HEARTBEAT_MAX_AGE_MS\s*=\s*\n?\s*36 \* 60 \* 60 \* 1000/);
  assert.match(healthRoute, /\.from\('operator_monitor_snapshots'\)/);
  assert.match(healthRoute, /\.select\('captured_at'\)/);
  assert.match(healthRoute, /\.from\('veinvite_daily_funnel_rollups'\)/);
  assert.match(healthRoute, /\.select\('finalized_at'\)/);
  assert.match(healthRoute, /reconcileFresh: isFreshHeartbeat/);
  assert.match(healthRoute, /analyticsFresh: isFreshHeartbeat/);
  assert.doesNotMatch(healthRoute, /reward_runtime_config/);
  assert.doesNotMatch(healthRoute, /reward_queue_entries/);
});

test('GitHub independently checks the public Production endpoint every six hours', () => {
  assert.match(watchdogWorkflow, /cron: '17 \*\/6 \* \* \*'/);
  assert.match(watchdogWorkflow, /https:\/\/veinvite\.vercel\.app\/api\/health/);
  assert.match(watchdogWorkflow, /curl[\s\S]*--fail[\s\S]*--max-time 20[\s\S]*--retry 2/);
  assert.match(watchdogWorkflow, /health\.operations\?\.reconcileFresh !== true/);
  assert.match(watchdogWorkflow, /health\.operations\?\.analyticsFresh !== true/);
  assert.match(watchdogWorkflow, /health\.deployment\?\.environment !== 'production'/);
  assert.match(watchdogWorkflow, /health\.network !== 'mainnet'/);
  assert.doesNotMatch(watchdogWorkflow, /CRON_SECRET/);
  assert.doesNotMatch(watchdogWorkflow, /vercel\/api\/cron/);
});


test('successful main CI is followed by an exact-commit Production smoke check', () => {
  assert.match(postDeploySmokeWorkflow, /workflow_run:/);
  assert.match(postDeploySmokeWorkflow, /workflows:\s*\n\s*- VeInvite CI/);
  assert.match(postDeploySmokeWorkflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(postDeploySmokeWorkflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(postDeploySmokeWorkflow, /EXPECTED_GIT_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(postDeploySmokeWorkflow, /https:\/\/veinvite\.vercel\.app\/api\/health/);
  assert.match(postDeploySmokeWorkflow, /for attempt in \$\(seq 1 20\)/);
  assert.match(postDeploySmokeWorkflow, /deployedSha === expectedSha/);
  assert.match(postDeploySmokeWorkflow, /health\.database === 'ready'/);
  assert.match(postDeploySmokeWorkflow, /health\.network === 'mainnet'/);
  assert.match(postDeploySmokeWorkflow, /health\.deployment\?\.environment === 'production'/);
  assert.match(postDeploySmokeWorkflow, /health\.operations\?\.reconcileFresh === true/);
  assert.match(postDeploySmokeWorkflow, /health\.operations\?\.analyticsFresh === true/);
});
