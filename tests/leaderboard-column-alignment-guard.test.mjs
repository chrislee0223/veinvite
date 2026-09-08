import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const layout = readFileSync(join(root, 'src/app/layout.tsx'), 'utf8');
const guard = readFileSync(
  join(root, 'src/app/leaderboard-column-alignment-guard.css'),
  'utf8',
);
const oldHub = readFileSync(
  join(root, 'src/components/PublicLeaderboardHub.tsx'),
  'utf8',
);

test('final leaderboard alignment guard loads after country base geometry', () => {
  const baseImport = layout.indexOf(
    "import './leaderboard-country-horizontal-balance.css';",
  );
  const guardImport = layout.indexOf(
    "import './leaderboard-column-alignment-guard.css';",
  );

  assert.ok(baseImport >= 0);
  assert.ok(guardImport > baseImport);
});

test('country starts farther inline using reviewed rank/total track widths', () => {
  assert.match(
    guard,
    /grid-template-columns: 64px minmax\(0, 1fr\) 52px 52px 64px;/,
  );
  assert.match(
    guard,
    /@media \(max-width: 430px\)[\s\S]*grid-template-columns: 46px minmax\(0, 1fr\) 40px 40px 46px;/,
  );
  assert.match(
    guard,
    /@media \(max-width: 360px\)[\s\S]*grid-template-columns: 42px minmax\(0, 1fr\) 36px 36px 42px;/,
  );

  assert.doesNotMatch(guard, /translateX|margin-inline-start|padding-inline-start/);
});

test('country typography restores the reviewed pre-five-column scale', () => {
  assert.match(guard, /\.countryHeader \{\s*font-size: \.61rem;/);
  assert.match(guard, /\.countryPlaceholderRow \{\s*font-size: \.72rem;/);
  assert.match(
    guard,
    /\.countryNameLine strong,[\s\S]*\.countryMetricValue \{\s*font-size: \.72rem;/,
  );
  assert.match(guard, /\.countryTotal \{\s*font-size: \.8rem;/);
});

test('empty inviter dash centers under the inviter header instead of reserving avatar space', () => {
  assert.match(
    guard,
    /\.placeholderRow \.walletCell::before \{\s*content: none;/,
  );
  assert.match(
    guard,
    /\.placeholderRow \.walletText \{\s*text-align: center !important;/,
  );
  assert.match(
    guard,
    /@media \(max-width: 420px\)[\s\S]*\.placeholderRow \.walletCell \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) !important;[\s\S]*column-gap: 0 !important;/,
  );
  assert.match(
    guard,
    /@media \(max-width: 420px\)[\s\S]*\.placeholderRow \.walletText \{[\s\S]*width: 100% !important;[\s\S]*min-width: 0 !important;[\s\S]*max-width: 100% !important;/,
  );

  assert.match(oldHub, /className="tableHeader"/);
});
