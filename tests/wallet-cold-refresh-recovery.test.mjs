import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveColdRestoreWallet as decide } from '../src/lib/walletColdRestorePolicy.ts';

const [policy, resume, gate, prompt, shield] = await Promise.all([
  readFile(new URL('../src/lib/walletColdRestorePolicy.ts',import.meta.url),'utf8'),
  readFile(new URL('../src/components/WalletConnectionResume.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/components/WalletSessionGate.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/components/WalletRestorePrompt.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/components/LocaleHydrationShield.tsx',import.meta.url),'utf8'),
]);

const A='0x'+'a'.repeat(40),B='0x'+'b'.repeat(40);

test('cold restore requires existing verified session and same provider identity',()=>{
  assert.equal(decide({bootstrapWallet:A,veChainKitWallet:null,dappKitWallet:A,persistedDappKitWallet:null}),A);
  assert.equal(decide({bootstrapWallet:A,veChainKitWallet:null,dappKitWallet:null,persistedDappKitWallet:A}),A);
  assert.equal(decide({bootstrapWallet:A.toUpperCase().replace('0X','0x'),veChainKitWallet:null,dappKitWallet:A,persistedDappKitWallet:null}),A);
  assert.equal(decide({bootstrapWallet:null,veChainKitWallet:null,dappKitWallet:A,persistedDappKitWallet:A}),null);
  assert.equal(decide({bootstrapWallet:A,veChainKitWallet:null,dappKitWallet:B,persistedDappKitWallet:null}),null);
  assert.equal(decide({bootstrapWallet:A,veChainKitWallet:null,dappKitWallet:null,persistedDappKitWallet:B}),null);
  assert.equal(decide({bootstrapWallet:A,veChainKitWallet:B,dappKitWallet:A,persistedDappKitWallet:A}),null);
  assert.equal(decide({bootstrapWallet:'not-wallet',veChainKitWallet:null,dappKitWallet:A,persistedDappKitWallet:A}),null);
});

test('PC reload reinitializes SDK without the mobile wallet-return precondition',()=>{
  assert.match(resume,/\[data-veinvite-session-bootstrap\]/);
  assert.match(resume,/getAttribute\('data-veinvite-session-bootstrap'\) === 'verified'/);
  assert.match(resume,/resolveColdRestoreWallet\(\{/);
  assert.match(resume,/runWalletProviderReconciliation\(/);
  assert.match(resume,/await initializeAsyncRef\.current\(\)/);
  assert.match(resume,/cold bootstrap exactly once per mount/);
  assert.match(resume,/window\.setTimeout\(\(\) => void restore\(0\), 850\)/);
  assert.match(resume,/startOnVerifiedBootstrap\(20\)/);
  assert.match(resume,/startOnVerifiedBootstrap\(checksRemaining - 1\)/);
  assert.match(resume,/getAttribute\('data-veinvite-session-bootstrap'\) === 'verified'/);
  assert.match(resume,/if \(!match\) return/);
  assert.doesNotMatch(policy,/getWalletSession\(|verify\(|revokeWalletSession|delete\(/);
});

test('persistent provider gaps surface reconnect instead of a dead Retry reload',()=>{
  assert.match(gate,/setRestoreTimedOut\(true\)/);
  assert.match(gate,/9_000/);
  assert.match(gate,/return \(\s*<WalletRestorePrompt/);
  assert.match(gate,/markWalletConnectIntent\(\);\s*openConnectModal\(\)/);
  assert.match(prompt,/data-veinvite-wallet-session-gate="interactive"/);
  assert.match(prompt,/data-veinvite-cold-wallet-restore="stalled"/);
  assert.match(prompt,/onClick=\{onReconnect\}/);
  assert.doesNotMatch(prompt,/location\.reload\s*\(|setSessionCookie\s*\(|authenticateWallet\s*\(/);
  assert.match(shield,/hasInteractiveStartupGate\(\)/);
});

test('signed ownership and restriction checks remain a separate Home authority',()=>{
  assert.match(gate,/await ensureWalletSession\(walletAddress\)/);
  assert.match(gate,/const activeRestriction = await readWalletRestriction\(\)/);
  assert.match(gate,/state === 'verified' &&\s*verifiedWallet === walletAddress/);
  assert.match(gate,/if \(!walletAddress\) \{/);
});
