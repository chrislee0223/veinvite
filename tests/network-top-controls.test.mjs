import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../src/components/AppNetwork.tsx', import.meta.url), 'utf8');
const home = fs.readFileSync(new URL('../src/components/HomeClient.tsx', import.meta.url), 'utf8');
const hub = fs.readFileSync(new URL('../src/components/AppNetworkHub.tsx', import.meta.url), 'utf8');

test('Network keeps only a compact total metric in the utility row and floats search over the canvas', () => {
  const utility = source.indexOf('className="networkUtilityRow"');
  const searchRow = source.indexOf('className="networkSearchRow"', utility);
  const stage = source.indexOf('ref={stageRef}');
  assert.ok(utility >= 0 && searchRow > utility && stage > searchRow);
  assert.doesNotMatch(source, /className="networkHeader"/);

  const utilitySlice = source.slice(utility, searchRow);
  assert.match(utilitySlice, /className="networkIdentity"/);
  assert.doesNotMatch(utilitySlice, /<h1>/);
  assert.match(utilitySlice, /className="summaryTotal"/);
  assert.match(utilitySlice, /NETWORK_TOTAL_COPY\[locale as SupportedLocale\]/);
  assert.doesNotMatch(utilitySlice, /headerThisRound|t\.thisRound/);
  assert.match(utilitySlice, /className=\{\`searchToggle/);
  assert.match(utilitySlice, /editLayoutButton/);
  assert.match(utilitySlice, /groupsButton/);
  assert.match(utilitySlice, /viewControls/);
  assert.match(utilitySlice, /zoomByButton\(1\)/);
  assert.match(utilitySlice, /zoomByButton\(-1\)/);
  assert.doesNotMatch(utilitySlice, /className="searchField"/);

  const searchSlice = source.slice(searchRow, stage);
  assert.match(searchSlice, /className="searchWrap"/);
  assert.match(searchSlice, /className="searchField"/);
  assert.match(searchSlice, /className="searchResults"/);

  assert.match(source, /\.networkUtilityRow\{[^}]*display:flex/);
  assert.match(source, /\.networkIdentity\{[^}]*display:flex/);
  assert.match(source, /\.networkSearchRow\{[^}]*position:absolute[^}]*top:44px[^}]*inset-inline:6px/);
  assert.doesNotMatch(source, /\.networkSearchRow\{[^}]*flex:0 0 auto/);
  assert.match(source, /\.searchWrap\{[^}]*width:100%/);
  assert.match(source, /\.compactControls\{[^}]*display:flex/);
  assert.match(source, /\.layoutControls>button,\.groupMenuAnchor>button\{width:28px/);
  assert.match(source, /\.viewControls\{display:flex;align-items:center/);
  assert.match(source, /className=\{\`editLayoutButton\$\{editingLayout \? ' active' : ''\}\`\}/);
  assert.match(source, /className=\{\`groupsButton\$\{groupsOpen \|\| groupDraft \? ' active' : ''\}\`\}/);
  assert.match(source, /<LayoutControlGlyph done=\{editingLayout\} \/>/);
  assert.match(source, /<GroupsControlGlyph \/>/);
  assert.doesNotMatch(source, /'✦'|'◉'/);
  assert.match(source, /className="youControl"/);
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


test('desktop Network keeps the compact Network card without restacking the global app header', () => {
  assert.doesNotMatch(home, /@media \(min-width:561px\)/);
  assert.match(hub, /networkHubShell\{width:min\(100%,520px\)/);
  assert.doesNotMatch(source, /networkHeader\{/);
  assert.match(source, /networkUtilityRow\{[^}]*min-height:40px[^}]*padding:4px 6px/);
  assert.match(source, /networkIdentity\{[^}]*display:flex/);
  assert.match(source, /summaryTotal\{[^}]*display:flex/);
  assert.match(source, /networkSearchRow\{[^}]*position:absolute[^}]*top:44px/);
  assert.match(home, /\.topActions \{ min-width:0; display:flex; align-items:center; gap:10px; \}/);
  assert.match(home, /\.screen \{[^}]*padding:22px 16px 118px[^}]*background:radial-gradient/);
  assert.match(home, /\.screen\.networkScreen \{[^}]*height:100svh[^}]*display:flex[^}]*flex-direction:column/);
  assert.doesNotMatch(home, /\.screen\.networkScreen \{[^}]*width:/);
  assert.doesNotMatch(home, /\.screen\.networkScreen \{[^}]*margin:/);
  assert.doesNotMatch(home, /\.screen\.networkScreen \{[^}]*padding:/);
  assert.doesNotMatch(home, /networkScreen \.topBar/);
  assert.doesNotMatch(home, /networkScreen \.topActions/);
  assert.doesNotMatch(home, /networkScreen \.utilityActions/);
  assert.doesNotMatch(home, /networkScreen \.languageSelect/);
  assert.doesNotMatch(home, /networkScreen \.accountChip/);
  assert.doesNotMatch(home, /height:min\(100svh,852px\)/);
});


test('Network has one continuous canvas with no direct-node pagination', () => {
  assert.doesNotMatch(source, /EXPLORER_PAGE_SIZE/);
  assert.doesNotMatch(source, /className="pager"/);
  assert.doesNotMatch(source, /pageCount/);
  assert.doesNotMatch(source, /safePage/);
  assert.match(source, /const positionedChildren = useMemo\(\(\) => \{[\s\S]*children\.map/);
});


test('group list and group builder share the same persistent Groups toolbar anchor', () => {
  const utility = source.indexOf('className="networkUtilityRow"');
  const stage = source.indexOf('ref={stageRef}', utility);
  const utilitySlice = source.slice(utility, stage);
  assert.match(utilitySlice, /className="groupMenuAnchor"/);
  assert.match(utilitySlice, /className="groupsPanel"/);
  assert.match(utilitySlice, /className="groupBuilder"/);
  assert.doesNotMatch(utilitySlice, /groupBuilderAnchor/);
  assert.match(source, /\.groupsPanel,\.groupBuilder\{position:absolute[^}]*left:auto[^}]*right:0[^}]*top:calc\(100% \+ 7px\)[^}]*transform:none/);
  assert.doesNotMatch(source, /\.groupsPanel\{position:absolute;z-index:81;left:10px;top:50px/);
  assert.doesNotMatch(source, /\.groupBuilder\{position:absolute;z-index:82;left:10px;top:50px/);
});


test('layout edit keeps the same compact toolbar instead of spawning reset/new/cancel/save buttons', () => {
  assert.match(source, /onClick=\{editingLayout \? finishLayoutEdit : beginLayoutEdit\}/);
  assert.match(source, /editingLayout \? w\.done : w\.editLayout/);
  assert.match(source, /disabled=\{editingLayout\}/);
  assert.doesNotMatch(source, /className="resetLayoutButton"/);
  assert.doesNotMatch(source, /className="newGroupButton"/);
  assert.doesNotMatch(source, /className="cancelLayoutButton"/);
  assert.doesNotMatch(source, /className="saveLayoutButton"/);
  assert.doesNotMatch(source, /data-layout-editing='true'[^\n]*\.searchWrap\{display:none\}/);
});

test('desktop Network height cap is scoped to the Network card only', () => {
  assert.match(home, /.screen.networkScreen {[^}]*height:100svh/);
  assert.match(home, /.networkTabViewport {[^}]*flex:1 1 auto[^}]*display:flex/);
  assert.doesNotMatch(home, /@media \(min-width:561px\)/);
  assert.doesNotMatch(home, /\.networkTabViewport \{[^}]*max-height:/);
  assert.doesNotMatch(home, /height:min\(720px,calc\(100svh - 160px\)\)/);
});
