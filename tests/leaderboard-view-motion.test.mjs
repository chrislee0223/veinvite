import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const source = readFileSync(
  join(root, 'src/components/PublicLeaderboard.tsx'),
  'utf8',
);

test('leaderboard tab motion is driven only by a real tab change', () => {
  assert.match(source, /onClickCapture=\{handleRankingTabClickCapture\}/);
  assert.match(source, /aria-selected'\) === 'true'/);
  assert.match(source, /setRankingMotionDirection\('forward'\)/);
  assert.match(source, /setRankingMotionDirection\('backward'\)/);
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*setRankingMotionDirection\(null\);\s*\}, \[wallet\]\);/,
  );
});

test('active underline uses one logical-position indicator with restrained motion', () => {
  assert.match(source, /\.leaderboardHub \.rankingTabs::after/);
  assert.match(source, /inset-inline-start:7%;/);
  assert.match(source, /inset-inline-start:57%;/);
  assert.match(
    source,
    /transition:inset-inline-start 180ms cubic-bezier\(\.22,1,\.36,1\);/,
  );
  assert.match(
    source,
    /\.leaderboardHub \.rankingTabs button::after \{[\s\S]*opacity:0 !important;/,
  );
});

test('panel entrance is small, logical-directional, and does not transform modal ancestors', () => {
  assert.match(source, /leaderboardPanelInForward 150ms/);
  assert.match(source, /leaderboardPanelInBackward 150ms/);
  assert.match(source, /inset-inline-start:6px;/);
  assert.match(source, /inset-inline-start:-6px;/);
  assert.doesNotMatch(source, /leaderboardPanelIn(?:Forward|Backward)[\s\S]{0,500}transform:/);
});

test('leaderboard motion respects reduced-motion preference', () => {
  assert.match(source, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(source, /transition:none !important;/);
  assert.match(source, /animation:none !important;/);
});
