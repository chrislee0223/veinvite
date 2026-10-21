import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const localesSource = readFileSync(
  'src/lib/i18n/locales.ts',
  'utf8',
);
const receiptSource = readFileSync(
  'src/lib/i18n/rewardReceiptCopy.ts',
  'utf8',
);
const receiptViewSource = readFileSync(
  'src/components/RewardReceiptView.tsx',
  'utf8',
);

const supportedLocales = [
  ...localesSource.matchAll(/\{ locale: '([^']+)'/g),
].map((match) => match[1]);

const localeBlocks = [
  ...receiptSource.matchAll(
    /^\s*(?:'([^']+)'|([a-z]+)):\s*\{/gmu,
  ),
]
  .map((match) => match[1] || match[2])
  .filter((locale) => supportedLocales.includes(locale));

const REQUIRED_FIELDS = [
  'eyebrow',
  'title',
  'description',
  'round',
  'invite',
  'transaction',
  'viewTransaction',
  'acknowledge',
  'acknowledging',
  'error',
];

test('reward receipt copy is complete for every supported locale', () => {
  assert.equal(supportedLocales.length, 29);
  assert.match(
    receiptSource,
    /Record<SupportedLocale,\s*RewardReceiptCopy>/,
  );

  const direct = new Set(localeBlocks);
  assert.equal(direct.size, supportedLocales.length);

  for (const locale of supportedLocales) {
    assert.ok(direct.has(locale), 'missing receipt locale: ' + locale);

    const escaped = locale.replace('-', '\\-');
    const block = receiptSource.match(
      new RegExp(
        '(?:^|\\n)\\s*(?:\\\'' +
          escaped +
          '\\'|' +
          escaped +
          '):\\s*\\{([\\s\\S]*?)\\n\\s*\\},',
        'm',
      ),
    )?.[1];

    assert.ok(block, 'missing receipt block: ' + locale);
    for (const field of REQUIRED_FIELDS) {
      assert.match(
        block,
        new RegExp('\\b' + field + ':'),
        locale + ' missing ' + field,
      );
    }
  }
});

test('reward receipt keeps machine identifiers LTR inside RTL locales', () => {
  assert.match(
    receiptViewSource,
    /getLocaleDirection\(locale\)/,
  );
  assert.match(
    receiptViewSource,
    /className="notificationReceiptView" lang=\{locale\} dir=\{direction\}/,
  );
  assert.match(
    receiptViewSource,
    /className="notificationReceiptAmount" dir="ltr"/,
  );
  assert.match(
    receiptViewSource,
    /<dd dir="ltr">#\{receipt\.veBetterRoundId\}<\/dd>/,
  );
  assert.match(
    receiptViewSource,
    /<dd dir="ltr">\{receipt\.inviteCode\}<\/dd>/,
  );
  assert.match(
    receiptViewSource,
    /<dd title=\{receipt\.txId\} dir="ltr">/,
  );
  assert.match(
    receiptViewSource,
    /unicode-bidi:isolate/,
  );
});

test('reward receipt long localized text wraps instead of overflowing', () => {
  for (const guard of [
    'overflow-wrap:break-word',
    'overflow-wrap:anywhere',
    'white-space:normal',
    'flex:1 1 45%',
    'flex:1 1 55%',
  ]) {
    assert.ok(
      receiptViewSource.includes(guard),
      'missing receipt layout guard: ' + guard,
    );
  }
});
