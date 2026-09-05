import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/components/AppBottomNavigation.tsx', import.meta.url),
  'utf8',
);

test('bottom navigation motion only runs after an explicit tab change', () => {
  assert.match(source, /const pendingMotionTabRef = useRef<AppTab \| null>\(null\)/);
  assert.match(source, /if \(tab === activeTab\) \{[\s\S]*pendingMotionTabRef\.current = null;[\s\S]*return;/);
  assert.match(source, /pendingMotionTabRef\.current = tab;/);
  assert.match(source, /const pendingTab = pendingMotionTabRef\.current;/);
  assert.match(source, /if \(pendingTab !== activeTab\) return;/);
  assert.match(source, /pendingMotionTabRef\.current = null;/);
});

test('tab motion preserves existing lazy navigation and rapid-tap protections', () => {
  assert.match(source, /if \(navigationRequestRef\.current !== requestId\) return;/);
  assert.match(source, /startTransition\(\(\) => \{\s*onChange\(tab\);\s*\}\);/);
  assert.match(source, /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\);/);
  assert.match(source, /preloadTabModule\(tab\)/);
});

test('tab content uses subtle pre-paint motion without transforming modal roots', () => {
  assert.match(source, /useLayoutEffect\(\(\) => \{/);
  assert.match(source, /home: '\.missionCard'/);
  assert.match(source, /guide: '\.networkCard'/);
  assert.match(source, /\.leaderboardPage > \.impactCard/);
  assert.match(source, /\.leaderboardPage > \.rankingCard/);
  assert.match(source, /\.settingsPage > header/);
  assert.match(source, /\.settingsPage > \.settingsCard/);
  assert.match(source, /\{ opacity: 0, transform: 'translateY\(5px\)' \}/);
  assert.match(source, /\{ opacity: 1, transform: 'translateY\(0\)' \}/);
  assert.match(source, /const TAB_ENTER_DURATION_MS = 160;/);
  assert.doesNotMatch(source, /will-change/);
  assert.doesNotMatch(source, /framer-motion/);
});

test('tab and button motion respect reduced-motion preferences', () => {
  const reducedMotionMatches = source.match(/prefers-reduced-motion: reduce/g) ?? [];
  assert.ok(reducedMotionMatches.length >= 2);
  assert.match(source, /window\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
  assert.match(source, /transition: background-color 140ms ease, color 140ms ease, transform 90ms ease;/);
  assert.match(source, /button:active \{ transform: scale\(\.98\); \}/);
  assert.match(source, /button \{ transition: none; \}/);
  assert.match(source, /button:active \{ transform: none; \}/);
});
