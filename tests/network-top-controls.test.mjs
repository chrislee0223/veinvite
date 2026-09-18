import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../src/components/AppNetwork.tsx', import.meta.url), 'utf8');
const home = fs.readFileSync(new URL('../src/components/HomeClient.tsx', import.meta.url), 'utf8');
const hub = fs.readFileSync(new URL('../src/components/AppNetworkHub.tsx', import.meta.url), 'utf8');

test('Network title is one compact row and search plus every primary control share one utility row', () => {
  const header = source.indexOf('className="networkHeader"');
  const utility = source.indexOf('className="networkUtilityRow"');
  const stage = source.indexOf('ref={stageRef}');
  assert.ok(header >= 0 && utility > header && stage > utility);

  const headerSlice = source.slice(header, utility);
  assert.match(headerSlice, /<h1>\{t\.title\}<\/h1>/);
  assert.doesNotMatch(headerSlice, />NETWORK</);

  const utilitySlice = source.slice(utility, stage);
  assert.match(utilitySlice, /searchWrap/);
  assert.match(utilitySlice, /editLayoutButton/);
  assert.match(utilitySlice, /groupsButton/);
  assert.match(utilitySlice, /viewControls/);
  assert.match(utilitySlice, /zoomByButton\(1\)/);
  assert.match(utilitySlice, /zoomByButton\(-1\)/);

  assert.match(source, /\.networkUtilityRow\{[^}]*display:flex/);
  assert.match(source, /\.compactControls\{[^}]*display:flex/);
  assert.match(source, /\.searchWrap\{[^}]*max-width:120px[^}]*flex:0 1 120px/);
  assert.match(source, /\.layoutControls button\{width:28px/);
  assert.match(source, /\.viewControls\{display:grid;grid-template-columns:repeat\(4,28px\)/);
});

test('Network canvas fills the remaining tab height instead of creating page scroll', () => {
  assert.match(home, /screen\.networkScreen \{[^}]*width:min\(100%,548px\)[^}]*height:100svh[^}]*overflow:hidden/);
  assert.match(home, /networkTabViewport \{[^}]*flex:1 1 auto[^}]*display:flex/);
  assert.match(hub, /networkHubShell\{[^}]*height:100%[^}]*min-height:0[^}]*display:flex/);
  assert.match(source, /networkCanvasPage\{[^}]*width:min\(100%,520px\)[^}]*height:100%[^}]*display:flex;flex-direction:column/);
  assert.match(source, /networkStage\{[^}]*flex:1 1 auto[^}]*min-height:0[^}]*height:auto/);
  assert.doesNotMatch(source, /networkStage\{[^}]*68vh/);
});

test('breadcrumbs move into the canvas overlay so they do not consume another permanent row', () => {
  const utility = source.indexOf('className="networkUtilityRow"');
  const stage = source.indexOf('ref={stageRef}');
  const breadcrumbs = source.indexOf('aria-label={t.directNetwork} data-no-pan="true"', stage);
  assert.ok(utility >= 0 && stage > utility && breadcrumbs > stage);
  assert.match(source, /\.breadcrumbs\{position:absolute/);
  assert.match(source, /breadcrumbs\.rootOnly\{display:none\}/);
});

test('stage does not steal pointer capture from buttons and inputs', () => {
  assert.match(source, /if \(!interactive\) \{[\s\S]*event\.currentTarget\.setPointerCapture/);
  assert.match(source, /beginWorkspaceDrag[\s\S]*event\.currentTarget\.setPointerCapture/);
  assert.match(source, /beginHoldDrag[\s\S]*event\.currentTarget\.setPointerCapture/);
});


test('desktop Network intentionally uses the same compact mobile shell', () => {
  assert.match(hub, /networkHubShell\{width:min\(100%,520px\)/);
  assert.match(source, /networkHeader\{[^}]*min-height:42px[^}]*padding:7px 9px/);
  assert.match(source, /networkUtilityRow\{[^}]*min-height:39px[^}]*padding:4px 6px/);
  assert.match(home, /networkScreen \.topActions \{[^}]*flex-direction:column-reverse/);
  assert.match(home, /networkScreen \.languageSelect \{[^}]*height:34px/);
  assert.match(home, /networkScreen \.accountChip \{[^}]*min-height:34px/);
});


test('Network has one continuous canvas with no direct-node pagination', () => {
  assert.doesNotMatch(source, /EXPLORER_PAGE_SIZE/);
  assert.doesNotMatch(source, /className="pager"/);
  assert.doesNotMatch(source, /pageCount/);
  assert.doesNotMatch(source, /safePage/);
  assert.match(source, /const positionedChildren = useMemo\(\(\) => \{[\s\S]*children\.map/);
});
