import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  navigation,
  guide,
  guidePortal,
  impactPortal,
  infoIcon,
  softFocusMotion,
  networkWrapper,
  networkSurface,
  networkApi,
  networkCopy,
  leaderboard,
  home,
] = await Promise.all([
  readFile(new URL('../src/components/AppBottomNavigation.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AppGuide.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/HomeGuideInfoPortal.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/LeaderboardImpactInfoPortal.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/InfoCircleIcon.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/SoftFocusMotion.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AppNetworkComingSoon.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AppNetwork.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/network/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/i18n/networkCopy.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/InviterLeaderboard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/HomeClient.tsx', import.meta.url), 'utf8'),
]);

test('Network replaces Guide only at the user-facing navigation layer', () => {
  assert.match(navigation, /export type AppTab = 'home' \| 'guide' \| 'leaderboard' \| 'settings'/i);
  assert.match(navigation, /tab === 'guide' \? network\.navLabel : labels\[tab\]/i);
  assert.match(navigation, /return import\('\.\/AppGuide'\)/i);
  assert.match(navigation, /<HomeGuideInfoPortal locale=\{locale\} \/>/i);
  assert.match(navigation, /activeTab === 'home'/i);
});

test('the legacy Guide tab now launches the live Network while guide content stays reusable', () => {
  assert.match(guide, /return <AppNetworkComingSoon locale=\{locale\} \/>/i);
  assert.match(guide, /export function InviteGuideContent/i);
  assert.doesNotMatch(guide, /className="countCard"/i);
  assert.doesNotMatch(guide, /flow\.countDescription/i);

  assert.match(networkWrapper, /<AppNetwork/i);
  assert.match(networkWrapper, /useWalletLauncher/i);
  assert.match(networkWrapper, /data-veinvite-tab="home"/i);

  assert.match(networkSurface, /NETWORK_COPY/i);
  assert.match(networkSurface, /className="networkSummary networkCard"/i);
  assert.match(networkSurface, /className="treeStage"/i);
  assert.match(networkSurface, /className="memberList"/i);
  assert.match(networkSurface, /searchPlaceholder/i);
  assert.match(networkSurface, /thisRound/i);
});

test('Network reads are wallet-authenticated, root-scoped, and never use binary placement in the client API', () => {
  assert.match(networkApi, /requireWalletSession\(\{ request, expectedWallet: rootWallet \}\)/i);
  assert.match(networkApi, /read_referral_network_focus/i);
  assert.match(networkApi, /p_root_wallet:\s*rootWallet/i);
  assert.match(networkApi, /p_focus_wallet:\s*focusWallet/i);
  assert.match(networkApi, /Cache-Control': 'private, no-store'/i);
  assert.doesNotMatch(networkApi, /placement_parent_wallet/i);
  assert.doesNotMatch(networkSurface, /placement_parent_wallet/i);
});

test('Home exposes the invitation guide contextually without modifying the new progress and reward-claim Home implementation', () => {
  assert.match(guidePortal, /querySelector<HTMLElement>\('\.missionCard'\)/i);
  assert.match(guidePortal, /createPortal/i);
  assert.match(guidePortal, /<InfoCircleIcon size=\{18\} \/>/i);
  assert.doesNotMatch(guidePortal, /ⓘ/i);
  assert.match(guidePortal, /top:\s*32px/i);
  assert.match(guidePortal, /right:\s*24px/i);
  assert.match(guidePortal, /<InviteGuideContent locale=\{locale\} \/>/i);
  assert.match(guidePortal, /aria-modal="true"/i);

  // The latest referral progress/claim behavior must remain present in HomeClient.
  assert.match(home, /PROGRESS_CLAIM_COPY/i);
  assert.match(home, /rewardQueueStatus !== 'AWAITING_CLAIM'/i);
  assert.match(home, /slotReleasedAt/i);
  assert.match(home, /<MissionDots invite=\{invite\} \/>/i);
  assert.doesNotMatch(home, /HomeGuideInfoPortal/i);
});

test('Home decorative glow stays clipped inside the rounded invitation card', () => {
  assert.match(guidePortal, /\.missionCard \{[\s\S]*overflow:\s*hidden;[\s\S]*overflow:\s*clip;/i);
  assert.match(guidePortal, /\.missionCard > \.cardGlow \{[\s\S]*radial-gradient/i);
  assert.match(guidePortal, /\.missionCard > \.cardGlow \{[\s\S]*filter:\s*none;/i);
});

test('Leaderboard exposes public counting guidance through a contextual info control', () => {
  assert.match(navigation, /<LeaderboardImpactInfoPortal locale=\{locale\} \/>/i);
  assert.match(navigation, /activeTab === 'leaderboard'/i);
  assert.match(impactPortal, /\.leaderboardPage \.impactCard/i);
  assert.match(impactPortal, /guide\.countTitle/i);
  assert.match(impactPortal, /t\.impactNote/i);
  assert.match(impactPortal, /<InfoCircleIcon size=\{17\} \/>/i);
  assert.match(impactPortal, /\.impactCard > \.impactNote \{\s*display:\s*none;/i);
  assert.match(leaderboard, /<p className="impactNote">\{t\.impactNote\}<\/p>/i);
});

test('Home and Leaderboard info controls use the same SVG icon geometry', () => {
  assert.match(infoIcon, /viewBox="0 0 24 24"/i);
  assert.match(infoIcon, /<circle cx="12" cy="12" r="9" \/>/i);
  assert.match(guidePortal, /InfoCircleIcon/i);
  assert.match(impactPortal, /InfoCircleIcon/i);
});

test('Home and Leaderboard dialogs share the same soft-focus entrance and exit lifecycle', () => {
  for (const portal of [guidePortal, impactPortal]) {
    assert.match(portal, /SOFT_FOCUS_MOTION_CSS/i);
    assert.match(portal, /softFocusCloseDelay/i);
    assert.match(portal, /dialogMounted/i);
    assert.match(portal, /dialogVisible/i);
    assert.match(portal, /data-open=\{dialogVisible \? 'true' : 'false'\}/i);
    assert.match(portal, /veinviteSoftFocusBackdrop/i);
    assert.match(portal, /veinviteSoftFocusPanel/i);
    assert.match(portal, /revealFrame/i);
    assert.match(portal, /requestAnimationFrame\(\(\) => \{[\s\S]*requestAnimationFrame\(\(\) => setDialogVisible\(true\)\)/i);
  }

  assert.match(softFocusMotion, /opacity:\s*0;/i);
  assert.match(softFocusMotion, /translate3d\(0, 4px, 0\) scale\(\.97\)/i);
  assert.match(softFocusMotion, /data-open="true"/i);
  assert.match(softFocusMotion, /transition-duration:\s*180ms/i);
  assert.match(softFocusMotion, /SOFT_FOCUS_CLOSE_MS\s*=\s*140/i);
  assert.match(softFocusMotion, /prefers-reduced-motion:\s*reduce/i);
});

test('Home and Leaderboard dialogs keep close controls in identical non-scrolling chrome', () => {
  for (const portal of [guidePortal, impactPortal]) {
    assert.match(portal, /className="veinviteSoftFocusHeader"/i);
    assert.match(portal, /className="veinviteSoftFocusClose"/i);
    assert.match(portal, /className="veinviteSoftFocusScroll/i);
    assert.doesNotMatch(portal, />\s*×\s*<\/button>/i);
  }

  assert.match(softFocusMotion, /\.veinviteSoftFocusHeader \{[\s\S]*min-height:\s*56px;[\s\S]*justify-content:\s*flex-end;[\s\S]*padding:\s*10px 12px 8px;/i);
  assert.match(softFocusMotion, /\.veinviteSoftFocusScroll \{[\s\S]*overflow:\s*auto;/i);
  assert.match(softFocusMotion, /\.veinviteSoftFocusClose \{\s*position:\s*relative;[\s\S]*width:\s*36px;[\s\S]*height:\s*36px;/i);
  assert.match(softFocusMotion, /\.veinviteSoftFocusClose::before,[\s\S]*\.veinviteSoftFocusClose::after/i);
  assert.match(softFocusMotion, /translate\(-50%, -50%\) rotate\(45deg\)/i);
  assert.match(softFocusMotion, /translate\(-50%, -50%\) rotate\(-45deg\)/i);
});

test('Network navigation copy covers every supported locale', () => {
  const expectedLocales = [
    'en','ko','zh','hi','es','ja','it','tr','nl','de','fr','ar','bn','pt','ru','id','vi','zh-tw','sv','ro','ur','pcm','arz','mr','te','sw','ha',
  ];

  for (const locale of expectedLocales) {
    const pattern = locale === 'zh-tw'
      ? /'zh-tw':\s*\{/i
      : new RegExp(`\\n\\s*${locale}:\\s*\\{`, 'i');
    assert.match(networkCopy, pattern, `missing Network copy for ${locale}`);
  }
});
