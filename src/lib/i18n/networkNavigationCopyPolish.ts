import { NAV_COPY } from './navCopy';
import type { SupportedLocale } from './locales';

// The route/tab key remains `guide` for analytics and database compatibility,
// but the user-facing destination is now the Network product surface.
const NETWORK_LABELS: Record<SupportedLocale, string> = {
  en: 'Network',
  ko: '네트워크',
  zh: '网络',
  hi: 'नेटवर्क',
  es: 'Red',
  ja: 'ネットワーク',
  it: 'Rete',
  tr: 'Ağ',
  nl: 'Netwerk',
  de: 'Netzwerk',
  fr: 'Réseau',
  ar: 'الشبكة',
  bn: 'নেটওয়ার্ক',
  pt: 'Rede',
  ru: 'Сеть',
  id: 'Jaringan',
  vi: 'Mạng lưới',
  'zh-tw': '網路',
  sv: 'Nätverk',
  ro: 'Rețea',
  ur: 'نیٹ ورک',
  pcm: 'Network',
  arz: 'الشبكة',
  mr: 'नेटवर्क',
  te: 'నెట్‌వర్క్',
  sw: 'Mtandao',
  ha: 'Cibiyar sadarwa',
  el: 'Δίκτυο',
  cs: 'Síť',
};

for (const [locale, label] of Object.entries(NETWORK_LABELS) as Array<
  [SupportedLocale, string]
>) {
  NAV_COPY[locale].guide = label;
}
