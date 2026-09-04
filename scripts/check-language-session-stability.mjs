import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');
const failures = [];

const provider = read('src/components/VeChainProvider.tsx');
const home = read('src/components/HomeClient.tsx');
const languageSync = read('src/components/WalletLanguagePreferenceSync.tsx');
const languageRoute = read('src/app/api/preferences/language/route.ts');
const languageUsageMigration = read(
  'supabase/migrations/20260904220000_track_wallet_display_language.sql',
);

if (!/useVeChainKitConfig/.test(provider) || !/VeChainLanguageSync/.test(provider) || !/setKitLanguage/.test(provider)) {
  failures.push('VeInvite language changes must use VeChain Kit runtime language synchronization inside the existing provider.');
}

if (!/language=\{initialLanguage as never\}/.test(provider)) {
  failures.push('VeChain Kit must receive an initialization-only language prop instead of a live parent language state.');
}

if (/const\s*\[\s*language\s*,\s*setLanguage\s*\]\s*=\s*useState/.test(provider) || /language=\{language\}/.test(provider)) {
  failures.push('Changing app language must not rebuild VeChainProvider through a live language state prop.');
}

for (const stableConfig of ['dappKit', 'loginMethods', 'network', 'theme']) {
  const expression = new RegExp(`const\\s+${stableConfig}\\s*=\\s*useMemo`);
  if (!expression.test(provider)) {
    failures.push(`VeChain wallet provider ${stableConfig} configuration must remain referentially stable across locale changes.`);
  }
}

if (!/veinvite-language-change/.test(provider) || !/resolveVeChainKitLanguage/.test(provider) || !/setKitLanguage\(kitLanguage as never\)/.test(provider)) {
  failures.push('The locale event must update VeChain Kit in place through a supported wallet-language mapping without touching wallet connection state.');
}

if (!/VECHAIN_KIT_LANGUAGES/.test(provider) || !/return VECHAIN_KIT_LANGUAGES\.has\(locale\)[\s\S]*:\s*['"]en['"]/.test(provider)) {
  failures.push('App-only locales must fall back safely instead of sending an unsupported language into the live wallet provider.');
}

if (!/window\.localStorage\.setItem\(LANGUAGE_STORAGE_KEY, nextLocale\)/.test(home) || !/veinvite-language-change/.test(home)) {
  failures.push('Home language changes must remain local UI state plus the shared locale event.');
}

if (!/\/api\/preferences\/language/.test(languageSync) || /clearWalletSession|disconnect\(/.test(languageSync)) {
  failures.push('Persisting a wallet language preference must never clear or disconnect the active wallet session.');
}

if (
  !/OBSERVE_WALLET_DISPLAY_LANGUAGE/.test(languageSync) ||
  !/resolveBrowserLocale/.test(languageSync) ||
  !/await observeDisplayLanguage\(\s*browserLanguage,\s*'browser_auto'/s.test(languageSync)
) {
  failures.push(
    'Browser-auto locale must be observed as display state instead of being promoted directly into a wallet preference.',
  );
}

if (
  !/SET_WALLET_LANGUAGE_PREFERENCE/.test(languageRoute) ||
  !/OBSERVE_WALLET_DISPLAY_LANGUAGE/.test(languageRoute) ||
  !/wallet_language_usage/.test(languageRoute) ||
  !/wallet_preferences/.test(languageRoute)
) {
  failures.push(
    'The language API must keep explicit wallet preferences separate from observed display-language state.',
  );
}

if (
  !/wallet_preferences remains the explicit\/stored preference/i.test(
    languageUsageMigration,
  ) ||
  !/current_source in \([\s\S]*'browser_auto'[\s\S]*'local_storage'[\s\S]*'wallet_preference'[\s\S]*'manual_selection'/i.test(
    languageUsageMigration,
  ) ||
  !/revoke all on table public\.wallet_language_usage from anon, authenticated/i.test(
    languageUsageMigration,
  ) ||
  !/grant select, insert, update on table public\.wallet_language_usage to service_role/i.test(
    languageUsageMigration,
  )
) {
  failures.push(
    'Wallet display-language observations must remain source-labelled and service-role-only.',
  );
}

if (failures.length > 0) {
  console.error('Language/session stability gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Language/session stability gate passed.');
