import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const locales = read('src/lib/i18n/locales.ts');
const metaCopy = read('src/lib/i18n/notificationMetaCopy.ts');
const historyCopy = read('src/lib/i18n/notificationHistoryCopy.ts');
const center = read('src/components/UnifiedInviteNotificationHistoryCenter.tsx');
const polish = read('src/app/notification-history-polish.css');

const supportedLocales = [...locales.matchAll(/\{ locale: '([^']+)'/g)]
  .map((match) => match[1]);
const translatedLocales = [...metaCopy.matchAll(
  /^\s*(?:'([^']+)'|([a-z]+)):\s*\{/gmu,
)]
  .map((match) => match[1] ?? match[2])
  .filter((locale) => supportedLocales.includes(locale));

test('notification relationship metadata is translated for every supported locale', () => {
  assert.equal(translatedLocales.length, supportedLocales.length);
  assert.deepEqual(
    [...new Set(translatedLocales)].sort(),
    [...supportedLocales].sort(),
  );
  for (const field of ['unread', 'invitedFriend', 'inviteCode', 'viewReceipt']) {
    assert.match(metaCopy, new RegExp(`${field}:`));
  }
});

test('notification cards explain whose wallet is shown instead of exposing an unlabeled address', () => {
  assert.match(center, /metaCopy\.invitedFriend/u);
  assert.match(center, /className="notificationFriendMeta"/u);
  assert.match(center, /className="notificationFriendWallet" dir="ltr"/u);
  assert.match(center, /\(\{friend\}\)/u);
  assert.match(center, /metaCopy\.inviteCode/u);
  assert.match(center, /className="notificationActionMetaItem"/u);
});

test('unread status, time grouping and Korean actions have distinct meanings', () => {
  assert.match(center, /metaCopy\.unread/u);
  assert.match(historyCopy, /ko: \{ title: '알림', newLabel: '읽지 않음', markAll: '모두 읽음 처리', today: '오늘', yesterday: '어제', earlier: '이전'/u);
});

test('event time stays top-right and natural wrapping prevents stranded final words', () => {
  assert.match(polish, /"title time"[\s\S]*"body body"[\s\S]*"meta meta"/u);
  assert.match(polish, /\.notificationHistoryTime[\s\S]*align-self:\s*start\s*!important/u);
  assert.match(polish, /\.notificationHistoryTitle[\s\S]*text-wrap:\s*balance\s*!important/u);
  assert.match(polish, /\.notificationHistoryBody[\s\S]*text-wrap:\s*pretty\s*!important/u);
  assert.match(polish, /\[lang="ko"\] \.notificationHistoryBody[\s\S]*word-break:\s*keep-all\s*!important/u);
  assert.doesNotMatch(polish, /"title"\s*\n\s*"body"\s*\n\s*"meta"\s*\n\s*"time"/u);
});

test('very narrow cards keep time in the top row without letting it dominate the title', () => {
  assert.match(polish, /@media \(max-width:\s*350px\)[\s\S]*"title time"[\s\S]*\.notificationHistoryTime[\s\S]*font-size:\s*0\.54rem\s*!important/u);
});

test('paid notifications keep receipt acknowledgement semantics while making the action explicit', () => {
  assert.match(center, /metaCopy\.viewReceipt/u);
  assert.match(center, /if \(paid\) \{[\s\S]*void openRewardReceipt\(item\)[\s\S]*return;/u);
  assert.match(center, /ACKNOWLEDGE_REWARD_RECEIPT/u);
});
