import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [headerSource, notificationSource] = await Promise.all([
  readFile('src/components/AppHeader.tsx', 'utf8'),
  readFile('src/components/UnifiedInviteNotificationHistoryCenter.tsx', 'utf8'),
]);

test('shared app header keeps the three official external destinations', () => {
  assert.match(headerSource, /https:\/\/governance\.vebetterdao\.org\/allocations\/vote/u);
  assert.match(headerSource, /https:\/\/x\.com\/Veinvite/u);
  assert.match(headerSource, /https:\/\/t\.me\/Veinvite_vet/u);
  assert.equal((headerSource.match(/target="_blank"/gu) ?? []).length, 1);
  assert.equal((headerSource.match(/rel="noopener noreferrer"/gu) ?? []).length, 1);
  assert.match(headerSource, /EXTERNAL_LINKS\.map\(\(link\) =>/u);
});

test('Vote uses a ballot-box glyph instead of the former document glyph', () => {
  const voteStart = headerSource.indexOf('function VoteIcon()');
  const xStart = headerSource.indexOf('function XIcon()');
  assert.ok(voteStart >= 0 && xStart > voteStart);
  const voteSource = headerSource.slice(voteStart, xStart);

  assert.match(voteSource, /<rect[\s\S]*x="4"[\s\S]*y="10\.25"[\s\S]*width="16"[\s\S]*height="9\.25"/u);
  assert.match(voteSource, /d="m10\.2 7\.15 1\.35 1\.35 2\.45-2\.65"/u);
  assert.doesNotMatch(voteSource, /M6\.5 3\.75h8\.75L18\.5 7v13\.25H6\.5V3\.75Z/u);
});

test('external links, wallet chip, and notification bell share the same interaction motion', () => {
  assert.match(
    headerSource,
    /\.headerIconLink:hover,\.accountChip:hover\{[^}]*transform:translateY\(-1px\)/u,
  );
  assert.match(
    headerSource,
    /\.headerIconLink:active,\.accountChip:active\{transform:translateY\(0\) scale\(\.97\)\}/u,
  );
  assert.match(
    headerSource,
    /prefers-reduced-motion:reduce[\s\S]*\.headerIconLink,\.accountChip\{transition:none\}[\s\S]*\.headerIconLink:hover,\.headerIconLink:active,\.accountChip:hover,\.accountChip:active\{transform:none!important\}/u,
  );

  assert.match(
    notificationSource,
    /\.notificationHistoryBell:hover\{[^}]*transform:translateY\(-1px\)/u,
  );
  assert.match(
    notificationSource,
    /\.notificationHistoryBell:active\{transform:translateY\(0\) scale\(\.97\)\}/u,
  );
  assert.match(
    notificationSource,
    /prefers-reduced-motion:reduce[\s\S]*\.notificationHistoryBell,\.notificationHistoryRow\{transition:none\}[\s\S]*\.notificationHistoryBell:hover,\.notificationHistoryBell:active\{transform:none!important\}/u,
  );
});

test('all header action badges switch to compact sizing at the same 560px breakpoint', () => {
  const mediumStart = headerSource.indexOf('@media (max-width:640px)');
  const compactStart = headerSource.indexOf('@media (max-width:560px)');
  const narrowStart = headerSource.indexOf('@media (max-width:360px)');

  assert.ok(mediumStart >= 0 && compactStart > mediumStart && narrowStart > compactStart);

  const mediumSource = headerSource.slice(mediumStart, compactStart);
  const compactSource = headerSource.slice(compactStart, narrowStart);

  assert.doesNotMatch(mediumSource, /headerIconLink\{width:34px/u);
  assert.match(compactSource, /headerIconLink\{width:34px;height:34px;flex-basis:34px/u);
  assert.match(compactSource, /accountChip\{min-height:34px/u);
  assert.match(
    notificationSource,
    /@media\(max-width:560px\)[\s\S]*?\.notificationHistoryBell\{width:34px;height:34px;flex-basis:34px/u,
  );
});
