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

test('V75 animates only the visual overlay and never the live scene, node geometry, or camera', () => {
  assert.match(source, /\.productionNetworkCanaryV45\.v73ParentVisualOverlay\.v75ParentReturnMotion\{/);
  assert.match(source, /transform:scale\(1\.035\)/);
  assert.match(source, /transform:scale\(1\)/);
  assert.match(source, /280ms cubic-bezier\(\.18,\.82,\.2,1\)/);
  assert.doesNotMatch(source, /\.scene\s*\{/);
  assert.doesNotMatch(source, /cameraX|cameraY|--x|--y|setProperty\([^\n]*(?:camera|--x|--y)/);
});

test('V75 respects reduced-motion preferences', () => {
  assert.match(source, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(source, /animation:none!important/);
  assert.match(source, /transform:none!important/);
});

test('V75 is visual-only and cannot mutate app or backend state', () => {
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /supabase/i);
  assert.doesNotMatch(source, /reward/i);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /addEventListener\((?:'|\")(?:pointer|touch|wheel|click)/);
});
