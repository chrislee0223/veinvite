import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rewardPage = await readFile(
  new URL('../src/app/s/[key]/page.tsx', import.meta.url),
  'utf8',
);
const rewardOg = await readFile(
  new URL('../src/app/s/[key]/opengraph-image.tsx', import.meta.url),
  'utf8',
);
const invitePage = await readFile(
  new URL('../src/app/r/[key]/page.tsx', import.meta.url),
  'utf8',
);
const inviteOg = await readFile(
  new URL('../src/app/r/[key]/opengraph-image.tsx', import.meta.url),
  'utf8',
);
const share = await readFile(
  new URL('../src/lib/rewards/rewardReceiptShare.ts', import.meta.url),
  'utf8',
);

test('reward share text and OG fallback stay friend-neutral', () => {
  assert.doesNotMatch(
    share.slice(share.indexOf('export function rewardReceiptShareText')),
    /\bfriend(?:s)?\b/i,
  );
  assert.doesNotMatch(rewardOg, /\bfriend(?:s)?\b/i);
  assert.match(rewardOg, /Earn B3TR with VeInvite\./);
  assert.match(rewardOg, /Invite\. Verify\. Earn\./);
  assert.match(rewardOg, /Turn genuine referrals into B3TR rewards\./);
});

test('reward metadata and dynamic fallback use the same public card language', () => {
  for (const phrase of [
    'Earn B3TR with VeInvite',
    'Invite. Verify. Earn.',
    'Turn genuine referrals into B3TR rewards.',
  ]) {
    assert.ok(rewardPage.includes(phrase), 'reward page missing: ' + phrase);
    assert.ok(rewardOg.includes(phrase), 'reward OG missing: ' + phrase);
  }
});

test('invite metadata and dynamic fallback use the same public card language', () => {
  for (const phrase of [
    'Join VeInvite',
    'Verify. Explore. Earn B3TR.',
    'Complete missions and start earning rewards.',
  ]) {
    assert.ok(invitePage.includes(phrase), 'invite page missing: ' + phrase);
    assert.ok(inviteOg.includes(phrase), 'invite OG missing: ' + phrase);
  }
  assert.doesNotMatch(inviteOg, /You've been invited|You’ve been invited/);
});
