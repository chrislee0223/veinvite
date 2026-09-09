import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [route, runtime, network, controls, migration, rollout] = await Promise.all([
  readFile(new URL('../src/app/api/network/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/networkRuntimeServer.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AppNetwork.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/i18n/networkCanvasControlCopy.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260909040000_harden_network_runtime_and_round_context.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260909040500_stage_network_runtime_disabled_for_rollout.sql', import.meta.url), 'utf8'),
]);

test('Network round metrics come from the reviewed chain resolver, are bounded, and fail soft when unavailable', () => {
  assert.match(route, /readVeBetterRoundWindow/i);
  assert.match(route, /ROUND_CACHE_MS\s*=\s*60_000/i);
  assert.match(route, /ROUND_RESOLVE_TIMEOUT_MS\s*=\s*2_500/i);
  assert.match(route, /withTimeout\([\s\S]*readVeBetterRoundWindow\(\)[\s\S]*ROUND_RESOLVE_TIMEOUT_MS/i);
  assert.match(route, /read_referral_network_focus_v2/i);
  assert.match(route, /p_round_id:\s*round\?\.id\s*\?\?\s*null/i);
  assert.match(route, /p_round_start_at:\s*round\?\.startAt\s*\?\?\s*null/i);
  assert.doesNotMatch(route, /operator_latest_round_growth_report_snapshots/i);
  assert.match(network, /rootData\.summary\.thisRound\s*===\s*null[\s\S]*'—'/i);
});

test('Network runtime switch fails closed before chain and recursive graph work', () => {
  assert.match(migration, /create table if not exists public\.network_runtime_config/i);
  assert.match(migration, /coalesce\(\([\s\S]*select c\.enabled[\s\S]*\), false\)/i);
  assert.match(migration, /NETWORK_DISABLED/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.network_runtime_config from public, anon, authenticated/i);
  assert.match(migration, /to service_role/i);
  assert.match(rollout, /update public\.network_runtime_config/i);
  assert.match(rollout, /enabled\s*=\s*false/i);
  assert.match(runtime, /export async function canUseNetworkSurface/i);
  assert.match(runtime, /return false/i);
  const switchCheck = route.indexOf("if (!(await canUseNetworkSurface('my', rootWallet)))");
  const roundRead = route.indexOf('const round = await readCurrentRoundContext();');
  const graphRead = route.indexOf(".rpc(\n        'read_referral_network_focus_v2'");
  assert.ok(switchCheck >= 0);
  assert.ok(roundRead > switchCheck);
  assert.ok(graphRead > roundRead);
  assert.match(route, /'NETWORK_DISABLED'/i);
  assert.match(route, /503/i);
});

test('Network recursive reads are time-bounded and return machine-readable failure codes', () => {
  assert.match(route, /NETWORK_RPC_TIMEOUT_MS\s*=\s*5_000/i);
  assert.match(route, /AbortController\(\)/i);
  assert.match(route, /\.abortSignal\(rpcController\.signal\)/i);
  assert.match(route, /'NETWORK_TIMEOUT'/i);
  assert.match(route, /type NetworkApiErrorCode/i);
  assert.match(route, /function networkError/i);
});

test('branch navigation actively cancels stale work instead of only ignoring late responses', () => {
  assert.match(network, /branchRequestRef\s*=\s*useRef<AbortController \| null>/i);
  assert.match(network, /branchRequestRef\.current\?\.abort\(\)/i);
  assert.match(network, /const serial = cancelBranchRequest\(\)/i);
  assert.match(network, /controller\.signal\.aborted \|\| serial !== requestSerialRef\.current/i);
  assert.match(network, /cancelBranchRequest\(\);[\s\S]*setExplorerParent/i);
});

test('Network search has an independent request budget from branch navigation', () => {
  assert.match(route, /network_search_wallet/i);
  assert.match(route, /network_read_wallet/i);
  assert.match(route, /limit:\s*isSearch \? 24 : 90/i);
});

test('non-root branch Qualified totals include the focused member when qualified or rewarded', () => {
  assert.match(migration, /dr\.member_status in \('QUALIFIED', 'REWARDED'\) then 1 else 0 end/i);
  assert.match(network, /selectedData\?\.summary\.qualified \?\? selectedMember\?\.qualified/i);
});

test('Network canvas controls are localized for every supported locale and the graph is not mirrored', () => {
  const expectedLocales = [
    'en','ko','zh','hi','es','ja','it','tr','nl','de','fr','ar','bn','pt','ru','id','vi','zh-tw','sv','ro','ur','pcm','arz','mr','te','sw','ha','el',
  ];
  for (const locale of expectedLocales) {
    const pattern = locale === 'zh-tw'
      ? /'zh-tw':\s*\{/i
      : new RegExp(`\\n\\s*${locale}:\\s*\\{`, 'i');
    assert.match(controls, pattern, `missing Network canvas controls for ${locale}`);
  }
  assert.match(network, /NETWORK_CANVAS_CONTROL_COPY/i);
  assert.match(network, /<span>\{c\.you\}<\/span>/i);
  assert.match(network, /aria-label=\{isOpen \? c\.collapseBranch : c\.expandBranch\}/i);
  assert.match(network, /\{c\.networkBelow\}/i);
  assert.doesNotMatch(network, /direction:\s*rtl[^}]*\.world/i);
});

test('profile images do not forward the app referrer', () => {
  assert.match(network, /referrerPolicy="no-referrer"/i);
});
