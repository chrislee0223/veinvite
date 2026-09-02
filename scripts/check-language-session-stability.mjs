import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');
const failures = [];

const provider = read('src/components/VeChainProvider.tsx');
const home = read('src/components/HomeClient.tsx');
const languageSync = read('src/components/WalletLanguagePreferenceSync.tsx');

if (!/useVeChainKitConfig/.test(provider) || !/VeChainLanguageSync/.test(provider) || !/setKitLanguage/.test(provider)) {
  failures.push('VeInvite language changes must use VeChain Kit runtime language synchronization inside the existing provider.');
}

if (!/language=\{initialLanguage\}/.test(provider)) {
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

if (!/veinvite-language-change/.test(provider) || !/setKitLanguage\(nextLanguage\)/.test(provider)) {
  failures.push('The locale event must update VeChain Kit in place without touching wallet connection state.');
}

if (!/window\.localStorage\.setItem\(LANGUAGE_STORAGE_KEY, nextLocale\)/.test(home) || !/veinvite-language-change/.test(home)) {
  failures.push('Home language changes must remain local UI state plus the shared locale event.');
}

if (!/\/api\/preferences\/language/.test(languageSync) || /clearWalletSession|disconnect\(/.test(languageSync)) {
  failures.push('Persisting a wallet language preference must never clear or disconnect the active wallet session.');
}

if (failures.length > 0) {
  console.error('Language/session stability gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Language/session stability gate passed.');
