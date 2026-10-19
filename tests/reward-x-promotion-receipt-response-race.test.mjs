import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync(new URL('../src/components/RewardXPromotionPanel.tsx', import.meta.url), 'utf8');
const receiptView = readFileSync(new URL('../src/components/RewardReceiptView.tsx', import.meta.url), 'utf8');

test('switching to a different paid receipt resets the X promotion panel identity', () => {
  assert.match(receiptView, /<RewardXPromotionPanel\s+key=\{\`x-promotion-receipt:\$\{receipt\.id\}\`\}/);
  assert.match(receiptView, /inviteCode=\{receipt\.inviteCode\}/);
  assert.match(panel, /setPostUrl\(''\)/);
  assert.match(panel, /setSubmitError\(''\)/);
});

test('only the newest X promotion state response can update the receipt UI', () => {
  assert.match(panel, /const requestSequenceRef = useRef\(0\)/);
  assert.match(panel, /const requestSequence = \+\+requestSequenceRef\.current/);
  assert.match(panel, /await response\.json\(\)[\s\S]*requestSequence !== requestSequenceRef\.current\) return/);
  assert.match(panel, /requestSequence === requestSequenceRef\.current\) \{\s*setLoadError\(true\)/);
  assert.match(panel, /requestSequence === requestSequenceRef\.current\) \{\s*setLoading\(false\)/);
  assert.match(panel, /return \(\) => \{[\s\S]*requestSequenceRef\.current \+= 1/);
});

test('an old 401/403 response cannot invalidate a newer wallet session', () => {
  const staleGuard = panel.indexOf('if (requestSequence !== requestSequenceRef.current) return;');
  const unauthorizedHandler = panel.indexOf('notifyRewardClaimSessionInvalid()');
  assert.ok(staleGuard >= 0 && staleGuard < unauthorizedHandler);
});

test('status polling remains read-only; X submission still requires explicit user interaction', () => {
  const statusRead = panel.slice(panel.indexOf('const load = useCallback'), panel.indexOf('const promotion = state'));
  assert.match(statusRead, /\/api\/rewards\/x-promotion\?inviteCode=/);
  assert.doesNotMatch(statusRead, /\/api\/rewards\/x-promotion\/submit/);
  assert.doesNotMatch(statusRead, /method: 'POST'/);
  assert.match(panel, /const submitPost = useCallback/);
  assert.match(panel, /onClick=\{\(\) => void submitPost\(\)\}/);
  assert.match(panel, /Date\.now\(\) >= Date\.parse\(promotion\.postDeadlineAt\)/);
});
