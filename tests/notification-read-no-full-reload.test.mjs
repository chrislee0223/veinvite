import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const inApp = readFileSync('src/components/InAppInviteNotifications.tsx', 'utf8');
const home = readFileSync('src/components/HomeClient.tsx', 'utf8');

test('reading notifications never performs a full page reload', () => {
  assert.doesNotMatch(inApp, /window\.location\.reload\(\)/u);
  assert.match(inApp, /HOME_DATA_REFRESH_REQUESTED_EVENT/u);
  const dispatches = inApp.match(/new Event\(HOME_DATA_REFRESH_REQUESTED_EVENT\)/gu) ?? [];
  assert.ok(dispatches.length >= 2);
});

test('home data refreshes quietly when notification acknowledgement requires it', () => {
  assert.match(home, /HOME_DATA_REFRESH_REQUESTED_EVENT/u);
  assert.match(home, /window\.addEventListener\(\s*HOME_DATA_REFRESH_REQUESTED_EVENT,[\s\S]*refreshHomeData/u);
  assert.match(home, /const refreshHomeData = \(\) => \{\s*void load\(true\);/u);
  assert.match(home, /window\.removeEventListener\(\s*HOME_DATA_REFRESH_REQUESTED_EVENT,[\s\S]*refreshHomeData/u);
});
