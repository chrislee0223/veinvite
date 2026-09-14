import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [source, copySource, v44Source] = await Promise.all([
  readFile('src/components/AppNetworkCanaryV65.tsx', 'utf8'),
  readFile('src/lib/i18n/networkCanaryUiCopy.ts', 'utf8'),
  readFile('src/qa/QaNetworkRadialPlaygroundV44.tsx', 'utf8'),
]);

test('Network canary UI copy is exhaustive for SupportedLocale and includes reviewed Korean copy', () => {
  assert.match(copySource, /satisfies Record<SupportedLocale, NetworkCanaryUiCopy>/);
  assert.match(copySource, /ko:\s*\{[\s\S]*?groups:'그룹'/);
  assert.match(copySource, /myGroups:'내 그룹'/);
  assert.match(copySource, /createGroup:'그룹 만들기'/);
  assert.match(copySource, /editLayout:'배치 편집'/);
  assert.match(copySource, /fit:'화면 맞춤'/);
  assert.match(copySource, /available:'초대 가능'/);
  assert.match(copySource, /hintView:'노드를 길게 눌러 편집 · 화면 드래그 · 핀치로 확대\/축소'/);
});

test('V65 localizes the visible top controls, canvas labels and complete Groups flow', () => {
  for (const selector of [
    '.v42GroupToolbarButton',
    '.canaryViewActions button',
    '.navActions > button',
    '.identity span',
    '.centerWrap small',
    '.personNode small',
    '.slotNode b',
    '.profileCard .viewNetwork',
    '.hint',
    '.v42PanelHead b',
    '.v42GroupRowMain small',
    '.v42SelectionCount span',
    '.v42CreateActions button',
    '.v44NewGroupDrop',
    '.v44CreateDropMore',
    '.v42GroupHub small',
    '.v42RemoveZone',
    '.v42Notice',
  ]) {
    assert.ok(source.includes(selector), `missing localization coverage for ${selector}`);
  }
  assert.match(source, /NETWORK_CANVAS_CONTROL_COPY/);
  assert.match(source, /NETWORK_EXPERIENCE_COPY/);
  assert.match(source, /NETWORK_EXPLORE_COPY/);
  assert.match(source, /NETWORK_COPY/);
  assert.match(source, /Intl\.NumberFormat\(resolvedLocale\)/);
});

test('localization preserves mature V44 English interaction semantics behind localized presentation', () => {
  assert.match(v44Source, /heading\.startsWith\('Create group'\)/);
  assert.match(v44Source, /buttonText\(button\) !== 'Create'/);
  assert.match(v44Source, /text === 'Save changes'/);
  assert.match(v44Source, /text === 'Cancel'/);

  assert.match(source, /data-v65-ui-copy/);
  assert.match(source, /v65LocalizedUiCopy/);
  assert.match(source, /content:\s*attr\(data-v65-ui-copy\)/);
  assert.match(source, /source text untouched/);
  assert.doesNotMatch(source, /querySelectorAll<HTMLElement>\('\.v42GroupRowMain b'\)\.forEach/);
});

test('user-created names and wallet labels remain data, while only surrounding UI copy is localized', () => {
  assert.match(source, /interaction\.alreadyIn\(name\)/);
  assert.match(source, /`\$\{interaction\.moved\} · \$\{name\}`/);
  assert.match(source, /`\$\{interaction\.added\} · \$\{name\}`/);
  assert.match(source, /`✓ \$\{match\[1\]\} ·/);
  assert.match(source, /textContent\?\.trim\(\) === 'YOU'/);
});

test('localized copy keeps RTL/script direction and avoids changing persistence or Network geometry', () => {
  assert.match(source, /getLocaleDirection\(resolvedLocale\)/);
  assert.match(source, /element\.dir = direction/);
  assert.doesNotMatch(source, /localStorage\.setItem|sessionStorage\.setItem/);
  assert.doesNotMatch(source, /--cameraX|--cameraY|--networkZoom/);
  assert.doesNotMatch(source, /--v42-group-d[xy]|--v50-(?:adjust|drag)-[dxy]|--v52-(?:adjust|drag)-[dxy]|--v63-(?:adjust|drag)-[xy]/);
});
