import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [explorer, discoveryMigration, controls] = await Promise.all([
  readFile(new URL('../src/components/PublicNetworkExplorer.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260909064500_stabilize_public_network_discovery.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/i18n/networkCanvasControlCopy.ts', import.meta.url), 'utf8'),
]);

test('Public Explore maintenance action really opens the wallet for guests', () => {
  assert.match(explorer, /useWalletLauncher/i);
  assert.match(explorer, /onClick=\{hasWallet \? onBack : openWallet\}/i);
  assert.match(explorer, /disabled=\{!hasWallet && isWalletActionPending\}/i);
});

test('Public canvas keeps mobile overlays mutually exclusive', () => {
  assert.match(explorer, /const openExplorer = useCallback\([\s\S]*setSelected\(null\);[\s\S]*setExplorerParent\(parentWallet\)/i);
  assert.match(explorer, /selected && selected !== root && !explorerParent/i);
});

test('Public canvas expires and clears local path state when visibility disappears', () => {
  assert.match(explorer, /PUBLIC_SESSION_TTL_MS\s*=\s*30 \* 60_000/i);
  assert.match(explorer, /savedAt:\s*Date\.now\(\)/i);
  assert.match(explorer, /Date\.now\(\) - parsed\.savedAt > PUBLIC_SESSION_TTL_MS/i);
  assert.match(explorer, /code === 'NETWORK_PRIVATE' \|\| code === 'FOCUS_NOT_PUBLIC'[\s\S]*clearSavedState\(root\)/i);
});

test('Public canvas pager and motion controls respect accessibility settings', () => {
  assert.match(explorer, /aria-label=\{c\.previous\}/i);
  assert.match(explorer, /aria-label=\{c\.next\}/i);
  assert.match(explorer, /prefers-reduced-motion:reduce/i);
  assert.match(explorer, /focus-visible/i);
  assert.match(controls, /previous:\s*string/i);
  assert.match(controls, /next:\s*string/i);
});

test('Explore discovery excludes empty public roots and cannot be bumped by toggling visibility', () => {
  assert.match(discoveryMigration, /exists \([\s\S]*qualified_referral_network_edges[\s\S]*child_profile\.public_enabled is true/i);
  assert.match(discoveryMigration, /md5\([\s\S]*IYYY-IW/i);
  assert.match(discoveryMigration, /order by rotation_key asc, wallet_address asc/i);
  assert.doesNotMatch(discoveryMigration, /order by np\.updated_at desc/i);
});
