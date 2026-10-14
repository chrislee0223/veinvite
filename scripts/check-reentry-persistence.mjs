import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');
const failures = [];

const legalGate = read('src/components/LegalConsentGate.tsx');
const legalRoute = read('src/app/api/legal/consent/route.ts');
const legalMigration = read('supabase/migrations/20260901110000_persist_wallet_legal_consent.sql');
const languageSync = read('src/components/WalletLanguagePreferenceSync.tsx');
const languageRoute = read('src/app/api/preferences/language/route.ts');
const languageMigration = read('supabase/migrations/20260901112500_persist_wallet_language_preference.sql');
const appProviders = read('src/components/AppProviders.tsx');
const rootLayout = read('src/app/layout.tsx');
const homePage = read('src/app/page.tsx');
const walletBootstrapServer = read('src/lib/walletSessionBootstrapServer.ts');
const hydrationShield = read('src/components/LocaleHydrationShield.tsx');
const walletRuntime = read('src/components/WalletRuntimeLifecycle.tsx');
const homeStartupReadiness = read('src/lib/homeStartupReadiness.ts');
const walletControl = read('src/components/WalletControl.tsx');
const walletAuth = read('src/hooks/useWalletAuthentication.ts');
const walletSessionGate = read('src/components/WalletSessionGate.tsx');
const walletResumeState = read('src/lib/walletConnectionResume.ts');
const walletAuthServer = read('src/lib/walletAuthServer.ts');
const walletSessionRoute = read('src/app/api/auth/session/route.ts');
const walletVerifyRoute = read('src/app/api/auth/verify/route.ts');
const notifications = read('src/components/InAppInviteNotifications.tsx');
const notificationHistoryRoute = read('src/app/api/notifications/history/route.ts');
const migrationManifest = read('supabase/production-migration-manifest.txt');

if (!/wallet_legal_consents/.test(legalMigration) || !/enable row level security/i.test(legalMigration)) {
  failures.push('Legal consent must remain persisted server-side behind RLS.');
}
if (!/requireWalletSession/.test(legalRoute) || !/requestHasSameOrigin/.test(legalRoute)) {
  failures.push('Legal consent reads/writes must remain bound to the verified wallet and same-origin mutations.');
}
if (!/fetch\(\s*['"]\/api\/legal\/consent['"]/.test(legalGate) || !/result\.accepted/.test(legalGate)) {
  failures.push('The legal-consent gate must resolve current acceptance from the server before prompting again.');
}
if (!/state\s*===\s*['"]checking['"]/.test(legalGate) || /t\.checkingTitle|t\.checkingDescription/.test(legalGate)) {
  failures.push('Routine legal-consent checks must stay visually quiet and must not surface a checking-status dialog.');
}
if (!/20260901110000_persist_wallet_legal_consent\.sql/.test(migrationManifest)) {
  failures.push('The production migration manifest must retain the legal-consent persistence migration.');
}

if (!/wallet_preferences/.test(languageMigration) || !/enable row level security/i.test(languageMigration)) {
  failures.push('Wallet language preference must remain persisted server-side behind RLS.');
}
if (!/requireWalletSession/.test(languageRoute) || !/requestHasSameOrigin/.test(languageRoute)) {
  failures.push('Language preference reads/writes must remain wallet-session bound and same-origin protected.');
}
if (!/\/api\/preferences\/language/.test(languageSync) || !/WalletLanguagePreferenceSync/.test(appProviders)) {
  failures.push('The app must restore and persist wallet language preferences across WebView storage resets.');
}
if (!/20260901112500_persist_wallet_language_preference\.sql/.test(migrationManifest)) {
  failures.push('The production migration manifest must retain the language-preference persistence migration.');
}

if (
  !/WALLET_TRANSPORT_SETTLE_MS\s*=\s*900/.test(walletResumeState) ||
  !/WALLET_RELEASE_TIMEOUT_MS\s*=\s*3_000/.test(walletResumeState) ||
  !/settleExplicitWalletDisconnect/.test(walletControl) ||
  !/isWalletActionPending/.test(walletControl)
) {
  failures.push('Wallet logout/switch must keep the shared transport-settle guard that prevents reconnect races.');
}
// Mobile wallet prompts can remain alive after an app-side timeout.
// A Promise.race timeout on a wallet-owned signature must never release the
// global signing lock while its SDK prompt can still resolve. Instead, show
// a non-terminal slow status and allow confirmed disconnect to release the
// stale proof. Network/provider waits remain time-bounded separately.
if (
  !/signature\s*=\s*await signMessage\(\s*challenge\.message,\s*\);/.test(walletAuth) ||
  /await withTimeout\(\s*signMessage\(/.test(walletAuth) ||
  !/waitForWalletProviderReconciliation\(\)/.test(walletAuth) ||
  !/AbortController/.test(walletAuth) ||
  !/WALLET_AUTH_SLOW_NOTICE_MS\s*=\s*45_000/.test(walletSessionGate) ||
  !/setState\('slow'\)/.test(walletSessionGate) ||
  !/releaseCancelledWalletAuthenticationAfterDisconnect\(\)/.test(walletSessionGate)
) {
  failures.push('Wallet-owned signing must hold its lock until settlement or confirmed disconnect; after 45 seconds the UI may only show a slow state.');
}
if (!/credentials:\s*['"]include['"]/.test(walletAuth) || !/persistedSession\.authenticated/.test(walletAuth)) {
  failures.push('Wallet authentication must explicitly include browser credentials and verify that the issued session cookie was retained.');
}
if (!/disconnectFromVerification/.test(walletSessionGate) || !/t\.disconnectWallet/.test(walletSessionGate)) {
  failures.push('The wallet verification gate must retain a visible disconnect recovery path.');
}
if (
  /addEventListener\(\s*['"](?:pagehide|pageshow)['"]/.test(walletSessionGate) ||
  /PASSIVE_DISCONNECT_GRACE_MS|confirmedDisconnected:\s*true/.test(walletSessionGate)
) {
  failures.push('Page refresh/navigation/provider visibility must never itself revoke the persistent wallet session.');
}
if (
  !/CONFIRMED_SDK_DISCONNECT_MS\s*=\s*20_000/.test(walletSessionGate) ||
  !/addEventListener\(\s*'wallet_disconnected'/.test(walletSessionGate) ||
  !/providerStateRef\.current\.isLoading/.test(walletSessionGate) ||
  !/providerStateRef\.current\.dappWallet/.test(walletSessionGate) ||
  !/readPersistedDappKitAccount\(\)/.test(walletSessionGate) ||
  !/isWalletAuthenticationInProgress\(\)/.test(walletSessionGate) ||
  !/X-VeInvite-Session-Handoff-Wallet': formerWallet/.test(walletSessionGate)
) {
  failures.push('Provider disconnect must wait for settled two-provider evidence and retire only the former verified wallet session.');
}
if (!/initialSessionWallet/.test(walletSessionGate) || !/autoAttemptedWalletRef\s*=\s*useRef<string \| null>\(initialWallet\)/.test(walletSessionGate)) {
  failures.push('A server-validated wallet session must bootstrap the client gate so refresh does not request another phone signature.');
}
if (!/veinvite-wallet-session-cleared/.test(walletSessionGate) || !/veinvite-wallet-session-cleared/.test(walletAuth)) {
  failures.push('Explicit wallet logout/switch must remain distinguishable from passive provider disconnect churn.');
}
if (
  /SESSION_CHECK_SURFACE_DELAY_MS|showCheckingSurface/.test(walletSessionGate) ||
  !/state === 'idle' \|\| state === 'checking'/.test(walletSessionGate) ||
  !/<Brand compact \/>/.test(walletSessionGate)
) {
  failures.push('Wallet verification must keep the branded VeInvite start surface stable throughout routine checking and signing instead of flashing a checking-status dialog.');
}
if (!/\/api\/auth\/session/.test(walletAuth) || !/session\.authenticated/.test(walletAuth)) {
  failures.push('Wallet authentication must reuse a valid existing server session before requesting a fresh wallet signature.');
}
if (
  !/readWalletSessionBootstrap/.test(homePage) ||
  !/initialSessionWallet/.test(homePage) ||
  !/cookies\(\)/.test(walletBootstrapServer) ||
  !/getWalletSessionFromTokens/.test(walletBootstrapServer)
) {
  failures.push('The home page must validate the persistent wallet session server-side before the client wallet provider reconnects.');
}
if (!/data-veinvite-session-bootstrap/.test(homePage)) {
  failures.push('The startup coordinator must receive a non-secret server-session bootstrap marker so it can suppress a disconnected-home flash during wallet restoration.');
}
if (!/getAll\(name\)/.test(walletAuthServer) || !/getWalletSessionFromTokens/.test(walletAuthServer)) {
  failures.push('Wallet-session lookup must tolerate duplicate/stale cookie headers and select a valid unrevoked session token.');
}
if (!/__Host-veinvite_session/.test(walletAuthServer) || !/WALLET_SESSION_COOKIE_NAME/.test(walletVerifyRoute) || !/maxAge:\s*SESSION_LIFETIME_SECONDS/.test(walletVerifyRoute)) {
  failures.push('Production wallet sessions must use the hardened persistent host-only cookie contract.');
}
if (!/getWalletSessionCookieCount/.test(walletSessionRoute) || !/LEGACY_WALLET_SESSION_COOKIE_NAME/.test(walletSessionRoute)) {
  failures.push('Wallet-session diagnostics and explicit logout must safely handle current and legacy session cookies.');
}

if (!/SLIDING_SESSION_LIFETIME_DAYS\s*=\s*30/.test(walletSessionRoute) || !/SLIDING_SESSION_LIFETIME_SECONDS/.test(walletSessionRoute) || !/export async function POST/.test(walletSessionRoute)) {
  failures.push('A valid wallet session must support the reviewed 30-day sliding renewal window.');
}
if (!/x-veinvite-session-intent/.test(walletSessionRoute) || !/SESSION_RENEWAL_INTENT\s*=\s*['"]renew['"]/.test(walletSessionRoute) || !/session\.walletAddress\s*!==\s*expectedWallet/.test(walletSessionRoute)) {
  failures.push('Sliding renewal must require the reviewed renewal intent and must never extend a session for a different connected wallet.');
}
if (!/\.update\(\{[\s\S]*expires_at:[\s\S]*newExpiresAt/.test(walletSessionRoute) || !/maxAge:\s*SLIDING_SESSION_LIFETIME_SECONDS/.test(walletSessionRoute) || !/setSessionCookie/.test(walletSessionRoute)) {
  failures.push('Sliding renewal must extend both the server-side expiry and hardened browser cookie to the same 30-day horizon.');
}
if (!/readWalletSessionTokens/.test(walletSessionRoute) || !/hashSessionToken/.test(walletSessionRoute) || !/token_hash/.test(walletSessionRoute)) {
  failures.push('Sliding renewal must preserve the exact validated session token even when duplicate or legacy cookie headers are present.');
}
if (!/method:\s*['"]POST['"]/.test(walletRuntime) || !/X-VeInvite-Session-Intent/.test(walletRuntime) || !/credentials:\s*['"]include['"]/.test(walletRuntime)) {
  failures.push('Normal app re-entry must silently request sliding renewal with credentials and the reviewed renewal intent.');
}
if (!/veinvite-wallet-session-ready/.test(walletRuntime) || !/renewSession/.test(walletRuntime) || !/RENEWAL_DEDUPE_MS/.test(walletRuntime)) {
  failures.push('A first successful wallet proof and routine re-entry must both feed the bounded, deduplicated silent-renewal path.');
}
if (/\/api\/auth\/challenge|\/api\/auth\/verify|\/api\/legal\/consent/.test(walletRuntime)) {
  failures.push('Routine sliding renewal must not request another wallet proof or legal re-consent.');
}

if (!/veinvite-provider-ready/.test(appProviders) || !/veinvite-provider-ready/.test(hydrationShield)) {
  failures.push('Provider readiness must remain distinct from final home readiness so the startup shield is not released before wallet restoration settles.');
}
if (/veinvite-app-ready/.test(appProviders)) {
  failures.push('AppProviders must not publish final app readiness immediately when the wallet provider first mounts.');
}
if (!/veinvite-app-ready/.test(walletRuntime) || !/veinvite-app-ready/.test(hydrationShield)) {
  failures.push('The home startup shield must release only from the wallet/session lifecycle final-readiness signal.');
}
if (!/HOME_STARTUP_STATE_EVENT/.test(walletRuntime) || !/readPublishedHomeStartupState/.test(walletRuntime) || !/resolveStartupReadiness/.test(walletRuntime) || /\.slotsSkeleton|\.linkPreviewSkeleton/.test(walletRuntime)) {
  failures.push('Home readiness must consume explicit Home loading/ready/error state and must not infer readiness from rendered skeleton CSS.');
}
if (!/HOME_STABILITY_MS\s*=\s*160/.test(walletRuntime) || !/hasBootstrappedSession/.test(homeStartupReadiness) || !/hasPersistedWallet/.test(homeStartupReadiness) || !/return 'hold'/.test(homeStartupReadiness)) {
  failures.push('Startup must retain a bounded final stability frame while server-session or persisted VeWorld evidence keeps a temporarily disconnected Home covered.');
}
// The previous literal 2,500ms gate was shorter than the Home auto-retry's
// 3,000ms backoff, showing Retry while a valid recovery was about to begin.
// Enforce a bounded grace strictly longer than the real retry schedule.
const homeStartupLoader = read('src/hooks/useHomeStartupLoader.ts');
const graceMatch = hydrationShield.match(/STARTUP_ERROR_GRACE_MS\s*=\s*([\d_]+)/);
const retryBackoffMatch = homeStartupLoader.match(/const retryDelays = \[([\d, ]+)\]/);
const startupGraceMs = graceMatch ? Number(graceMatch[1].replaceAll('_', '')) : NaN;
const retryBackoffs = retryBackoffMatch
  ? retryBackoffMatch[1].split(',').map((part) => Number(part.trim()))
  : [];
if (
  !/STARTUP_RECOVERY_MS\s*=\s*18_000/.test(hydrationShield) ||
  !Number.isFinite(startupGraceMs) ||
  retryBackoffs.length !== 3 ||
  !retryBackoffs.every(Number.isFinite) ||
  startupGraceMs <= Math.max(...retryBackoffs) + 300 ||
  startupGraceMs > 6_000 ||
  !/setState\(\{ status: 'error' \}\)/.test(hydrationShield) ||
  !/circle at 50% 38%/.test(hydrationShield)
) {
  failures.push('The branded startup surface must remain bounded and switch to explicit recovery instead of force-releasing an incomplete Home.');
}
if (!/<LocaleHydrationShield \/>[\s\S]*<AppProviders>/.test(rootLayout) || !/<Brand compact \/>/.test(hydrationShield)) {
  failures.push('The branded hydration shield must render outside the client-only wallet provider so startup never falls through to a blank black body.');
}

if (
  !/\/api\/notifications/.test(notifications) ||
  !/\/api\/notifications\/history/.test(notifications) ||
  !/method:\s*['"]POST['"]/.test(notifications) ||
  !/requireWalletSession/.test(notificationHistoryRoute) ||
  !/acknowledge_invite_notification_history/.test(notificationHistoryRoute)
) {
  failures.push('Notification acknowledgement must remain server-backed so read state survives app re-entry.');
}

if (failures.length > 0) {
  console.error('Re-entry and persistence stability gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Re-entry and persistence stability gate passed.');
