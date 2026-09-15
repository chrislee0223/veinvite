import {
  PRIVACY_PRODUCT_ANALYTICS_COPY,
  type PrivacyProductAnalyticsCopy,
} from '../privacyProductAnalyticsCopy';
import {
  PRIVACY_USAGE_ANALYTICS_CONTROL_COPY,
  type PrivacyUsageAnalyticsControlCopy,
} from '../privacyUsageAnalyticsControlCopy';
import {
  PRIVACY_USAGE_ANALYTICS_COPY,
  type PrivacyUsageAnalyticsCopy,
} from '../privacyUsageAnalyticsCopy';
import {
  PRIVACY_WALLET_LANGUAGE_COPY,
  type PrivacyWalletLanguageCopy,
} from '../privacyWalletLanguageCopy';

// These four privacy tables predate the typed expanded-locale packs. Keep the
// Czech additions together so a newly registered locale cannot silently lose
// privacy sections just because a legacy table still uses string keys.
const CZECH_USAGE_ANALYTICS_COPY = {
  updated: 'Poslední aktualizace: 3. září 2026',
  heading: 'Anonymní statistiky používání',
  body: 'Pro lepší porozumění návštěvnosti a zlepšování VeInvite aplikace ukládá do prohlížeče náhodný identifikátor a zaznamenává souhrnné údaje o používání, například počet návštěv a relací, dobu aktivního používání, část aplikace, zvolený jazyk, obecnou kategorii zařízení, kategorii zdroje návštěvy a zda byla aktivní ověřená relace peněženky. Analytické úložiště neukládá nezpracované IP adresy, úplné řetězce User-Agent, adresy peněženek, kódy pozvánek, řetězce dotazů ani úplné adresy URL odkazujících stránek. Technické údaje o požadavcích mohou být krátce zpracovány kvůli zabezpečení a omezení frekvence požadavků. Statistiky používání nikdy nerozhodují o doporučeních, způsobilosti, kontrole Sybil ani odměnách.',
} satisfies PrivacyUsageAnalyticsCopy;

const CZECH_PRODUCT_ANALYTICS_COPY = {
  updated: 'Poslední aktualizace: 6. září 2026',
  heading: 'Anonymní statistiky interakcí s aplikací',
  body: 'Když jsou anonymní statistiky používání zapnuté, může VeInvite zaznamenávat také omezený soubor akcí, například zahájení připojení peněženky, úspěch nebo neúspěch ověření peněženky, kopírování či sdílení odkazu pozvánky, výsledek přijetí pozvánky, otevření odkazu mise a výsledek vyzvednutí odměny. Tyto události používají stejný denní anonymní identifikátor prohlížeče a pouze obecné údaje, jako jsou část aplikace, zvolený jazyk, kategorie zařízení, kategorie zdroje návštěvy a verze aplikace. Neobsahují adresy peněženek, kódy pozvánek nebo doporučení, úplné adresy URL, řetězce dotazů ani volně zapisovaná metadata. Nezpracované záznamy těchto událostí se v aktivní databázi uchovávají nejvýše 365 dní. Než mohou být starší záznamy z aktivní databáze odstraněny, musí být zkopírovány do chráněného dlouhodobého archivu a ověřeny; souhrnné počty bez identifikátorů zůstávají zachovány pro dlouhodobé statistiky. Tyto statistiky nikdy neurčují vztah doporučení, splnění mise, způsobilost, stav Sybil ani odměny.',
} satisfies PrivacyProductAnalyticsCopy;

const CZECH_WALLET_LANGUAGE_COPY = {
  updated: 'Poslední aktualizace: 4. září 2026',
  heading: 'Nastavení jazyka peněženky',
  body: 'Při aktivní ověřené relaci peněženky může VeInvite uložit výslovně zvolenou jazykovou předvolbu této peněženky a aktuálně zobrazovaný jazyk spolu s informací, zda byl jazyk zobrazení určen podle prohlížeče, místního úložiště prohlížeče, uložené předvolby peněženky nebo výslovné volby uživatele. Tento provozní stav jazyka peněženky je veden odděleně od anonymních statistik používání. Jazyk zjištěný prohlížečem nebo uložený pouze lokálně se nestane předvolbou peněženky sdílenou mezi zařízeními, dokud uživatel při ověřené relaci jazyk výslovně nezmění. Jazyk zobrazení se nepovažuje za údaj o zemi ani státní příslušnosti uživatele.',
} satisfies PrivacyWalletLanguageCopy;

const CZECH_USAGE_ANALYTICS_CONTROL_COPY = {
  note: 'Každý kalendářní den podle času v Soulu se používá nový anonymní identifikátor. Nezpracovaná anonymní analytická data se uchovávají nejvýše 30 dní; poté zůstávají jen souhrnné statistiky. Tuto možnost lze kdykoli vypnout.',
} satisfies PrivacyUsageAnalyticsControlCopy;

export function registerCzechStandalonePrivacyCopy(): void {
  PRIVACY_USAGE_ANALYTICS_COPY.cs = CZECH_USAGE_ANALYTICS_COPY;
  PRIVACY_PRODUCT_ANALYTICS_COPY.cs = CZECH_PRODUCT_ANALYTICS_COPY;
  PRIVACY_WALLET_LANGUAGE_COPY.cs = CZECH_WALLET_LANGUAGE_COPY;
  PRIVACY_USAGE_ANALYTICS_CONTROL_COPY.cs = CZECH_USAGE_ANALYTICS_CONTROL_COPY;
}
