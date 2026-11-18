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
  assert.match(telemetry, /emitted\.has\(dedupeKey\)/);
  assert.match(telemetry, /catch \{/);
});

test('record only completed changes, not camera movement or canceled drags', () => {
  const pointerMove = network.split('const onPointerMoveCapture =')[1].split('const onPointerEndCapture =')[0];
  assert.doesNotMatch(pointerMove, /reportNetworkInteractionOnce/);
  const drop = network.split('const finishWorkspaceDrop =')[1].split('const onPointerDownCapture =')[0];
  assert.match(drop, /event\.type !== 'pointerup'/);
  assert.match(drop, /reportCompletedNetworkDrag/);
  assert.match(telemetry, /JSON\.stringify\(before\) === JSON\.stringify\(after\)/);
  assert.match(drop, /reportNetworkInteractionOnce\('network_group_modified', wallet\)/);
  const end = network.split('const onPointerEndCapture =')[1].split('const onWheel =')[0];
  assert.match(end, /event\.type === 'pointerup'/);
  assert.match(end, /reportNetworkInteractionOnce/);
  assert.match(network, /reportNetworkInteractionOnce\('network_group_modified', wallet\)/);
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

test('wallet switching, authentication renewal and daily rollover never mask a new user', () => {
  assert.match(telemetry, /activeWallet: string \| null/);
  assert.match(telemetry, /activeWallet\.trim\(\)\.toLowerCase\(\)/);
  assert.match(telemetry, /\$\{activeWallet\.trim\(\)\.toLowerCase\(\)\}\|\$\{eventName\}/);
  assert.match(telemetry, /if \(day !== recordedDay\)/);
  assert.match(telemetry, /USAGE_ANALYTICS_WALLET_AUTH_EVENT/);
  assert.match(telemetry, /USAGE_ANALYTICS_PREFERENCE_EVENT/);
  assert.match(telemetry, /emitted\.clear\(\)/);
  assert.match(network, /reportCompletedNetworkDrag\(drag\.kind, drag\.originalWorkspace, draftWorkspaceRef\.current, wallet\)/);
  const emitted = new Set();
  let day = '';
  const report = (wallet, currentDay, name) => {
    if (currentDay !== day) { emitted.clear(); day = currentDay; }
    const key = wallet.toLowerCase() + '|' + name;
    if (emitted.has(key)) return false;
    emitted.add(key);
    return true;
  };
  assert.equal(report('0xAa', '2026-11-18', 'network_node_repositioned'), true);
  assert.equal(report('0xAa', '2026-11-18', 'network_node_repositioned'), false);
  assert.equal(report('0xBb', '2026-11-18', 'network_node_repositioned'), true);
  assert.equal(report('0xBb', '2026-11-18', 'network_group_modified'), true);
  assert.equal(report('0xAa', '2026-11-19', 'network_node_repositioned'), true);
});
