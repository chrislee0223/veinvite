import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  explorer,
  resumeHook,
  slotStyles,
  ownerGroups,
  slotQaPage,
  visualQa,
] = await Promise.all([
  readFile('src/components/PublicNetworkExplorer.tsx', 'utf8'),
  readFile('src/hooks/usePublicNetworkResumeRefresh.ts', 'utf8'),
  readFile('src/components/PublicNetworkInviteSlots.module.css', 'utf8'),
  readFile('src/components/PublicNetworkOwnerGroups.tsx', 'utf8'),
  readFile('src/app/qa/network-slot-visual/page.tsx', 'utf8'),
  readFile('tests/playwright/visual-i18n.spec.ts', 'utf8'),
]);

test('public Network resumes with a focused no-store refresh without resetting navigation', () => {
  assert.match(
    explorer,
    /usePublicNetworkResumeRefresh/,
  );
  assert.match(
    explorer,
    /blocked:\s*Boolean\(pending\)/,
  );
  assert.match(
    resumeHook,
    /window\.addEventListener\(\s*'focus'/,
  );
  assert.match(
    resumeHook,
    /document\.addEventListener\(\s*'visibilitychange'/,
  );
  assert.match(
    resumeHook,
    /document\.visibilityState\s*===\s*'visible'/,
  );
  assert.match(
    resumeHook,
    /RESUME_REFRESH_MIN_INTERVAL_MS\s*=\s*1_500/,
  );
  assert.match(
    resumeHook,
    /new AbortController\(\)/,
  );
  assert.doesNotMatch(
    resumeHook,
    /setInterval/,
  );
  assert.doesNotMatch(
    resumeHook,
    /cancelNavigation|loadRoot|setView|setActivePath/,
  );
});

test('public invite slots stay visible above owner groups without intercepting input', () => {
  assert.match(
    slotStyles,
    /\.slotNode\s*\{[\s\S]*z-index:\s*8;/,
  );
  assert.match(
    slotStyles,
    /\.slotNode\s*\{[\s\S]*pointer-events:\s*none;/,
  );
  assert.match(
    ownerGroups,
    /\.publicGroupNode\s*\{[\s\S]*z-index:7;/,
  );
  assert.match(
    slotQaPage,
    /data-qa-slot-overlap-blocker="true"/,
  );
  assert.match(
    slotQaPage,
    /zIndex:\s*7/,
  );
  assert.match(
    visualQa,
    /metric\.zIndex\)\.toBeGreaterThan\(blockerZIndex\)/,
  );
  assert.match(
    visualQa,
    /metric\.pointerEvents\)\.toBe\('none'\)/,
  );
});
