import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hub = readFileSync(
  new URL('../src/components/PublicLeaderboardHub.tsx', import.meta.url),
  'utf8',
);
const leaderboard = readFileSync(
  new URL('../src/components/InviterLeaderboard.tsx', import.meta.url),
  'utf8',
);

test('public leaderboard paints independently from current-wallet personalization', () => {
  assert.match(hub, /const initialPublic = getCachedPublicLeaderboard\(null\)/);
  assert.match(hub, /loadPublicLeaderboard\(null\)/);
  assert.match(hub, /confirmed: false/);
  assert.match(hub, /setPublicState\(\{ data, confirmed: true, failed: false \}\)/);
});

test('wallet already present in public top 100 resolves locally without a private request', () => {
  assert.match(
    hub,
    /const publicMatch = publicData\.leaders\.find\([\s\S]*entry\.walletAddress\.toLowerCase\(\) === walletKey/,
  );
  assert.match(
    hub,
    /if \(publicMatch\) \{[\s\S]*status: 'resolved'[\s\S]*isCurrentWallet: true/,
  );
});

test('absence from a non-full public ranking proves unranked without private loading', () => {
  assert.match(
    hub,
    /if \(publicData\.leaders\.length < PUBLIC_RANK_LIMIT\) \{[\s\S]*status: 'resolved'[\s\S]*currentUser: null/,
  );
});

test('only a full top 100 may trigger the private current-wallet lookup', () => {
  const privateLookupIndex = hub.indexOf('void loadPublicLeaderboard(walletKey)');
  const nonFullGuardIndex = hub.indexOf(
    'if (publicData.leaders.length < PUBLIC_RANK_LIMIT)',
  );
  assert.ok(nonFullGuardIndex >= 0);
  assert.ok(privateLookupIndex > nonFullGuardIndex);
});

test('private response never replaces the public ranking snapshot', () => {
  assert.match(hub, /sameLeaderboardSnapshot\(publicData, personalizedData\)/);
  assert.match(hub, /const currentUser = personalizedData\.currentUser/);
  assert.doesNotMatch(hub, /setPublicState\(\{\s*data: personalizedData/);
  assert.match(
    hub,
    /currentUser && currentUser\.rank <= PUBLIC_RANK_LIMIT[\s\S]*refreshPublicSnapshot\(\)/,
  );
});

test('pending or unavailable personalization cannot fabricate a rank-zero current user', () => {
  assert.match(
    hub,
    /const displayWallet =[\s\S]*personalizationPending \|\| personalizationUnavailable[\s\S]*\? null[\s\S]*: wallet/,
  );
  assert.match(hub, /rankContextPending=\{/);
  assert.match(hub, /personalizationPending \|\| personalizationUnavailable/);
  assert.doesNotMatch(hub, /\.leaderboardHub\.personalizationPending \.rankContextNote \{\s*display:none/);
  assert.match(leaderboard, /const rankContextMessage = rankContextPending\s*\? null/);
  assert.match(leaderboard, /data-rank-context-pending=\{rankContextPending \? 'true'/);
  assert.match(leaderboard, /aria-hidden=\{rankContextPending \? true/);
  assert.match(leaderboard, /rankContextNote\[data-rank-context-pending='true'\][\s\S]*visibility:hidden/);
});


test('current-wallet row is reserved from first public paint whenever the wallet is absent', () => {
  assert.match(
    hub,
    /const currentWalletInDisplayedRanking = Boolean\([\s\S]*publicData\?\.leaders\.some/,
  );
  assert.match(
    hub,
    /const pendingCurrentWallet =[\s\S]*publicData[\s\S]*!currentWalletInDisplayedRanking[\s\S]*personalizationPending \|\| personalizationUnavailable[\s\S]*\? wallet[\s\S]*: null/,
  );
  assert.doesNotMatch(
    hub,
    /pendingCurrentWallet[\s\S]{0,500}publicData\.leaders\.length >= PUBLIC_RANK_LIMIT/,
  );
  assert.match(
    hub,
    /pendingCurrentWallet=\{pendingCurrentWallet\}/,
  );
});

test('personalization failure stays explicit and retryable instead of silently freezing dashes', () => {
  assert.match(
    hub,
    /const personalizationUnavailable = Boolean\([\s\S]*status === 'unavailable'/,
  );
  assert.match(
    hub,
    /const retryPersonalization = useCallback\([\s\S]*status: 'pending'[\s\S]*setPersonalizationRetryKey/,
  );
  assert.match(
    hub,
    /personalizationUnavailable \? \([\s\S]*className="personalizationInlineError"[\s\S]*onClick=\{retryPersonalization\}/,
  );
});

test('pending current-wallet row keeps geometry without fabricating rank or reward values', () => {
  assert.match(
    leaderboard,
    /pendingCurrentWallet\?: string \| null/,
  );
  assert.match(
    leaderboard,
    /className="rankRow compact current trailingCurrent pendingCurrent"[\s\S]*data-current-wallet-pending="true"/,
  );
  assert.match(
    leaderboard,
    /<WalletIdentity address=\{pendingCurrentWallet\} eager \/>/,
  );
  assert.match(
    leaderboard,
    /trailingCurrentUser \|\| showPendingCurrentUser[\s\S]*renderPendingCurrentRow\(\)/,
  );
  assert.doesNotMatch(
    leaderboard,
    /pendingCurrentWallet[\s\S]{0,500}completedReferrals:\s*0/,
  );
});


test('ranking frame stays mounted before the public response instead of swapping entire cards', () => {
  assert.doesNotMatch(hub, /if \(!displayData\) \{\s*return <InviterLeaderboard/);
  assert.match(hub, /data-public-leaderboard-pending=\{!displayData \? 'true' : undefined\}/);
  assert.match(hub, /className="unifiedRankingCard"/);
  assert.match(hub, /className="rankingTabs"/);
  assert.match(hub, /className="inviterInside"/);
  assert.match(hub, /surface="ranking"/);
  assert.match(hub, /surface="impact"/);
  assert.match(hub, /disabled=\{!displayData\}/);
});

test('Hub owns the sole public ranking request while both surfaces paint skeletons', () => {
  assert.match(hub, /void loadPublicLeaderboard\(null\)/);
  assert.match(hub, /managedByHub\s+surface="impact"/);
  assert.match(hub, /managedByHub\s+surface="ranking"/);
  assert.match(leaderboard, /managedByHub\?: boolean/);
  assert.match(leaderboard, /if \(managedByHub\) return;/);
  assert.match(leaderboard, /const data = managedByHub\s*\? previewData \?\? null/);
  assert.match(leaderboard, /const loading = managedByHub\s*\? !previewData/);
  assert.match(leaderboard, /\{surface !== 'ranking' \? <section\s+className="impactCard"/);
  assert.match(leaderboard, /\{surface !== 'impact' \? <section className="rankingCard"/);
  assert.match(leaderboard, /RANK_SLOTS\.map\(\(rank\) => renderSlot\(rank\)\)/);
});

test('wallet placeholder exists before public data and cannot invent a score', () => {
  assert.match(hub, /const pendingCurrentWallet =\s*walletKey &&\s*\(!publicData \|\| !currentWalletInDisplayedRanking\)/);
  assert.match(hub, /personalizationPending \|\| personalizationUnavailable/);
  assert.match(leaderboard, /data-current-wallet-pending="true"/);
  assert.match(leaderboard, /className="rankRow compact current trailingCurrent pendingCurrent"/);
  assert.match(leaderboard, /<strong className="rankValue">—<\/strong>/);
  assert.match(hub, /const displayWallet =[\s\S]*?personalizationPending \|\| personalizationUnavailable[\s\S]*?\? null/);
});

test('a failed initial public request offers an explicit retry without removing the card', () => {
  assert.match(hub, /const retryPublicLeaderboard = useCallback/);
  assert.match(hub, /publicState\.failed && !displayData \? \(/);
  assert.match(hub, /onClick=\{retryPublicLeaderboard\}/);
  assert.match(hub, /personalizationUnavailable \? \(/);
});


test('mobile ranking tab panels use their own natural height without a permanent empty footer', () => {
  assert.doesNotMatch(hub, /rankingPanelMinHeight|setRankingPanelMinHeight|preservePanelHeight/);
  assert.doesNotMatch(hub, /ref=\{rankingPanelRef\}|style=\{\{ minHeight:/);
  assert.match(hub, /className="inviterInside"/);
  assert.match(hub, /className="countryPanel"/);
  assert.match(hub, /const openCountry = useCallback\(\(\) => \{\s*setRankingView\('country'\)/);
  assert.match(hub, /const openInviter = useCallback\(\(\) => \{\s*setRankingView\('inviter'\)/);
  assert.match(hub, /overflow-anchor:none/);
  assert.doesNotMatch(hub, /window\.scrollTo\(/);
});

test('cold leaderboard shows five real-sized skeleton rows, not 100 initial DOM nodes', () => {
  assert.match(leaderboard, /data\s*\?\s*RANK_SLOTS\.map\(\(rank\) => renderSlot\(rank\)\)/);
  assert.match(leaderboard, /RANK_SLOTS\.filter\(\(rank\) => rank <= 5\)\.map\(\(rank\) =>\s*renderPlaceholderRow\(rank\)/);
  assert.match(leaderboard, /const PUBLIC_RANK_LIMIT = 100/);
});


test('current inviter footer is known to the country card before personalized ranks finish', () => {
  assert.match(hub, /const hasInviterTrailingRow = Boolean\(/);
  assert.match(hub, /const hasInviterRankHint = Boolean\(/);
  assert.match(hub, /data-inviter-footer-trailing=\{hasInviterTrailingRow \? 'true'/);
  assert.match(hub, /data-inviter-footer-hint=\{hasInviterRankHint \? 'true'/);
  assert.match(hub, /const pendingCurrentWallet =/);
  assert.match(hub, /!displayData \|\| personalizationPending \|\| personalizationUnavailable/);
  assert.doesNotMatch(hub, /impactOnly[^\n]*rankContextNote/);
});
