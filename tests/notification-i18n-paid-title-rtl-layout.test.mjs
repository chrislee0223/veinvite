import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const localeSource = read('src/lib/i18n/locales.ts');
const titleSource = read('src/lib/i18n/rewardXPromotionPaidNotificationCopy.ts');
const center = read('src/components/UnifiedInviteNotificationHistoryCenter.tsx');
const transient = read('src/components/InviteNotificationSurfaceV2.tsx');
const css = read('src/app/notification-i18n-final-hardening.css');

test('all 29 supported languages have a specifically completed X payout headline', () => {
  const out = ts.transpileModule(titleSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(out, { exports });
  const titles = exports.REWARD_X_PROMOTION_PAID_TITLE;
  const locales = [...localeSource.matchAll(/\{ locale: '([^']+)'/gu)].map(m => m[1]);
  assert.equal(locales.length, 29);
  assert.deepEqual(Object.keys(titles).sort(), locales.sort());
  for (const [locale, title] of Object.entries(titles)) {
    assert.equal(typeof title, 'string', locale);
    assert.ok(title.trim().length >= 6, locale + ' title too short');
    assert.ok(!/undefined|TODO|TBD|PLACEHOLDER/i.test(title), locale);
  }
  assert.equal(titles.ko, 'X 추가 보상 지급 완료');
  assert.equal(titles.en, 'X bonus paid');
  assert.notEqual(titles.ko, 'X 프로모션 보너스');
});

test('X paid headline is separated from the generic ongoing-promotion panel title', () => {
  assert.match(center, /case 'X_PROMOTION_PAID':[\s\S]*?title: REWARD_X_PROMOTION_PAID_TITLE\[locale\]/);
  assert.match(transient, /case 'X_PROMOTION_PAID':[\s\S]*?title: REWARD_X_PROMOTION_PAID_TITLE\[locale\]/);
  assert.match(center, /body: xPromotion\.paidBody/);
  assert.match(transient, /body: xPromotion\.paidBody/);
  assert.match(read('src/lib/i18n/rewardXPromotionCopy.ts'), /title: 'X Promotion Bonus'/);
});

test('technical amount chips stay LTR in RTL notices; prose remains locale driven', () => {
  assert.match(center, /effectiveKind === 'DAPP_PROGRESS'/);
  assert.match(center, /effectiveKind === 'REWARD_READY'/);
  assert.match(center, /effectiveKind === 'X_PROMOTION_PAID'/);
  assert.match(center, /<b dir=\{technicalHint \? 'ltr' : undefined\}>\{copy\.hint\}<\/b>/);
  assert.match(transient, /className="rewardAmount" dir="ltr"/);
  assert.match(transient, /className="notificationHint"[\s\S]*primary\.kind === 'X_PROMOTION_PAID'/);
  assert.match(css, /\.notificationHistoryMeta b\[dir='ltr'\]/);
  assert.match(css, /unicode-bidi: isolate !important/);
});

test('mobile empty/read-only history header stays one row without a phantom Mark-all row', () => {
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /\.notificationHistoryHeader:has\(\.notificationHistoryMarkAll\) \{/);
  assert.doesNotMatch(css, /\.notificationHistoryPanel \.notificationHistoryHeader \{\s*display: grid !important/);
  assert.match(css, /"heading close"\s*"markall markall"/);
});
