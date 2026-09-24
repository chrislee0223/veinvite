import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [route, runtime, network, publicNetwork, identity, controls, exploreCopy, migration, rollout] = await Promise.all([
  readFile(new URL('../src/app/api/network/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/networkRuntimeServer.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AppNetwork.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PublicNetworkExplorer.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/NetworkWalletIdentity.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/i18n/networkCanvasControlCopy.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/i18n/networkExploreCopy.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260909040000_harden_network_runtime_and_round_context.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260909040500_stage_network_runtime_disabled_for_rollout.sql', import.meta.url), 'utf8'),
]);

test('Network round growth is fully retired from the runtime and compact toolbar', () => {
  assert.doesNotMatch(route, /readVeBetterRoundWindow|ROUND_CACHE_MS|ROUND_RESOLVE_TIMEOUT_MS|readCurrentRoundContext/i);
  assert.match(route, /read_referral_network_focus_v2/i);
  assert.match(route, /p_round_id:\s*null/i);
  assert.match(route, /p_round_start_at:\s*null/i);
  assert.match(route, /p_round_end_at:\s*null/i);
  assert.doesNotMatch(route, /operator_latest_round_growth_report_snapshots/i);
  const utilityStart = network.indexOf('className="networkUtilityRow"');
  const searchStart = network.indexOf('className="networkSearchRow"', utilityStart);
  const utility = network.slice(utilityStart, searchStart);
  assert.match(utility, /className="summaryTotal"/);
  assert.doesNotMatch(utility, /headerThisRound|t\.thisRound|className="growth"/);
  assert.doesNotMatch(network, /const headerThisRound|headerMetricsReady|metricsPending|selectedRound|thisRound/);
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
  const graphRead = route.indexOf(".rpc(\n        'read_referral_network_focus_v2'");
  assert.ok(switchCheck >= 0);
  assert.ok(graphRead > switchCheck);
  assert.doesNotMatch(route, /fastInitial|readCurrentRoundContext|readVeBetterRoundWindow/i);
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
  assert.match(network, /abortRef\s*=\s*useRef\(null as AbortController \| null\)|abortRef\s*=\s*useRef<AbortController \| null>\(null\)/i);
  assert.match(network, /abortRef\.current\?\.abort\(\)/i);
  assert.match(network, /const serial = cancelRequest\(\)/i);
  assert.match(network, /controller\.signal\.aborted \|\| serial !== requestSerialRef\.current/i);
  assert.match(network, /const moveToFocus = useCallback[\s\S]*const serial = cancelRequest\(\)[\s\S]*new AbortController\(\)/i);
});

test('Network search has an independent request budget from branch navigation', () => {
  assert.match(route, /network_search_wallet/i);
  assert.match(route, /network_read_wallet/i);
  assert.match(route, /limit:\s*isSearch \? 24 : 90/i);
  assert.match(network, /const controller = new AbortController\(\);[\s\S]*const timer = window\.setTimeout/i);
});

test('non-root branch Qualified totals include the focused member when qualified or rewarded', () => {
  assert.match(migration, /dr\.member_status in \('QUALIFIED', 'REWARDED'\) then 1 else 0 end/i);
  assert.match(network, /selectedData\?\.summary\.qualified \?\? selectedMember\?\.qualified/i);
});

test('Network canvas controls are localized for every supported locale and the graph is not mirrored', () => {
  const expectedLocales = [
    'en','ko','zh','hi','es','ja','it','tr','nl','de','fr','ar','bn','pt','ru','id','vi','zh-tw','sv','ro','ur','pcm','arz','mr','te','sw','ha','el','cs',
  ];
  for (const locale of expectedLocales) {
    const pattern = locale === 'zh-tw'
      ? /'zh-tw':\s*\{/i
      : new RegExp(`\\n\\s*${locale}:\\s*\\{`, 'i');
    assert.match(controls, pattern, `missing Network canvas controls for ${locale}`);
  }
  assert.match(network, /NETWORK_CANVAS_CONTROL_COPY/i);
  assert.match(network, /absoluteIndex === 0 \? c\.you : shortWallet\(item\)/i);
  assert.match(network, /<NetworkWalletIdentity[\s\S]*address=\{currentData\.focusWallet\}[\s\S]*root[\s\S]*showLabel=\{false\}/i);
  assert.doesNotMatch(network, /focusYouLabel/i);
  assert.match(network, /className="youControl"[\s\S]*aria-label=\{c\.you\}/i);
  assert.match(network, /\{c\.expandBranch\}/i);
  assert.match(network, /aria-label=\{c\.zoomIn\}/i);
  assert.match(network, /aria-label=\{c\.zoomOut\}/i);
  assert.doesNotMatch(network, /scaleX\(-1\)/i);
  assert.match(network, /className="groupsPanel"[^>]*dir=\{profileDirection\}/i);
  assert.match(network, /className="groupBuilder"[^>]*dir=\{profileDirection\}/i);
  assert.match(network, /profileDirection === 'rtl' \? '›' : '‹'/i);
  assert.doesNotMatch(network, /direction:\s*rtl[^}]*\.world/i);
});



test('Production Network uses grammar-safe count copy and logical RTL overlay geometry', () => {
  assert.doesNotMatch(network, /\{[^\n}]*\.length\}\s*\{w\.members\}/u);
  assert.doesNotMatch(network, /w\.members/u);
  assert.match(network, /u\.peopleCount\.replace\('\{count\}', String\(/u);
  assert.match(network, /u\.savedCount\.replace\('\{count\}', String\(/u);

  for (const source of [network, publicNetwork]) {
    assert.match(source, /\.breadcrumbs\{[^}]*inset-inline-start:8px/u);
    assert.match(source, /\.parentReturn\{[^}]*inset-inline-start:8px/u);
    assert.doesNotMatch(source, /\.breadcrumbs\{[^}]*\bleft:8px/u);
    assert.doesNotMatch(source, /\.parentReturn\{[^}]*\bleft:8px/u);
    assert.match(source, /profileDirection === 'rtl' \? '‹' : '›'/u);
  }

  assert.match(network, /\.compactControls\{[^}]*margin-inline-start:auto/u);
  assert.doesNotMatch(network, /\.compactControls\{[^}]*margin-left:auto/u);
  assert.match(publicNetwork, /\.domainSuggestionIdentity\{[^}]*text-align:start/u);
});

test('reviewed public Network terminology stays consistent in Korean and Hausa', () => {
  assert.match(exploreCopy, /ko:\s*\{[^\n]*visibleNetwork:'공개 네트워크'/u);
  assert.match(exploreCopy, /ha:\s*\{[^\n]*myNetwork:'Cibiyata'/u);
  assert.match(exploreCopy, /ha:\s*\{[^\n]*visibleNetwork:'Cibiyar sadarwar jama’a'/u);
  assert.doesNotMatch(
    exploreCopy,
    /ha:\s*\{[^\n]*(?:Public network|Network dina|Bincika network)/u,
  );
});

test('profile images do not forward the app referrer', () => {
  assert.match(network, /NetworkWalletIdentity/i);
  assert.match(identity, /referrerPolicy="no-referrer"/i);
});
