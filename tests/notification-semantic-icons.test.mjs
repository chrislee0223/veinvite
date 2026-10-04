import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const surface = readFileSync(
  new URL('../src/components/InviteNotificationSurfaceV2.tsx', import.meta.url),
  'utf8',
);

test('notification dialog uses semantic icons instead of decorative dots', () => {
  assert.doesNotMatch(surface, /multiple \? '••' : important \? '✓' : '•'/u);
  assert.match(surface, /data-notification-icon="invite-accepted"/u);
  assert.match(surface, /data-notification-icon="invite-another-person"/u);
  assert.match(surface, /data-notification-icon="dapp-progress"/u);
  assert.match(surface, /data-notification-icon="vot3-converted"/u);
  assert.match(surface, /data-notification-icon="reward-ready"/u);
  assert.match(surface, /data-notification-icon="reward-paid"/u);
  assert.match(surface, /data-notification-icon="security-review"/u);
  assert.match(surface, /data-notification-icon="security-cleared"/u);
  assert.match(surface, /data-notification-icon="security-restricted"/u);
  assert.match(surface, /data-notification-icon="security-restored"/u);
  assert.match(surface, /data-notification-icon="multiple"/u);
});

test('security icon tones distinguish positive, pending and restricted outcomes', () => {
  assert.match(surface, /\.stageIcon\.positive/u);
  assert.match(surface, /\.stageIcon\.review/u);
  assert.match(surface, /\.stageIcon\.restricted/u);
  assert.match(surface, /stageIconTone\(primary\.kind\)/u);
});
