import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  isWalletSessionMismatch,
} from '../src/lib/walletConnectionResume.ts';

const WALLET_A =
  '0x1111111111111111111111111111111111111111';
const WALLET_B =
  '0x2222222222222222222222222222222222222222';

test('A -> B and B -> A are explicit wallet mismatches while same-wallet restores are not', () => {
  assert.equal(
    isWalletSessionMismatch(WALLET_A, WALLET_B),
    true,
  );
  assert.equal(
    isWalletSessionMismatch(WALLET_B, WALLET_A),
    true,
  );
  assert.equal(
    isWalletSessionMismatch(WALLET_A, WALLET_A),
    false,
  );
  assert.equal(
    isWalletSessionMismatch(
      WALLET_A.toUpperCase(),
      WALLET_A,
    ),
    false,
  );
  assert.equal(
    isWalletSessionMismatch(null, WALLET_A),
    false,
  );
  assert.equal(
    isWalletSessionMismatch(WALLET_A, null),
    false,
  );
});

test('explicit A -> B continuation clears the old browser session but keeps B connected for verification', async () => {
  const source = await readFile(
    new URL(
      '../src/components/WalletSessionGate.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    source,
    /isWalletSessionMismatch\([\s\S]*sessionWallet,[\s\S]*walletAddress[\s\S]*\)[\s\S]*await clearWalletSession\(\);[\s\S]*await verify\(\);/,
  );
  assert.doesNotMatch(
    source,
    /const retryVerification[\s\S]*await clearWalletSession\(\);[\s\S]*await disconnect\(\);[\s\S]*await verify\(\);/,
  );
});

test('choosing another wallet waits for provider release before a fresh connect intent', async () => {
  const source = await readFile(
    new URL(
      '../src/components/WalletSessionGate.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    source,
    /const chooseAnotherWallet[\s\S]*await clearWalletSession\(\);[\s\S]*await disconnect\(\);[\s\S]*settleExplicitWalletDisconnect[\s\S]*markWalletConnectIntent\(\);[\s\S]*openConnectModal\(\);/,
  );
});

test('confirmed external VeWorld disconnect can clear a stale session after the grace window', async () => {
  const source = await readFile(
    new URL(
      '../src/components/WalletSessionGate.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    source,
    /PASSIVE_DISCONNECT_GRACE_MS\s*=\s*7_000/,
  );
  assert.match(
    source,
    /clearWalletSession\(\{[\s\S]*confirmedDisconnected:\s*true/,
  );
  assert.match(source, /'pageshow'/);
  assert.match(source, /'visibilitychange'/);
});

test('an external VeWorld account switch repairs a persistent VeChainKit/DAppKit mismatch in place', async () => {
  const source = await readFile(
    new URL(
      '../src/components/WalletProviderAccountReconciler.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  const providers = await readFile(
    new URL(
      '../src/components/AppProviders.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    source,
    /PROVIDER_MISMATCH_GRACE_MS\s*=\s*700/,
  );
  assert.match(
    source,
    /PROVIDER_REPAIR_RETRY_DELAYS_MS\s*=\s*\[0,\s*450,\s*900\]/,
  );
  assert.match(
    source,
    /connection\.isConnectedWithDappKit/,
  );
  assert.match(source, /connection\.isLoading/);
  assert.match(
    source,
    /dappWallet\s*===\s*canonicalWallet/,
  );
  assert.match(source, /await initializeAsync\(\)/);
  assert.match(
    providers,
    /<WalletProviderAccountReconciler\s*\/>/,
  );
});

test('stable provider agreement detects a stale browser session before wallet handoff verification', async () => {
  const source = await readFile(
    new URL(
      '../src/components/WalletProviderAccountReconciler.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(source, /sessionHandoffTargetRef/);
  assert.match(
    source,
    /!connection\.isConnectedWithDappKit[\s\S]*connection\.isLoading[\s\S]*dappWallet !== canonicalWallet/,
  );
  assert.match(
    source,
    /session\.authenticated !== true[\s\S]*!sessionWallet[\s\S]*sessionWallet === targetWallet/,
  );
  assert.match(
    source,
    /cancelActiveWalletAuthentication\(\)[\s\S]*dappKitSource === 'veworld'[\s\S]*markPendingVeWorldWalletHandoff[\s\S]*new Event\(WALLET_SESSION_INVALID_EVENT\)/,
  );
  assert.match(
    source,
    /Non-VeWorld DAppKit sources[\s\S]*method:\s*'DELETE'[\s\S]*new Event\(WALLET_SESSION_INVALID_EVENT\)/,
  );
  assert.doesNotMatch(
    source,
    /sessionHandoffTargetRef[\s\S]*disconnect\(\)/,
  );
});

test('provider repair leaves session destruction to the stable-provider handoff and only re-arms auth after it is safe', async () => {
  const source = await readFile(
    new URL(
      '../src/components/WalletProviderAccountReconciler.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    source,
    /fetch\('\/api\/auth\/session',[\s\S]*credentials:\s*'include'/,
  );
  assert.match(
    source,
    /session\.authenticated\s*===\s*true[\s\S]*sessionWallet[\s\S]*sessionWallet\s*!==\s*walletAddress[\s\S]*return;/,
  );
  assert.match(
    source,
    /new Event\(WALLET_SESSION_INVALID_EVENT\)/,
  );
  assert.doesNotMatch(
    source,
    /clearWalletSession|disconnect\(\)|clearPersistedVeWorldConnectionState/,
  );
});

test('stale notification 401 responses cannot invalidate the wallet that replaced the request wallet', async () => {
  const source = await readFile(
    new URL(
      '../src/components/InAppInviteNotifications.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    source,
    /activeWalletRef\.current\s*=\s*wallet;/,
  );
  assert.match(
    source,
    /const invalidateWalletSession = useCallback\(\(requestWallet: string\) => \{[\s\S]*!sameWallet\(activeWalletRef\.current, requestWallet\)[\s\S]*return;/,
  );

  const unauthorizedBlocks = source.match(
    /if \([^)]*\.status === 401\) \{[\s\S]{0,260}?invalidateWalletSession\(requestWallet\);[\s\S]{0,80}?return(?: null| false|;)/g,
  ) ?? [];

  assert.equal(
    unauthorizedBlocks.length,
    3,
    'all three notification 401 paths must be wallet-scoped',
  );
  for (const block of unauthorizedBlocks) {
    assert.match(
      block,
      /!sameWallet\(activeWalletRef\.current, requestWallet\)/,
    );
  }
});

test('invite auto-refresh cannot let an old wallet request seed the new wallet fingerprint or evidence state', async () => {
  const source = await readFile(
    new URL(
      '../src/components/InviteStatusAutoRefresh.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    source,
    /const requestWallet = walletAddress;/,
  );
  assert.match(
    source,
    /activeWalletRef\.current\s*=\s*walletAddress;/,
  );
  assert.match(
    source,
    /!data \|\|[\s\S]*activeWalletRef\.current !== requestWallet/,
  );
  assert.match(
    source,
    /activeWalletRef\.current !== requestWallet[\s\S]*const fingerprint/,
  );
  assert.match(
    source,
    /lastFingerprintRef\.current = null;[\s\S]*lastEvidenceSyncRef\.current = null;[\s\S]*checkingRef\.current = false;/,
  );
});

test('wallet language mutations are bound to the wallet that started the sync', async () => {
  const [client, route] = await Promise.all([
    readFile(
      new URL(
        '../src/components/WalletLanguagePreferenceSync.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../src/app/api/preferences/language/route.ts',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);

  assert.match(
    client,
    /body: JSON\.stringify\(\{[\s\S]*expectedWallet,[\s\S]*intent,[\s\S]*language,[\s\S]*source/,
  );
  assert.match(
    client,
    /typeof body\.walletAddress !== 'string'[\s\S]*body\.walletAddress\.toLowerCase\(\) !== walletAddress/,
  );
  assert.match(
    client,
    /cancelled \|\|[\s\S]*!isLocale\(language\)[\s\S]*applyingRemote/,
  );
  assert.match(
    route,
    /const expectedWallet =[\s\S]*body\.expectedWallet\.trim\(\)\.toLowerCase\(\)/,
  );
  assert.match(
    route,
    /requireWalletSession\(\{[\s\S]*request,[\s\S]*expectedWallet,[\s\S]*\}\)/,
  );
});

test('wallet switching re-arms readiness without replaying the global loading shield', async () => {
  const source = await readFile(
    new URL(
      '../src/components/WalletRuntimeLifecycle.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    source,
    /previousWallet === walletAddress[\s\S]*veinviteAppReady !== 'true'[\s\S]*releasedRef\.current = false;[\s\S]*startupErrorReportedRef\.current = false;/,
  );
  assert.doesNotMatch(source, /APP_LOADING_EVENT/);
  assert.doesNotMatch(
    source,
    /veinviteAppReady\s*=\s*'false'/,
  );
  assert.match(
    source,
    /veinviteAppReady\s*=\s*\n?\s*'true'[\s\S]*new Event\(APP_READY_EVENT\)/,
  );
});

test('wallet-scoped preference observers preflight the current authenticated session before protected APIs', async () => {
  const [languageClient, countryClient] = await Promise.all([
    readFile(
      new URL(
        '../src/components/WalletLanguagePreferenceSync.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../src/components/WalletCountryObservationSync.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);

  for (const source of [languageClient, countryClient]) {
    assert.match(
      source,
      /hasCurrentWalletSession[\s\S]*fetch\('\/api\/auth\/session'[\s\S]*body\.authenticated === true[\s\S]*body\.walletAddress\?\.toLowerCase\(\) === expectedWallet/,
    );
  }

  assert.match(
    languageClient,
    /await hasCurrentWalletSession\(walletAddress\)[\s\S]*if \(!sessionReady\)[\s\S]*return;[\s\S]*fetch\([\s\S]*'\/api\/preferences\/language'/,
  );
  assert.match(
    countryClient,
    /await hasCurrentWalletSession\(walletAddress\)[\s\S]*if \(!sessionReady\)[\s\S]*return;[\s\S]*await recordCountry\(walletAddress\)/,
  );
});

test('country observation is server-bound to the wallet that initiated the request', async () => {
  const [client, route] = await Promise.all([
    readFile(
      new URL(
        '../src/components/WalletCountryObservationSync.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../src/app/api/preferences/country/route.ts',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);

  assert.match(
    client,
    /body: JSON\.stringify\(\{ expectedWallet \}\)/,
  );
  assert.match(route, /WALLET_PATTERN/);
  assert.match(
    route,
    /const expectedWallet =[\s\S]*body\.expectedWallet\.trim\(\)\.toLowerCase\(\)/,
  );
  assert.match(
    route,
    /requireWalletSession\(\{[\s\S]*request,[\s\S]*expectedWallet,[\s\S]*\}\)/,
  );
});


test('stale A -> B VeWorld handoff keeps A session until one combined B proof prompt', async () => {
  const [reconciler, authHook, coordinator] = await Promise.all([
    readFile(
      new URL(
        '../src/components/WalletProviderAccountReconciler.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../src/hooks/useWalletAuthentication.ts',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../src/lib/walletAuthenticationCoordinator.ts',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);

  assert.match(
    coordinator,
    /pendingVeWorldHandoff[\s\S]*markPendingVeWorldWalletHandoff[\s\S]*isPendingVeWorldWalletHandoff[\s\S]*clearPendingVeWorldWalletHandoff/,
  );
  assert.match(
    reconciler,
    /sessionWallet === targetWallet[\s\S]*cancelActiveWalletAuthentication\(\)[\s\S]*dappKitSource === 'veworld'[\s\S]*markPendingVeWorldWalletHandoff\([\s\S]*targetWallet,[\s\S]*Date\.now\(\) \+ VEWORLD_HANDOFF_STABILITY_MS[\s\S]*WALLET_SESSION_INVALID_EVENT[\s\S]*return;/,
  );

  const veworldBranch = reconciler.slice(
    reconciler.indexOf("if (dappKitSource === 'veworld')"),
    reconciler.indexOf('// Non-VeWorld DAppKit sources'),
  );
  assert.doesNotMatch(veworldBranch, /method:\s*'DELETE'/);
  assert.doesNotMatch(reconciler, /connectV2\(null\)/);

  assert.match(
    authHook,
    /if \(isVeWorldHandoff\) \{[\s\S]*await connectV2\(typedData\)[\s\S]*\} else \{[\s\S]*await requestTypedData\(/,
  );
});

test('VeWorld external handoff waits for the signer transport stability window before any proof prompt', async () => {
  const [reconciler, authHook, coordinator] = await Promise.all([
    readFile(
      new URL(
        '../src/components/WalletProviderAccountReconciler.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../src/hooks/useWalletAuthentication.ts',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../src/lib/walletAuthenticationCoordinator.ts',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);

  assert.match(
    reconciler,
    /VEWORLD_HANDOFF_STABILITY_MS\s*=\s*10_000/,
  );
  assert.match(
    reconciler,
    /markPendingVeWorldWalletHandoff\([\s\S]*targetWallet,[\s\S]*Date\.now\(\) \+ VEWORLD_HANDOFF_STABILITY_MS/,
  );
  assert.match(
    coordinator,
    /readyAt:[\s\S]*getPendingVeWorldWalletHandoffDelay[\s\S]*pendingVeWorldHandoff\.readyAt - Date\.now\(\)/,
  );

  const delayRead = authHook.indexOf(
    'getPendingVeWorldWalletHandoffDelay(',
  );
  const challenge = authHook.indexOf(
    "fetch(\n                '/api/auth/challenge'",
  );
  const handoffPrompt = authHook.indexOf(
    'await connectV2(typedData)',
  );

  assert.ok(delayRead >= 0);
  assert.ok(challenge > delayRead);
  assert.ok(handoffPrompt > challenge);
  assert.match(
    authHook,
    /if \(handoffDelay > 0\) \{[\s\S]*await wait\(handoffDelay\);[\s\S]*assertStillCurrent\(\);/,
  );
});

test('VeWorld handoff marker is created only after a confirmed stale browser session', async () => {
  const source = await readFile(
    new URL(
      '../src/components/WalletProviderAccountReconciler.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  const staleSessionCheck = source.indexOf(
    'sessionWallet === targetWallet',
  );
  const marker = source.indexOf(
    'markPendingVeWorldWalletHandoff(',
    staleSessionCheck,
  );

  assert.ok(staleSessionCheck >= 0);
  assert.ok(marker > staleSessionCheck);
});
