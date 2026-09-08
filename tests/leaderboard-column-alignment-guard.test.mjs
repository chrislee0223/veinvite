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
const inviter = readFileSync(
  join(root, 'src/components/InviterLeaderboard.tsx'),
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

test('country starts farther inline by matching the existing new/returning track width', () => {
  assert.match(
    guard,
    /grid-template-columns: 52px minmax\(0, 1fr\) 52px 52px 64px;/,
  );
  assert.match(
    guard,
    /@media \(max-width: 430px\)[\s\S]*grid-template-columns: 40px minmax\(0, 1fr\) 40px 40px 46px;/,
  );
  assert.match(
    guard,
    /@media \(max-width: 360px\)[\s\S]*grid-template-columns: 36px minmax\(0, 1fr\) 36px 36px 42px;/,
  );

  assert.doesNotMatch(guard, /translateX|margin-inline-start|padding-inline-start/);
});

test('empty inviter cells reserve the same avatar footprint as populated rows', () => {
  assert.match(
    guard,
    /\.placeholderRow \.walletCell::before \{[\s\S]*flex: 0 0 22px;[\s\S]*inline-size: 22px;[\s\S]*block-size: 22px;/,
  );
  assert.match(
    guard,
    /@media \(max-width: 420px\)[\s\S]*\.placeholderRow \.walletCell::before \{[\s\S]*flex-basis: 18px;[\s\S]*inline-size: 18px;[\s\S]*block-size: 18px;/,
  );
  assert.match(
    guard,
    /@media \(max-width: 360px\)[\s\S]*\.placeholderRow \.walletCell::before \{[\s\S]*flex-basis: 16px;[\s\S]*inline-size: 16px;[\s\S]*block-size: 16px;/,
  );

  assert.match(
    inviter,
    /\.walletAvatar \{[\s\S]*flex:0 0 22px;[\s\S]*width:22px;[\s\S]*height:22px;/,
  );
  assert.match(
    inviter,
    /@media \(max-width:420px\)[\s\S]*\.walletAvatar \{[\s\S]*flex-basis:18px;[\s\S]*width:18px;[\s\S]*height:18px;/,
  );
  assert.match(
    inviter,
    /@media \(max-width:360px\)[\s\S]*\.walletAvatar \{[\s\S]*flex-basis:16px;[\s\S]*width:16px;[\s\S]*height:16px;/,
  );
});
