import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/components/AppNetworkCanaryV75.tsx', import.meta.url), 'utf8');

test('V75 layers parent-return motion on top of the unchanged V74 stack', () => {
  assert.match(source, /import \{ AppNetworkCanaryV74 \} from '\.\/AppNetworkCanaryV74'/);
  assert.match(source, /<AppNetworkCanaryV74 locale=\{locale\} \/>/);
});

test('V75 observes only direct body additions and decorates only the preserved V73 parent overlay', () => {
  assert.match(source, /PARENT_RETURN_OVERLAY_SELECTOR = '\.productionNetworkCanaryV45\.v73ParentVisualOverlay'/);
  assert.match(source, /observer\.observe\(document\.body, \{ childList: true \}\)/);
  assert.doesNotMatch(source, /subtree:\s*true/);
  assert.match(source, /node\.matches\(PARENT_RETURN_OVERLAY_SELECTOR\)/);
  assert.match(source, /classList\.add\('v75ParentReturnMotion'\)/);
});

test('V75 animates only the scene inside the visual overlay and never rewrites live geometry or camera state', () => {
  assert.match(source, /\.productionNetworkCanaryV45\.v73ParentVisualOverlay\.v75ParentReturnMotion \.scene\{/);
  assert.match(source, /animation:v75ParentReturnReveal 1180ms both!important/);
  assert.match(source, /0%\{[\s\S]*?scale:1\.05/);
  assert.match(source, /61%\{[\s\S]*?scale:1\.003/);
  assert.match(source, /100%\{scale:1\}/);
  assert.match(source, /animation-timing-function:cubic-bezier\(\.18,\.82,\.2,1\)/);
  assert.match(source, /animation-timing-function:linear/);
  assert.doesNotMatch(source, /transform:scale/);
  assert.doesNotMatch(source, /cameraX|cameraY|--x|--y|setProperty\([^\n]*(?:camera|--x|--y)/);
});

test('V75 keeps the original roughly 720ms primary return feel while carrying only a tiny visual tail into the V73 handoff window', () => {
  assert.match(source, /1180ms/);
  assert.match(source, /61%/);
  assert.match(source, /scale:1\.003/);
  assert.doesNotMatch(source, /TRANSITION_LOCK_MS|RETURN_SETTLE|RETURN_REVEAL/);
});

test('V75 respects reduced-motion preferences', () => {
  assert.match(source, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(source, /animation:none!important/);
  assert.match(source, /scale:1!important/);
});

test('V75 is visual-only and cannot mutate app or backend state', () => {
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /supabase/i);
  assert.doesNotMatch(source, /reward/i);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /addEventListener\((?:'|\")(?:pointer|touch|wheel|click)/);
});
