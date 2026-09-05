import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/components/PublicLeaderboard.tsx', import.meta.url),
  'utf8',
);

test('leaderboard impact dialog uses the shared soft-focus motion without changing wallet details', () => {
  assert.match(source, /SOFT_FOCUS_MOTION_CSS/);
  assert.match(source, /softFocusCloseDelay/);
  assert.match(source, /const \[impactVisible, setImpactVisible\] = useState\(false\)/);
  assert.match(source, /const \[impactClosing, setImpactClosing\] = useState\(false\)/);
  assert.match(
    source,
    /className="modalBackdrop impactModalBackdrop veinviteSoftFocusBackdrop"/,
  );
  assert.match(source, /data-open=\{impactVisible \? 'true' : 'false'\}/);
  assert.match(
    source,
    /className="walletDialog impactDialog veinviteSoftFocusPanel"/,
  );

  const walletDialogBlock = source.match(
    /\{selectedEntry \? \([\s\S]*?className="walletDialog"[\s\S]*?\) : null\}/,
  );
  assert.ok(walletDialogBlock, 'wallet detail dialog should still exist');
  assert.doesNotMatch(walletDialogBlock[0], /veinviteSoftFocusPanel/);
});

test('impact close preserves focus and blocks duplicate or early-reveal races', () => {
  assert.match(
    source,
    /if \(!impactOpen \|\| impactCloseTimerRef\.current !== null\) \{\s*return;\s*\}/,
  );
  assert.match(source, /setImpactClosing\(true\)/);
  assert.match(source, /if \(!impactOpen \|\| impactClosing\) return/);
  assert.match(source, /setImpactVisible\(false\)/);
  assert.match(
    source,
    /impactCloseTimerRef\.current = window\.setTimeout\([\s\S]*?softFocusCloseDelay\(\)/,
  );
  assert.match(
    source,
    /window\.requestAnimationFrame\(\(\) => openerRef\.current\?\.focus\(\)\)/,
  );
});

test('impact modal locks background scrolling and respects reduced motion', () => {
  assert.match(source, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(source, /document\.body\.style\.overscrollBehavior = 'none'/);
  assert.match(source, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(source, /\.impactSummaryButton:active:not\(:disabled\) \{\s*transform:scale\(\.985\)/);
  assert.match(source, /SOFT_FOCUS_MOTION_CSS/);
});
