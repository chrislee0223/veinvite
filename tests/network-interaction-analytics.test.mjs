import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const network = read('src/components/AppNetwork.tsx');
const telemetry = read('src/lib/networkUsageTelemetry.ts');
const contract = read('src/lib/productAnalytics.ts');
const api = read('src/app/api/analytics/event/route.ts');
const migration = read('supabase/migrations/20261117133813_add_anonymous_network_interaction_telemetry_v1.sql');
const ci = read('.github/workflows/ci.yml');

test('network events are allowlisted from client to database but contain no identifiers', () => {
  for (const name of ['network_node_repositioned', 'network_group_modified']) {
    for (const source of [telemetry, contract, api, migration]) {
      assert.ok(source.includes(name), name + ' missing from contract');
    }
  }
  assert.match(migration, /security invoker/);
  assert.doesNotMatch(telemetry, /walletAddress|rootWallet|coordinates|localStorage\.setItem/);
  assert.match(telemetry, /readUsageAnalyticsEnabled/);
  assert.match(telemetry, /const emitted = new Set/);
  assert.match(telemetry, /emitted\.has\(eventName\)/);
  assert.match(telemetry, /catch \{/);
});

test('record only completed changes, not camera movement or canceled drags', () => {
  const pointerMove = network.split('const onPointerMoveCapture =')[1].split('const onPointerEndCapture =')[0];
  assert.doesNotMatch(pointerMove, /reportNetworkInteractionOnce/);
  const drop = network.split('const finishWorkspaceDrop =')[1].split('const onPointerDownCapture =')[0];
  assert.match(drop, /event\.type !== 'pointerup'/);
  assert.match(drop, /JSON\.stringify\(draftWorkspaceRef\.current\) !== JSON\.stringify\(drag\.originalWorkspace\)/);
  assert.match(drop, /reportNetworkInteractionOnce\('network_group_modified'\)/);
  const end = network.split('const onPointerEndCapture =')[1].split('const onWheel =')[0];
  assert.match(end, /event\.type === 'pointerup'/);
  assert.match(end, /reportNetworkInteractionOnce/);
  assert.match(network, /reportNetworkInteractionOnce\('network_group_modified'\)/);
});

test('use the existing privacy-safe collection and keep autosave unmodified', () => {
  assert.match(telemetry, /reportProductAnalyticsEvent/);
  assert.match(api, /requestHasSameOrigin/);
  assert.match(api, /excludeAdminVisitor/);
  assert.match(ci, /tests\/network-interaction-analytics\.test\.mjs/);
  const autosave = read('src/hooks/useNetworkPublishedLayoutSync.ts');
  assert.match(autosave, /window\.localStorage\.setItem/);
  assert.doesNotMatch(autosave, /reportNetworkInteractionOnce/);
  assert.doesNotMatch(telemetry, /\bfetch\s*\(/);
});
