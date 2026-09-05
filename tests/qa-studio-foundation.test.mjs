import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  QA_SCENARIO_CONTRACT_VERSION,
  QA_SCENARIOS,
  QA_SURFACE_COVERAGE,
  QA_VIEWPORTS,
} from '../src/qa/scenarioRegistry.ts';
import { isQaStudioAllowed } from '../src/qa/serverGate.ts';

test('QA scenario ids are stable, unique, and fully specified', () => {
  assert.ok(QA_SCENARIOS.length > 0);

  const ids = QA_SCENARIOS.map((scenario) => scenario.id);
  assert.equal(new Set(ids).size, ids.length, 'scenario ids must be unique');

  for (const scenario of QA_SCENARIOS) {
    assert.match(scenario.id, /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
    assert.equal(scenario.contractVersion, QA_SCENARIO_CONTRACT_VERSION);
    assert.ok(scenario.expected.length > 0, `${scenario.id} needs expected results`);
    assert.ok(scenario.tags.length > 0, `${scenario.id} needs searchable tags`);
    assert.ok(QA_VIEWPORTS.some((viewport) => viewport.id === scenario.defaultViewport));
  }
});

test('covered QA surfaces point only to registered scenarios', () => {
  const registered = new Set(QA_SCENARIOS.map((scenario) => scenario.id));

  for (const surface of QA_SURFACE_COVERAGE) {
    if (surface.status === 'covered') {
      assert.ok(surface.scenarioIds.length > 0, `${surface.id} is covered but has no scenarios`);
    }

    for (const scenarioId of surface.scenarioIds) {
      assert.ok(registered.has(scenarioId), `${surface.id} references missing scenario ${scenarioId}`);
    }
  }
});

test('QA Studio fails closed in Production', () => {
  const previousVercelEnv = process.env.VERCEL_ENV;
  const previousNodeEnv = process.env.NODE_ENV;

  try {
    process.env.VERCEL_ENV = 'production';
    process.env.NODE_ENV = 'development';
    assert.equal(isQaStudioAllowed(), false);

    process.env.VERCEL_ENV = 'preview';
    process.env.NODE_ENV = 'production';
    assert.equal(isQaStudioAllowed(), true);
  } finally {
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;

    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('QA renderer reuses production components and contains no network fetch', async () => {
  const source = await readFile(new URL('../src/components/qa/QAScenarioRenderer.tsx', import.meta.url), 'utf8');

  assert.match(source, /InviteLandingV2/);
  assert.match(source, /InviteGuideContent/);
  assert.match(source, /AppGuide/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});

test('both QA routes apply the server-side environment gate', async () => {
  const [studioPage, renderPage] = await Promise.all([
    readFile(new URL('../src/app/qa/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/qa/render/page.tsx', import.meta.url), 'utf8'),
  ]);

  for (const source of [studioPage, renderPage]) {
    assert.match(source, /isQaStudioAllowed\(\)/);
    assert.match(source, /notFound\(\)/);
  }
});
