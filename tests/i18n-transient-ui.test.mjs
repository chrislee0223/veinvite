import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const typography = readFileSync(
  'src/app/localized-typography.css',
  'utf8',
);
const walletGate = readFileSync(
  'src/components/WalletSessionGate.tsx',
  'utf8',
);
const legalGate = readFileSync(
  'src/components/LegalConsentGate.tsx',
  'utf8',
);
const notificationSurface = readFileSync(
  'src/components/InviteNotificationSurface.tsx',
  'utf8',
);
const rewardReceipt = readFileSync(
  'src/components/RewardReceiptNotice.tsx',
  'utf8',
);
const walletCopy = readFileSync(
  'src/lib/i18n/walletSessionCopy.ts',
  'utf8',
);

test('transient user-facing surfaces are covered by generic localization wrapping', () => {
  assert.match(typography, /\[role=['"]dialog['"]\]/);
  assert.match(typography, /\[role=['"]alertdialog['"]\]/);
  assert.match(typography, /\[aria-live=['"]polite['"]\]/);
  assert.match(typography, /html\[lang=['"]ko['"]\]/);
  assert.match(typography, /word-break:\s*keep-all\s*!important/);
  assert.match(typography, /overflow-wrap:\s*normal\s*!important/);
});

test('wallet verification and legal-consent one-time screens stay discoverable by transient protection', () => {
  assert.match(walletGate, /aria-live="polite"/);
  assert.match(legalGate, /aria-live="polite"/);
  assert.match(walletCopy, /checkingTitle:\s*'지갑을 확인하고 있어요'/);
});

test('notification, reward receipt and settings-style dialogs do not use break-all', () => {
  for (const [name, source] of [
    ['wallet gate', walletGate],
    ['legal gate', legalGate],
    ['notification surface', notificationSurface],
    ['reward receipt', rewardReceipt],
  ]) {
    assert.doesNotMatch(
      source,
      /word-break:\s*break-all/i,
      `${name} must not split translated words with break-all`,
    );
  }
});

test('technical RTL identifiers remain isolated from translated prose', () => {
  assert.match(typography, /unicode-bidi:\s*isolate/);
  assert.match(typography, /\.receiptFacts dd/);
  assert.match(typography, /\.rewardAmount/);
});
