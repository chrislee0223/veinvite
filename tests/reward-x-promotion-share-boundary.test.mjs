import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const panel = readFileSync(new URL('../src/components/RewardXPromotionPanel.tsx', import.meta.url), 'utf8');
const popup = readFileSync(new URL('../src/hooks/useRewardPaidTransientFeedback.ts', import.meta.url), 'utf8');
const copy = readFileSync(new URL('../src/lib/i18n/rewardXPromotionCopy.ts', import.meta.url), 'utf8');
const locales = readFileSync(new URL('../src/lib/i18n/locales.ts', import.meta.url), 'utf8');

test('X bonus panel refreshes on both deadline boundaries and WebView resume', () => {
  assert.match(panel, /promotion\?\.state === 'OPEN'[\s\S]*offerDeadlineMs \+ 1/);
  assert.match(panel, /promotion\?\.state === 'SUBMISSION_GRACE'[\s\S]*offerGraceEndMs \+ 1/);
  assert.match(panel, /window\.setTimeout\(refresh, delayMs\)/);
  assert.match(panel, /document\.addEventListener\('visibilitychange', onVisible\)/);
  assert.match(panel, /window\.addEventListener\('focus', refresh\)/);
  assert.match(panel, /window\.clearTimeout\(timer\)/);
  assert.match(panel, /openWithinDeadline/);
  assert.match(panel, /!openWithinDeadline \|\|\s*!promotion\?\.shareToken/);
  assert.match(panel, /promotion\.state === 'SUBMISSION_GRACE' && nowMs <= offerGraceEndMs/);
});

test('popup never offers an already-expired +B3TR bonus', () => {
  assert.match(popup, /postDeadlineAt\?: string \| null/);
  assert.match(popup, /Number\.isFinite\(offerDeadlineMs\)/);
  assert.match(popup, /Date\.now\(\) <= offerDeadlineMs/);
  assert.match(popup, /Date\.now\(\) > promotionDeadlineMs/);
  assert.match(popup, /REWARD_X_PROMOTION_COPY\[locale\]\.expiredBody/);
  assert.match(popup, /shareLabel: undefined,[\s\S]*onShare: undefined/);
});

test('after opening X composer, popup explains the required post-link submission without acknowledging the base reward', () => {
  const share = /onShare: \(\) => \{([\s\S]*?)\n\s*\},\n\s*\}/.exec(popup);
  assert.ok(share, 'reward popup share action missing');
  assert.match(share[1], /window\.open/);
  assert.match(share[1], /REWARD_X_PROMOTION_COPY\[locale\]\.shareFollowupBody/);
  assert.doesNotMatch(share[1], /acknowledgeReward\(/);
  assert.doesNotMatch(share[1], /\/api\/rewards\/claims/);
});

test('post-link submission guidance is available in every supported VeInvite language', () => {
  const localeKeys = Array.from(locales.matchAll(/\{ locale: '([^']+)'/g), (m) => m[1]);
  assert.equal(localeKeys.length, 29);
  assert.match(copy, /shareFollowupBody: string/);
  assert.match(copy, /shareFollowupBody:[^\n]*open your reward in Notifications/i);
  for (const locale of localeKeys) {
    assert.match(copy, new RegExp('(?:^|\\n)\\s*[\\x27\\x22]?' + locale + '[\\x27\\x22]?\\s*:'), 'missing locale: ' + locale);
  }
  const found = (copy.match(/shareFollowupBody:/g) ?? []).length;
  assert.equal(found, 30, 'one type declaration and 29 localized guides expected');
});

test('new share and deadline UI compiles as TypeScript with no syntax diagnostics', () => {
  for (const source of [panel, popup, copy]) {
    const result = ts.transpileModule(source, {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true,
    });
    const errors = result.diagnostics?.filter((diagnostic) =>
      diagnostic.category === ts.DiagnosticCategory.Error,
    ) ?? [];
    assert.equal(errors.length, 0, errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('\n'));
  }
});
