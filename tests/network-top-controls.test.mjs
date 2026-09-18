import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../src/components/AppNetwork.tsx', import.meta.url), 'utf8');

test('Network search and all primary controls are grouped above the canvas', () => {
  const toolbar = source.indexOf('className="networkToolbar"');
  const controls = source.indexOf('className="networkTopControls"');
  const stage = source.indexOf('ref={stageRef}');
  assert.ok(toolbar >= 0 && controls > toolbar && stage > controls);
  assert.match(source, /networkTopControls[\s\S]*editLayoutButton[\s\S]*groupsButton[\s\S]*viewControls/);
  assert.match(source, /networkTopControls\{[^}]*display:flex/);
  assert.match(source, /\.viewControls\{position:static/);
  assert.match(source, /\.layoutControls\{position:static/);
});

test('stage does not steal pointer capture from buttons and inputs', () => {
  assert.match(source, /if \(!interactive\) \{[\s\S]*event\.currentTarget\.setPointerCapture/);
  assert.match(source, /beginWorkspaceDrag[\s\S]*event\.currentTarget\.setPointerCapture/);
  assert.match(source, /beginHoldDrag[\s\S]*event\.currentTarget\.setPointerCapture/);
});
