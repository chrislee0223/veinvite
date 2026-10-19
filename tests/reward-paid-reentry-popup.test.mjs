import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const syncSource = readFileSync(
  new URL('../src/components/PaidActivationLiveSync.tsx', import.meta.url),
  'utf8',
);
const hookSource = readFileSync(
  new URL('../src/hooks/useRewardPaidTransientFeedback.ts', import.meta.url),
  'utf8',
);
const toastSource = readFileSync(
  new URL('../src/lib/notifications/rewardPaidToast.ts', import.meta.url),
  'utf8',
);
const receiptRoute = readFileSync(
  new URL('../src/app/api/rewards/receipts/route.ts', import.meta.url),
  'utf8',
);

function toastHarness({ denyStorage = false } = {}) {
  const data = new Map();
  const handlers = new Map();
  const events = [];
  const storage = {
    getItem: (key) => {
      if (denyStorage) throw new Error('WebView storage forbidden');
      return data.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (denyStorage) throw new Error('WebView storage forbidden');
      data.set(key, value);
    },
    removeItem: (key) => {
      if (denyStorage) throw new Error('WebView storage forbidden');
      data.delete(key);
    },
  };
  const window = {
    sessionStorage: storage,
    addEventListener: (type, handler) => {
      const group = handlers.get(type) ?? new Set();
      group.add(handler);
      handlers.set(type, group);
    },
    removeEventListener: (type, handler) => handlers.get(type)?.delete(handler),
    dispatchEvent: (event) => {
      events.push(event.type);
      for (const handler of handlers.get(event.type) ?? []) handler(event);
    },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(toastSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  runInNewContext(code, {
    module,
    exports: module.exports,
    window,
    Event: class {
      constructor(type) { this.type = type; }
    },
  });
  return { ...module.exports, data, events };
}

function receipt(id, wallet, seen = false) {
  return {
    id: String(id),
    inviteCode: 'ABC2345',
    recipientWallet: wallet,
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    seen,
  };
}

test('paid popup restoration uses authenticated, server-owned unseen receipt state after app-ready gate', () => {
  assert.match(syncSource, /fetch\('\/api\/rewards\/receipts\?limit=50'[\s\S]*cache: 'no-store'/);
  assert.match(receiptRoute, /requireWalletSession\(\{ request \}\)/);
  assert.match(receiptRoute, /\.eq\('recipient_wallet', walletAddress\)/);
  assert.match(receiptRoute, /latestUnseen/);
  assert.match(syncSource, /latestUnseen: body\.latestUnseen \?\? null/);
  assert.match(syncSource, /if \(!initializedRef\.current\)[\s\S]*\.filter\(\(receipt\) => !receipt\.seen\)[\s\S]*storeRewardPaidToast\(receipt\)/);
  assert.match(syncSource, /if \(receipt\.seen\) \{\s*clearRewardPaidToast/);
  assert.match(syncSource, /const targetReceipts = snapshot\.receipts\.filter\(\(receipt\) =>\s*!receipt\.seen/);
  assert.doesNotMatch(syncSource, /method:\s*'POST'/);
});

test('the paid toast hook receives late wallet-scoped receipt restoration without payout mutation', () => {
  assert.match(hookSource, /window\.addEventListener\(REWARD_PAID_TOAST_UPDATED_EVENT, onQueueUpdated\)/);
  assert.match(hookSource, /setPendingReward\(readRewardPaidToast\(wallet\)\)/);
  assert.match(hookSource, /window\.removeEventListener\(REWARD_PAID_TOAST_UPDATED_EVENT, onQueueUpdated\)/);
  assert.match(hookSource, /ACKNOWLEDGE_REWARD_RECEIPT/);
  assert.match(hookSource, /promotion\?\.state === 'OPEN'/);
  assert.match(hookSource, /body\.promotionPending !== true/);
});

test('fresh wallet restoration sends one queue signal and rejects duplicate receipt IDs', () => {
  const h = toastHarness();
  const alice = '0x' + 'a'.repeat(40);
  const bob = '0x' + 'b'.repeat(40);
  h.storeRewardPaidToast(receipt(41, alice));
  h.storeRewardPaidToast(receipt(41, alice));
  assert.equal(h.readRewardPaidToast(alice).receiptId, '41');
  assert.equal(h.readRewardPaidToast(bob), null);
  assert.equal(
    h.events.filter((type) => type === h.REWARD_PAID_TOAST_UPDATED_EVENT).length,
    1,
  );
  h.storeRewardPaidToast(receipt(42, bob));
  assert.equal(h.readRewardPaidToast(bob).receiptId, '42');
  assert.equal(h.readRewardPaidToast(alice).receiptId, '41');
  h.clearRewardPaidToast(alice, '41');
  assert.equal(h.readRewardPaidToast(alice), null);
  assert.equal(h.readRewardPaidToast(bob).receiptId, '42');
  const afterClear = h.events.length;
  h.clearRewardPaidToast(alice, '41');
  assert.equal(h.events.length, afterClear, 'already-acknowledged receipt must not resignal');
});

test('one confirmed receipt can be restored from a new browser session and cleared only on confirmation', () => {
  const wallet = '0x' + 'c'.repeat(40);
  const firstSession = toastHarness();
  firstSession.storeRewardPaidToast(receipt(54, wallet));
  firstSession.clearRewardPaidToast(wallet, '54');
  assert.equal(firstSession.readRewardPaidToast(wallet), null);

  const nextSession = toastHarness();
  assert.equal(nextSession.readRewardPaidToast(wallet), null, 'new session starts with no transient cache');
  // PaidActivationLiveSync uses the server-backed unseen receipt on its initial poll.
  nextSession.storeRewardPaidToast(receipt(55, wallet));
  assert.equal(nextSession.readRewardPaidToast(wallet).receiptId, '55');
  nextSession.clearRewardPaidToast(wallet, '55');
  assert.equal(nextSession.readRewardPaidToast(wallet), null);
});


test('private WebView storage denial still displays and acknowledges wallet-scoped paid popups', () => {
  const h = toastHarness({ denyStorage: true });
  const alice = '0x' + 'a'.repeat(40);
  const bob = '0x' + 'b'.repeat(40);
  h.storeRewardPaidToast(receipt(54, alice));
  h.storeRewardPaidToast(receipt(55, alice));
  h.storeRewardPaidToast(receipt(56, bob));
  assert.equal(h.readRewardPaidToast(alice).receiptId, '54');
  assert.equal(h.readRewardPaidToast(bob).receiptId, '56');
  h.clearRewardPaidToast(alice, '54');
  assert.equal(h.readRewardPaidToast(alice).receiptId, '55');
  assert.equal(h.readRewardPaidToast(bob).receiptId, '56');
  h.clearRewardPaidToast(alice, '55');
  h.clearRewardPaidToast(bob, '56');
  assert.equal(h.readRewardPaidToast(alice), null);
  assert.equal(h.readRewardPaidToast(bob), null);
  assert.equal(h.data.size, 0, 'denied storage is never relied upon');
  assert.equal(h.events.filter((kind) => kind === h.REWARD_PAID_TOAST_UPDATED_EVENT).length, 6);
});
