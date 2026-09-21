import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(
  'src/app/notification-i18n-final-hardening.css',
  'utf8',
);
const layout = readFileSync('src/app/layout.tsx', 'utf8');
const review = readFileSync(
  'src/qa/QaNotificationI18nReview.tsx',
  'utf8',
);
const qaLayout = readFileSync('src/app/qa/layout.tsx', 'utf8');

test('compact notification header gives translated mark-all copy its own row', () => {
  assert.match(css, /@media \(max-width: 560px\)/u);
  assert.match(css, /"heading close"\s*"markall markall"/u);
  assert.match(css, /\.notificationHistoryHeaderActions\s*\{\s*display: contents !important;/u);
  assert.match(css, /:has\(\.notificationHistoryMarkAll\)/u);
});

test('notification script metrics explicitly cover Arabic Urdu and Indic families', () => {
  for (const locale of ['ar', 'arz', 'ur', 'hi', 'bn', 'mr', 'te']) {
    assert.match(css, new RegExp(`\\[lang='${locale}'\\]`, 'u'));
  }
  assert.match(css, /line-height: 1\.68 !important;/u);
  assert.match(css, /line-height: 1\.52 !important;/u);
});

test('technical reward values stay LTR inside RTL notification layouts', () => {
  assert.match(css, /\.notificationHistoryPanel\[dir='rtl'\] \.notificationActionCopy strong/u);
  assert.match(css, /\.notificationHistoryPanel\[dir='rtl'\] \.notificationReceiptAmount/u);
  assert.match(css, /direction: ltr !important;/u);
  assert.match(css, /unicode-bidi: isolate !important;/u);
  assert.match(css, /unicode-bidi: plaintext !important;/u);
});

test('final notification hardening loads after existing notification polish layers', () => {
  const historyIndex = layout.indexOf("./notification-history-polish.css");
  const runtimeIndex = layout.indexOf("./notification-runtime-ux-fix.css");
  const finalIndex = layout.indexOf("./notification-i18n-final-hardening.css");

  assert.ok(historyIndex >= 0);
  assert.ok(runtimeIndex > historyIndex);
  assert.ok(finalIndex > runtimeIndex);
});

test('protected QA review can render all locales at real 320 and 390 iframe widths', () => {
  assert.match(review, /LANGUAGE_OPTIONS\.map/u);
  assert.match(review, /width: 320, height: 568/u);
  assert.match(review, /width: 390, height: 844/u);
  assert.match(review, /width: 480, height: 840/u);
  assert.match(review, /\/qa\/state\?state=/u);
  assert.match(review, /'ar'/u);
  assert.match(review, /'ur'/u);
  assert.match(review, /'de'/u);
  assert.match(qaLayout, /isQaStudioAccessAllowed/u);
  assert.match(qaLayout, /notFound\(\)/u);
});
