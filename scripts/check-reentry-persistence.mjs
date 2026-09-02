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
const walletControl = read('src/components/WalletControl.tsx');
const walletAuth = read('src/hooks/useWalletAuthentication.ts');
const walletSessionGate = read('src/components/WalletSessionGate.tsx');
const notifications = read('src/components/InAppInviteNotifications.tsx');
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

if (!/WALLET_TRANSPORT_SETTLE_MS\s*=\s*900/.test(walletControl) || !/isWalletActionPending/.test(walletControl) || !/waitForWalletRelease/.test(walletControl)) {
  failures.push('Wallet logout/switch must keep the transport-settle guard that prevents reconnect races.');
}
if (!/WALLET_SIGNATURE_TIMEOUT_MS\s*=\s*15_000/.test(walletAuth) || !/withTimeout/.test(walletAuth) || !/AbortController/.test(walletAuth)) {
  failures.push('Wallet ownership verification must remain bounded and cancellable instead of waiting forever.');
}
if (!/disconnectFromVerification/.test(walletSessionGate) || !/t\.disconnectWallet/.test(walletSessionGate)) {
  failures.push('The wallet verification gate must retain a visible disconnect recovery path.');
}
if (!/pagehide/.test(walletSessionGate) || !/pageLifecycleRef/.test(walletSessionGate) || !/document\.visibilityState\s*===\s*['"]hidden['"]/.test(walletSessionGate)) {
  failures.push('Page refresh/navigation must not be mistaken for an explicit wallet logout that revokes the server session.');
}
if (!/PASSIVE_DISCONNECT_GRACE_MS\s*=\s*8_000/.test(walletSessionGate) || !/pendingDisconnectTimerRef/.test(walletSessionGate) || !/walletAddressRef\.current/.test(walletSessionGate)) {
  failures.push('Transient WalletConnect/VeWorld disconnect events must receive a reconnect grace window before the persistent session is revoked.');
}
if (!/SESSION_CHECK_SURFACE_DELAY_MS\s*=\s*3_000/.test(walletSessionGate) || !/showCheckingSurface/.test(walletSessionGate)) {
  failures.push('Normal session restoration should remain visually quiet long enough to avoid flashing ownership verification during a refresh.');
}
if (!/\/api\/auth\/session/.test(walletAuth) || !/session\.authenticated/.test(walletAuth)) {
  failures.push('Wallet authentication must reuse a valid existing server session before requesting a fresh wallet signature.');
}

if (!/\/api\/notifications/.test(notifications) || !/method:\s*['"]POST['"]/.test(notifications) || !/acknowledgeAndClose/.test(notifications)) {
  failures.push('Notification acknowledgement must remain server-backed so read state survives app re-entry.');
}

if (failures.length > 0) {
  console.error('Re-entry and persistence stability gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Re-entry and persistence stability gate passed.');
