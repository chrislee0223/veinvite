import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [identity, myNetwork, publicNetwork, bottomNav] = await Promise.all([
  readFile('src/components/NetworkWalletIdentity.tsx', 'utf8'),
  readFile('src/components/AppNetwork.tsx', 'utf8'),
  readFile('src/components/PublicNetworkExplorer.tsx', 'utf8'),
  readFile('src/components/AppBottomNavigation.tsx', 'utf8'),
]);

test('Network wallet images cannot become native drag or iOS image-callout targets', () => {
  assert.match(identity, /pointerEvents:\s*'none'/);
  assert.match(identity, /userSelect:\s*'none'/);
  assert.match(identity, /WebkitUserSelect:\s*'none'/);
  assert.match(identity, /WebkitTouchCallout:\s*'none'/);
  assert.match(identity, /draggable=\{false\}/);
  assert.match(identity, /onDragStart=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(identity, /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/);
});

test('My Network and other-user Network both suppress native selection/callout on gesture canvases', () => {
  assert.match(
    myNetwork,
    /\.networkStage\{[^}]*touch-action:none[^}]*user-select:none[^}]*-webkit-user-select:none[^}]*-webkit-touch-callout:none/,
  );
  assert.match(
    publicNetwork,
    /\.publicStage\{[^}]*touch-action:none[^}]*user-select:none[^}]*-webkit-user-select:none[^}]*-webkit-touch-callout:none/,
  );
  assert.match(
    publicNetwork,
    /\.publicNode\{[^}]*user-select:none[^}]*-webkit-user-select:none[^}]*-webkit-touch-callout:none[^}]*touch-action:none/,
  );
  assert.match(publicNetwork, /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(publicNetwork, /onDragStart=\{\(event\) => event\.preventDefault\(\)\}/);
});

test('Network gesture hardening preserves native editing and intentional address selection', () => {
  assert.match(
    publicNetwork,
    /\.publicSearchBar>input\{[^}]*user-select:text[^}]*-webkit-user-select:text[^}]*-webkit-touch-callout:default/,
  );
  assert.match(
    publicNetwork,
    /\.profileAddress span\{[^}]*user-select:text[^}]*-webkit-user-select:text[^}]*-webkit-touch-callout:default/,
  );
  assert.match(
    myNetwork,
    /\.searchField input\{[^}]*user-select:text[^}]*-webkit-user-select:text[^}]*-webkit-touch-callout:default/,
  );
  assert.match(
    myNetwork,
    /\.groupManageTitleInput\{[^}]*user-select:text[^}]*-webkit-user-select:text[^}]*-webkit-touch-callout:default/,
  );
  assert.match(
    myNetwork,
    /\.groupBuilder>input\{[^}]*user-select:text[^}]*-webkit-user-select:text[^}]*-webkit-touch-callout:default/,
  );
  assert.match(
    myNetwork,
    /\.profileAddress\{[^}]*user-select:text[^}]*-webkit-user-select:text[^}]*-webkit-touch-callout:default/,
  );
});

test('bottom navigation cannot be text-selected or native-dragged while keeping tap gestures', () => {
  assert.match(bottomNav, /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(bottomNav, /onDragStart=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(
    bottomNav,
    /\.bottomNavigation > div \{[^}]*user-select: none;[^}]*-webkit-user-select: none;[^}]*-webkit-touch-callout: none;[^}]*touch-action: manipulation;/,
  );
  assert.match(
    bottomNav,
    /button \{[^}]*user-select: none;[^}]*-webkit-user-select: none;[^}]*-webkit-touch-callout: none;[^}]*touch-action: manipulation;/,
  );
});

test('My Network hold-drag remains attached to node pointer events', () => {
  assert.match(myNetwork, /beginHoldDrag\(/);
  assert.match(
    myNetwork,
    /onPointerDown=\{\(event\) => \{[\s\S]*beginHoldDrag\([\s\S]*childKey/,
  );
  assert.doesNotMatch(myNetwork, /\.personNode\{[^}]*pointer-events:none/);
  assert.doesNotMatch(publicNetwork, /\.publicNode\{[^}]*pointer-events:none/);
});
