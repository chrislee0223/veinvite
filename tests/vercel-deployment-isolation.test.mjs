import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  PRODUCTION_PROJECT_ID,
  QA_PROJECT_ID,
  shouldBuildVercelProject,
} from '../scripts/vercel-ignore-build.mjs';

const root = resolve(import.meta.dirname, '..');
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));

test('production builds only from main, QA only from qa-*', () => {
  assert.equal(shouldBuildVercelProject(PRODUCTION_PROJECT_ID, 'main'), true);
  assert.equal(shouldBuildVercelProject(PRODUCTION_PROJECT_ID, 'qa-design'), false);
  assert.equal(shouldBuildVercelProject(PRODUCTION_PROJECT_ID, 'maintenance/cleanup'), false);
  assert.equal(shouldBuildVercelProject(QA_PROJECT_ID, 'main'), false);
  assert.equal(shouldBuildVercelProject(QA_PROJECT_ID, 'qa-design'), true);
  assert.equal(shouldBuildVercelProject(QA_PROJECT_ID, 'maintenance/cleanup'), false);
  assert.equal(shouldBuildVercelProject('unknown-project', 'main'), false);
  assert.equal(shouldBuildVercelProject('', 'main'), false);
});

test('Vercel deployment configuration also fails closed for maintenance branches', () => {
  const enabled = vercel.git?.deploymentEnabled;
  assert.equal(enabled?.['**'], false);
  assert.equal(enabled?.main, true);
  assert.equal(enabled?.['qa-*'], true);
  assert.equal(vercel.ignoreCommand, 'node scripts/vercel-ignore-build.mjs');
});
