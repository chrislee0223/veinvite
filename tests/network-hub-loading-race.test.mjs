import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hub = readFileSync(
  new URL('../src/components/AppNetworkHub.tsx', import.meta.url),
  'utf8',
);

test('Network hub tracks the active wallet across asynchronous loading work', () => {
  assert.match(hub, /useRef,/);
  assert.match(
    hub,
    /const activeWalletRef = useRef<string \| null>\(wallet\);\s*activeWalletRef\.current = wallet;/,
  );
  assert.match(
    hub,
    /function sameWallet\(left: string \| null, right: string \| null\): boolean/,
  );
});

test('summary seed is reused immediately and refreshed without returning to the visible loading card', () => {
  assert.match(hub, /getCachedNetworkSummary\(wallet\)/);
  assert.match(
    hub,
    /const \[probeState, setProbeState\][\s\S]*initialProbe \? 'ready' : 'idle'/,
  );
  assert.match(
    hub,
    /const cached = getCachedNetworkSummary\(wallet\);[\s\S]*setProbe\(cached\);[\s\S]*setProbeState\('ready'\);/,
  );
  assert.match(
    hub,
    /probeState === 'loading' \|\| probeState === 'idle'[\s\S]*networkHubPending/,
  );
  assert.doesNotMatch(
    hub,
    /probeState === 'loading' \|\| probeState === 'idle'[\s\S]{0,220}<StateCard title=\{t\.title\} description=\{t\.directNetwork\}/,
  );
});

test('summary retry cannot commit a response for a wallet that is no longer active', () => {
  assert.match(
    hub,
    /const requestWallet = wallet;[\s\S]*fetchSummary\(requestWallet, signal\)[\s\S]*!sameWallet\(activeWalletRef\.current, requestWallet\)/,
  );
  assert.match(
    hub,
    /rememberNetworkSummary\(requestWallet, data\);[\s\S]*setProbe\(data\);[\s\S]*setProbeState\('ready'\)/,
  );
  assert.match(
    hub,
    /catch \(error\) \{[\s\S]*!sameWallet\(activeWalletRef\.current, requestWallet\)[\s\S]*NETWORK_DISABLED/,
  );
});

test('a transient refresh failure preserves a valid cached Network summary', () => {
  assert.match(
    hub,
    /if \(cachedBefore\) \{\s*setProbe\(cachedBefore\);\s*setProbeState\('ready'\);\s*return;\s*\}/,
  );
});

test('visibility reads and writes ignore late results after a wallet change', () => {
  assert.match(
    hub,
    /fetchVisibility\(signal\)[\s\S]*!sameWallet\(activeWalletRef\.current, requestWallet\)[\s\S]*setVisibility\(data\)/,
  );
  assert.match(
    hub,
    /const saved = await saveVisibility\(next\);\s*if \(!sameWallet\(activeWalletRef\.current, requestWallet\)\) return;/,
  );
  assert.match(
    hub,
    /const confirmed = await fetchVisibility\(\);\s*if \(!sameWallet\(activeWalletRef\.current, requestWallet\)\) return;/,
  );
});

test('wallet changes clear stale visibility saving UI immediately', () => {
  assert.match(
    hub,
    /setVisibilityOpen\(false\);\s*setVisibilitySaving\(false\);/,
  );
  assert.match(
    hub,
    /finally \{\s*if \(sameWallet\(activeWalletRef\.current, requestWallet\)\) \{\s*setVisibilitySaving\(false\);/,
  );
});
