import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [source, rootIdentitySource, interactionOwnershipSource, parentVisualSource, guideSource, v69Source, controlCopySource] = await Promise.all([
  readFile('src/components/AppNetworkCanaryV70.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV71.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV72.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV73.tsx', 'utf8'),
  readFile('src/components/AppGuide.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV69.tsx', 'utf8'),
  readFile('src/lib/i18n/networkCanvasControlCopy.ts', 'utf8'),
]);

test('V73 is the final Network canary layer and preserves the mature V72 to V71 to V70 to V69 chain', () => {
  assert.match(guideSource, /AppNetworkCanaryV73/);
  assert.match(guideSource, /<AppNetworkCanaryV73 key=\{wallet\.toLowerCase\(\)\} locale=\{locale\} \/>/);
  assert.match(parentVisualSource, /AppNetworkCanaryV72/);
  assert.match(parentVisualSource, /<AppNetworkCanaryV72 locale=\{locale\} \/>/);
  assert.match(interactionOwnershipSource, /AppNetworkCanaryV71/);
  assert.match(interactionOwnershipSource, /<AppNetworkCanaryV71 locale=\{locale\} \/>/);
  assert.match(rootIdentitySource, /AppNetworkCanaryV70/);
  assert.match(rootIdentitySource, /<AppNetworkCanaryV70 locale=\{locale\} \/>/);
  assert.match(source, /AppNetworkCanaryV69/);
  assert.match(source, /<AppNetworkCanaryV69 locale=\{locale\} \/>/);
  assert.match(v69Source, /AppNetworkCanaryV68/);
});

test('the center YOU label explicitly follows the selected locale and restores node ids after leaving root', () => {
  assert.match(source, /NETWORK_CANVAS_CONTROL_COPY\[resolvedLocale\]/);
  assert.match(source, /\.centerWrap > b,\.identity > b,\.crumbs button/);
  assert.match(source, /raw === 'YOU'/);
  assert.match(source, /if \(raw !== controls\.you\) element\.textContent = controls\.you/);
  assert.match(source, /data-v70-root-label|v70RootLabel/);
  assert.match(source, /delete element\.dataset\.v65UiCopy/);
  assert.match(source, /classList\.remove\('v65LocalizedUiCopy'\)/);
  assert.match(controlCopySource, /ko:\s*\{ you: '나'/);
});

test('top identity row keeps a deliberate logical inset and stable multilingual alignment', () => {
  assert.match(source, /\.productionNetworkCanaryV45 \.identity \{[\s\S]*?padding-inline-start:\s*6px/);
  assert.match(source, /\.productionNetworkCanaryV45 \.identity \{[\s\S]*?padding-inline-end:\s*2px/);
  assert.match(source, /\.productionNetworkCanaryV45 \.identity \{[\s\S]*?align-items:\s*baseline\s*!important/);
  assert.match(source, /\.productionNetworkCanaryV45 \.identity \{[\s\S]*?justify-content:\s*flex-start\s*!important/);
  assert.match(source, /\.identity > :is\(b, span\)[\s\S]*?white-space:\s*nowrap\s*!important/);
  assert.match(source, /data-v70-direction='rtl'\] \.identity[\s\S]*?direction:\s*rtl/);
});

test('translated toolbar and group editor controls grow vertically instead of clipping long scripts', () => {
  for (const selector of [
    '.navActions > button:not(.zoomValue)',
    '.v42GroupToolbarButton',
    '.canaryViewActions button',
    '.v42CreateButton',
    '.v42CreateActions button',
    '.v42ManageGroup',
    '.profileCard .viewNetwork',
  ]) {
    assert.ok(source.includes(selector), `missing V70 translated control coverage: ${selector}`);
  }
  assert.match(source, /height:\s*auto\s*!important/);
  assert.match(source, /min-height:\s*32px\s*!important/);
  assert.match(source, /min-height:\s*34px\s*!important/);
  assert.match(source, /white-space:\s*normal\s*!important/);
  assert.match(source, /\.v65LocalizedUiCopy::after[\s\S]*?line-height:\s*inherit\s*!important/);
});

test('group panel uses available mobile width and logical direction instead of English-only physical spacing', () => {
  assert.match(source, /inset-inline-start:\s*10px\s*!important/);
  assert.match(source, /width:\s*min\(326px, calc\(100% - 20px\)\)\s*!important/);
  assert.match(source, /margin-inline-start:\s*auto\s*!important/);
  assert.match(source, /grid-template-columns:\s*minmax\(0, 1fr\) fit-content\(104px\) 30px\s*!important/);
  assert.match(source, /\.v42SelectionCount[\s\S]*?flex-wrap:\s*wrap\s*!important/);
  assert.match(source, /@media \(max-width: 640px\)[\s\S]*?width:\s*calc\(100% - 18px\)\s*!important/);
});

test('RTL and tall-script locales get direction-aware arrows and extra vertical breathing room', () => {
  assert.match(source, /direction === 'rtl' \? '→' : '←'/);
  assert.match(source, /direction === 'rtl' \? '←' : '→'/);
  assert.match(source, /data-v70-direction='rtl'/);
  assert.match(source, /data-locale-typography='arabic'/);
  assert.match(source, /data-locale-typography='indic'/);
  assert.match(source, /html\[lang='ur'\]/);
  assert.match(source, /min-height:\s*38px\s*!important/);
});

test('Korean keeps phrase boundaries while Chinese and Japanese retain native line breaking', () => {
  assert.match(source, /html\[lang='ko'\][\s\S]*?word-break:\s*keep-all\s*!important/);
  assert.match(source, /html:is\(\[lang='zh'\],\[lang='zh-tw'\],\[lang='ja'\]\)[\s\S]*?line-break:\s*strict/);
  assert.match(source, /html:is\(\[lang='zh'\],\[lang='zh-tw'\],\[lang='ja'\]\)[\s\S]*?word-break:\s*normal\s*!important/);
  assert.doesNotMatch(source, /html:is\(\[lang='ko'\],\[lang='zh'\]/);
});

test('geometry-bound canvas labels stay one line while overlay copy can wrap safely', () => {
  for (const selector of [
    '.centerWrap > b',
    '.centerWrap > small',
    '.personNode > b',
    '.personNode > small',
    '.slotNode > b',
    '.v42GroupHub > b',
    '.v42GroupHub > small',
  ]) {
    assert.ok(source.includes(selector), `missing geometry-bound label guard: ${selector}`);
  }
  assert.match(source, /white-space:\s*nowrap\s*!important/);
  assert.match(source, /\.hint[\s\S]*?white-space:\s*normal\s*!important/);
  assert.match(source, /\.notice,[\s\S]*?\.v42Notice[\s\S]*?white-space:\s*normal\s*!important/);
});

test('V70 never takes ownership of Network geometry, persistence, rewards or pointer gestures', () => {
  for (const forbidden of [
    'localStorage',
    'sessionStorage',
    "setProperty('--x'",
    "setProperty('--y'",
    "setProperty('--gx'",
    "setProperty('--gy'",
    '--cameraX',
    '--cameraY',
    '--networkZoom',
    '--v42-group-d',
    '--v50-adjust-',
    '--v52-adjust-',
    '--v63-adjust-',
    'pointerdown',
    'pointermove',
    'pointerup',
    'fetch(',
    '/api/',
  ]) {
    assert.ok(!source.includes(forbidden), `V70 must remain presentation-only: ${forbidden}`);
  }
});
