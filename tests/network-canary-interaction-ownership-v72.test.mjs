import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const guide = read('src/components/AppGuide.tsx');
const v72 = read('src/components/AppNetworkCanaryV72.tsx');

test('developer wallet routes through V72 while general users keep AppNetworkHub', () => {
  assert.match(guide, /import\('\.\/AppNetworkCanaryV72'\)/);
  assert.match(guide, /<AppNetworkCanaryV72 key=\{wallet\.toLowerCase\(\)\} locale=\{locale\} \/>/);
  assert.match(guide, /<AppNetworkHub locale=\{locale\} \/>/);
});

test('V72 preserves V71 and owns only interaction hardening', () => {
  assert.match(v72, /import \{ AppNetworkCanaryV71 \} from '\.\/AppNetworkCanaryV71'/);
  assert.match(v72, /<AppNetworkCanaryV71 locale=\{locale\} \/>/);
  assert.doesNotMatch(v72, /fetch\s*\(/);
  assert.doesNotMatch(v72, /supabase/i);
  assert.doesNotMatch(v72, /reward/i);
});

test('group editor swallows the later node click before profile selection can repaint it', () => {
  assert.match(v72, /document\.addEventListener\('click', onClickCapture, true\)/);
  assert.match(v72, /const editorActive = Boolean\(/);
  assert.match(v72, /clearCanvasSelection\(root\)/);
  assert.match(v72, /event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*event\.stopImmediatePropagation\(\);/s);
});

test('Create rejects already-grouped nodes before V71 optimistic mobile paint', () => {
  assert.match(v72, /creating &&\s*\(node\.classList\.contains\('v42LockedMember'\) \|\| node\.classList\.contains\('v42GroupedMember'\)\)/s);
  assert.match(v72, /event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*event\.stopImmediatePropagation\(\);/s);
});

test('mobile group save keeps native activation and neutralizes the legacy clone freeze before paint', () => {
  const saveStart = v72.indexOf('const saveButton');
  const clickStart = v72.indexOf('const onClickCapture', saveStart);
  assert.notEqual(saveStart, -1);
  assert.notEqual(clickStart, -1);
  const saveBlock = v72.slice(saveStart, clickStart);

  assert.match(saveBlock, /\.v42GroupPanel \.v42CreateActions button\.primary/);
  assert.match(saveBlock, /event\.pointerType !== 'touch' && !coarsePointer/);
  assert.match(saveBlock, /armCommitTransition\(root\);/);
  assert.doesNotMatch(saveBlock, /event\.preventDefault\(/);
  assert.doesNotMatch(saveBlock, /event\.stopPropagation\(/);
  assert.doesNotMatch(saveBlock, /event\.stopImmediatePropagation\(/);

  assert.match(v72, /const freezeObserver = new MutationObserver/);
  assert.match(v72, /node\.matches\('\.v71MobileCommitFreezeLayer'\)/);
  assert.match(v72, /layers\.forEach\(\(layer\) => layer\.remove\(\)\)/);
  assert.match(v72, /node\.style\.setProperty\('visibility', 'visible', 'important'\)/);
  assert.doesNotMatch(v72, /cloneNode/);
  assert.match(v72, /\.personNode\.v72GroupCommitTransition/);
  assert.match(v72, /prefers-reduced-motion: reduce/);
});
