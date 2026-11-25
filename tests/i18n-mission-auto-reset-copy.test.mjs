import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { MISSION_RESET_NOTIFICATION_COPY } from '../src/lib/i18n/missionResetNotificationCopy.ts';

const localesSource = readFileSync('src/lib/i18n/locales.ts', 'utf8');
const expectedLocales = [...localesSource.matchAll(/\{ locale: '([^']+)'/g)].map(m=>m[1]);

test('reset notification copy explicitly covers every VeInvite locale',()=>{
  assert.equal(expectedLocales.length, 29);
  assert.deepEqual(Object.keys(MISSION_RESET_NOTIFICATION_COPY).sort(),expectedLocales.sort());
});

test('mission reset copy is concise and never implies invite/slot or new-round expiration',()=>{
  for(const [locale, copy] of Object.entries(MISSION_RESET_NOTIFICATION_COPY)){
    assert.ok(copy.title.length > 2, locale);
    assert.ok(copy.body.length > 15, locale);
    assert.ok(copy.title.length < 90, locale);
    assert.ok(copy.body.length < 250, locale);
    assert.match(copy.body, /(?:0\/3|۰\/۳|٠\/٣|০\/৩)/u, locale);
  }
  assert.equal(MISSION_RESET_NOTIFICATION_COPY.ko.title,'미션 진행도 초기화');
  assert.equal(MISSION_RESET_NOTIFICATION_COPY.ko.body,
    '미션 완료 기한이 만료되어 진행도가 0/3으로 초기화되었습니다. 다시 미션을 진행해 주세요.');
  assert.doesNotMatch(MISSION_RESET_NOTIFICATION_COPY.en.body,/new round|invitation expired|friend slot/i);
});
