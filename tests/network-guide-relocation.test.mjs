import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  navigation,
  guide,
  guidePortal,
  networkPage,
  networkCopy,
  leaderboard,
  home,
] = await Promise.all([
  readFile(new URL('../src/components/AppBottomNavigation.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AppGuide.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/HomeGuideInfoPortal.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AppNetworkComingSoon.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/i18n/networkCopy.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PublicLeaderboard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/HomeClient.tsx', import.meta.url), 'utf8'),
]);

test('Network replaces Guide only at the user-facing navigation layer', () => {
  assert.match(navigation, /export type AppTab = 'home' \| 'guide' \| 'leaderboard' \| 'settings'/i);
  assert.match(navigation, /tab === 'guide' \? network\.navLabel : labels\[tab\]/i);
  assert.match(navigation, /return import\('\.\/AppGuide'\)/i);
  assert.match(navigation, /<HomeGuideInfoPortal locale=\{locale\} \/>/i);
  assert.match(navigation, /activeTab === 'home'/i);
});

test('the legacy Guide tab renders only the Network placeholder while guide content stays reusable', () => {
  assert.match(guide, /return <AppNetworkComingSoon locale=\{locale\} \/>/i);
  assert.match(guide, /export function InviteGuideContent/i);
  assert.doesNotMatch(guide, /className="countCard"/i);
  assert.doesNotMatch(guide, /flow\.countDescription/i);
  assert.match(networkPage, /NETWORK_COPY/i);
  assert.match(networkPage, /className="networkCard"/i);
});

test('Home exposes the invitation guide contextually without modifying the new progress and reward-claim Home implementation', () => {
  assert.match(guidePortal, /querySelector<HTMLElement>\('\.missionCard'\)/i);
  assert.match(guidePortal, /createPortal/i);
  assert.match(guidePortal, /ⓘ/i);
  assert.match(guidePortal, /<InviteGuideContent locale=\{locale\} \/>/i);
  assert.match(guidePortal, /aria-modal="true"/i);

  // The latest #233 progress/claim behavior must remain present in HomeClient.
  assert.match(home, /PROGRESS_CLAIM_COPY/i);
  assert.match(home, /rewardQueueStatus !== 'AWAITING_CLAIM'/i);
  assert.match(home, /slotReleasedAt/i);
  assert.match(home, /<MissionDots invite=\{invite\} \/>/i);
  assert.doesNotMatch(home, /HomeGuideInfoPortal/i);
});

test('public counting guidance is shown with the VeInvite onboarding impact card', () => {
  assert.match(leaderboard, /<p className="impactNote">\{t\.impactNote\}<\/p>/i);
  assert.match(leaderboard, /\.impactNote \{/i);
});

test('Network placeholder copy covers every supported locale', () => {
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
