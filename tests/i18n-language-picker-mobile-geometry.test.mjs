import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const layoutSource = readFileSync(
  new URL('../src/app/layout.tsx', import.meta.url),
  'utf8',
);
const geometryStyles = readFileSync(
  new URL('../src/app/language-picker-mobile.css', import.meta.url),
  'utf8',
);
const settingsSource = readFileSync(
  new URL('../src/components/AppSettings.tsx', import.meta.url),
  'utf8',
);

test('Settings language sheet keeps its height when search results shrink', () => {
  assert.match(layoutSource, /import '\.\/language-picker-mobile\.css';/);
  assert.match(settingsSource, /className="languageOptionList"/);
  assert.match(settingsSource, /className=\{\s*languageClosing\s*\? 'languageModal closing'\s*: 'languageModal'\s*\}/);
  assert.match(
    geometryStyles,
    /\.settingsPage \.languageModal \{[\s\S]*?height: min\(78dvh, 680px\);[\s\S]*?max-height: min\(78dvh, 680px\);[\s\S]*?\}/,
  );
  assert.match(
    geometryStyles,
    /\.settingsPage \.languageOptionList \{[\s\S]*?flex: 1 1 auto;[\s\S]*?align-content: start;[\s\S]*?\}/,
  );
});

test('mobile keeps its existing taller sheet envelope', () => {
  assert.match(geometryStyles, /@media \(max-width: 560px\)/);
  assert.match(
    geometryStyles,
    /@media \(max-width: 560px\) \{[\s\S]*?\.settingsPage \.languageModal \{[\s\S]*?height: min\(82dvh, 680px\);[\s\S]*?max-height: min\(82dvh, 680px\);[\s\S]*?\}[\s\S]*?\}/,
  );
});
