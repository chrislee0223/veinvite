import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [explorer, discoveryMigration, discoverRoute, controls] = await Promise.all([
  readFile(new URL('../src/components/PublicNetworkExplorer.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260923023000_make_network_default_public_readonly.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/network/public/discover/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/i18n/networkCanvasControlCopy.ts', import.meta.url), 'utf8'),
]);

test('Public Explore maintenance action really opens the wallet for guests', () => {
  assert.match(explorer, /useWalletLauncher/i);
  assert.match(explorer, /onClick=\{hasWallet \? onBack : openWallet\}/i);
  assert.match(explorer, /disabled=\{!hasWallet && isWalletActionPending\}/i);
});

test('Public canvas keeps read-only overlays simple and removes the legacy sibling pager', () => {
  assert.doesNotMatch(explorer, /openExplorer|explorerParent|publicSiblingExplorer|publicCluster/i);
  assert.match(explorer, /selected \? <aside className=\{\`publicInspector/i);
  assert.match(explorer, /searchOpen \? \(/i);
});

test('Public canvas expires and clears local path state when the saved target no longer exists', () => {
  assert.match(explorer, /PUBLIC_SESSION_TTL_MS\s*=\s*30 \* 60_000/i);
  assert.match(explorer, /savedAt:\s*Date\.now\(\)/i);
  assert.match(explorer, /Date\.now\(\) - parsed\.savedAt > PUBLIC_SESSION_TTL_MS/i);
  assert.match(explorer, /code === 'FOCUS_NOT_FOUND'[\s\S]*clearSavedState\(root\)/i);
});

test('Public canvas motion controls respect accessibility settings without a separate pager', () => {
  assert.match(explorer, /aria-label=\{c\.centerNetwork\}/i);
  assert.match(explorer, /aria-label=\{c\.zoomIn\}/i);
  assert.match(explorer, /aria-label=\{c\.zoomOut\}/i);
  assert.match(explorer, /prefers-reduced-motion:reduce/i);
  assert.match(explorer, /focus-visible/i);
  assert.doesNotMatch(explorer, /aria-label=\{c\.previous\}|aria-label=\{c\.next\}/i);
  assert.match(controls, /centerNetwork:\s*string/i);
  assert.match(controls, /zoomIn:\s*string/i);
  assert.match(controls, /zoomOut:\s*string/i);
});

test('Explore discovery uses verified referral roots without per-wallet visibility preferences', () => {
  assert.match(discoveryMigration, /exists \([\s\S]*qualified_referral_network_edges/i);
  assert.doesNotMatch(discoveryMigration, /network_public_profiles|public_enabled|discoverable/i);
  assert.match(discoveryMigration, /md5\([\s\S]*IYYY-IW/i);
  assert.match(discoveryMigration, /order by rotation_key asc, wallet_address asc/i);
  assert.doesNotMatch(discoveryMigration, /order by np\.updated_at desc/i);
});

test('Explore discovery API only returns the root wallet locator used by the UI', () => {
  assert.match(discoverRoute, /Do not expose unrelated metadata/i);
  assert.match(discoverRoute, /return typeof wallet === 'string' \? \[\{ wallet \}\] : \[\]/i);
  assert.doesNotMatch(discoverRoute, /return noStoreJson\(\{ networks: data \}/i);
});
