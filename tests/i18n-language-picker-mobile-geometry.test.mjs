import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const layoutSource = readFileSync(
  new URL('../src/app/layout.tsx', import.meta.url),
  'utf8',
);
const mobileStyles = readFileSync(
  new URL('../src/app/language-picker-mobile.css', import.meta.url),
  'utf8',
);
const settingsSource = readFileSync(
  new URL('../src/components/AppSettings.tsx', import.meta.url),
  'utf8',
);

test('mobile Settings language sheet keeps its height when search results shrink', () => {
  assert.match(layoutSource, /import '\.\/language-picker-mobile\.css';/);
  assert.match(settingsSource, /className="languageOptionList"/);
  assert.match(settingsSource, /className=\{\s*languageClosing\s*\? 'languageModal closing'\s*: 'languageModal'\s*\}/);
  assert.match(mobileStyles, /@media \(max-width: 560px\)/);
  assert.match(
    mobileStyles,
    /\.settingsPage \.languageModal \{[\s\S]*?height: min\(82dvh, 680px\);[\s\S]*?max-height: min\(82dvh, 680px\);[\s\S]*?\}/,
  );
  assert.match(
    mobileStyles,
    /\.settingsPage \.languageOptionList \{[\s\S]*?flex: 1 1 auto;[\s\S]*?align-content: start;[\s\S]*?\}/,
  );
});

test('stable sheet geometry is mobile-only and does not change desktop sizing', () => {
  const mobileRuleIndex = mobileStyles.indexOf('@media (max-width: 560px)');
  const sheetRuleIndex = mobileStyles.indexOf('.settingsPage .languageModal');

  assert.ok(mobileRuleIndex >= 0);
  assert.ok(sheetRuleIndex > mobileRuleIndex);
  assert.doesNotMatch(mobileStyles.slice(0, mobileRuleIndex), /\.languageModal/);
});
