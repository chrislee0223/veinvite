import { INELIGIBLE_INVITER_COPY } from './ineligibleInviterCopy';
import { PRIVACY_USAGE_ANALYTICS_CONTROL_COPY } from './privacyUsageAnalyticsControlCopy';
import { PRIVACY_USAGE_ANALYTICS_COPY } from './privacyUsageAnalyticsCopy';
import { REWARD_FORECAST_COPY } from './rewardForecastCopy';
import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from './locales';
import { snapshotLocalePack } from './localePacks/localePack';

type LocalizedTerminology = {
  allocationVoting: string;
  dapp: string;
  dapps: string;
  onChain: string;
  vechainExplorer: string;
  wallet: string;
  wallets: string;
  literal?: readonly (readonly [string, string])[];
};

/**
 * VeInvite brand terminology policy.
 *
 * Only VeChain, B3TR, VOT3, VeBetterDAO and VeInvite are fixed product/
 * protocol names in ordinary user-facing copy. Everything else is localized
 * when the target language has a natural equivalent. A borrowed technical word
 * can still be used when it is genuinely normal in that language; it is not
 * treated as an immutable brand name.
 *
 * Exact technical identifiers used by legal/privacy copy (for example IP, URL
 * and User-Agent) are intentionally outside this product-terminology pass.
 */
const TERMINOLOGY_BY_LOCALE: Record<
  SupportedLocale,
  LocalizedTerminology
> = {
  en: {
    allocationVoting: 'Allocation Voting',
    dapp: 'dApp',
    dapps: 'dApps',
    onChain: 'on-chain',
    vechainExplorer: 'VeChain Explorer',
    wallet: 'wallet',
    wallets: 'wallets',
  },
  ko: {
    allocationVoting: '배분 투표',
    dapp: '앱',
    dapps: '앱',
    onChain: '온체인',
    vechainExplorer: 'VeChain 탐색기',
    wallet: '지갑',
    wallets: '지갑',
  },
  zh: {
    allocationVoting: '分配投票',
    dapp: '应用',
    dapps: '应用',
    onChain: '链上',
    vechainExplorer: 'VeChain 区块浏览器',
    wallet: '钱包',
    wallets: '钱包',
  },
  hi: {
    allocationVoting: 'आवंटन मतदान',
    dapp: 'ऐप',
    dapps: 'ऐप',
    onChain: 'ब्लॉकचेन पर',
    vechainExplorer: 'VeChain ब्लॉक एक्सप्लोरर',
    wallet: 'वॉलेट',
    wallets: 'वॉलेट',
  },
  es: {
    allocationVoting: 'votación de asignación',
    dapp: 'aplicación',
    dapps: 'aplicaciones',
    onChain: 'en la cadena de bloques',
    vechainExplorer: 'explorador de VeChain',
    wallet: 'cartera',
    wallets: 'carteras',
  },
  ja: {
    allocationVoting: '配分投票',
    dapp: 'アプリ',
    dapps: 'アプリ',
    onChain: 'オンチェーン',
    vechainExplorer: 'VeChainエクスプローラー',
    wallet: 'ウォレット',
    wallets: 'ウォレット',
  },
  it: {
    allocationVoting: 'votazione di allocazione',
    dapp: 'app',
    dapps: 'app',
    onChain: 'sulla blockchain',
    vechainExplorer: 'esploratore VeChain',
    wallet: 'portafoglio',
    wallets: 'portafogli',
    literal: [
      ['Apri account wallet', 'Apri il portafoglio'],
      ['account wallet', 'portafoglio'],
    ],
  },
  tr: {
    allocationVoting: 'dağıtım oylaması',
    dapp: 'uygulama',
    dapps: 'uygulamalar',
    onChain: 'blok zinciri üzerinde',
    vechainExplorer: 'VeChain gezgini',
    wallet: 'cüzdan',
    wallets: 'cüzdanlar',
  },
  nl: {
    allocationVoting: 'toewijzingsstemming',
    dapp: 'app',
    dapps: 'apps',
    onChain: 'op de blockchain',
    vechainExplorer: 'VeChain-verkenner',
    wallet: 'digitale portemonnee',
    wallets: 'digitale portemonnees',
    literal: [
      ['Walletaccount', 'Account voor digitale portemonnee'],
      ['walletaccount', 'account voor digitale portemonnee'],
    ],
  },
  de: {
    allocationVoting: 'Abstimmung über die Zuteilung',
    dapp: 'App',
    dapps: 'Apps',
    onChain: 'auf der Blockchain',
    vechainExplorer: 'VeChain-Blockübersicht',
    wallet: 'digitale Geldbörse',
    wallets: 'digitale Geldbörsen',
  },
  fr: {
    allocationVoting: 'vote d’allocation',
    dapp: 'application',
    dapps: 'applications',
    onChain: 'sur la blockchain',
    vechainExplorer: 'explorateur VeChain',
    wallet: 'portefeuille',
    wallets: 'portefeuilles',
    literal: [
      ['Ouvrir le compte wallet', 'Ouvrir le portefeuille'],
      ['compte wallet', 'portefeuille'],
    ],
  },
  ar: {
    allocationVoting: 'تصويت التخصيص',
    dapp: 'تطبيق',
    dapps: 'تطبيقات',
    onChain: 'على السلسلة',
    vechainExplorer: 'مستكشف VeChain',
    wallet: 'محفظة',
    wallets: 'محافظ',
  },
  bn: {
    allocationVoting: 'বরাদ্দ ভোট',
    dapp: 'অ্যাপ',
    dapps: 'অ্যাপ',
    onChain: 'ব্লকচেইনে',
    vechainExplorer: 'VeChain ব্লক অনুসন্ধানকারী',
    wallet: 'ওয়ালেট',
    wallets: 'ওয়ালেট',
  },
  pt: {
    allocationVoting: 'votação de alocação',
    dapp: 'aplicativo',
    dapps: 'aplicativos',
    onChain: 'na blockchain',
    vechainExplorer: 'explorador da VeChain',
    wallet: 'carteira',
    wallets: 'carteiras',
  },
  ru: {
    allocationVoting: 'голосование за распределение',
    dapp: 'приложение',
    dapps: 'приложения',
    onChain: 'в блокчейне',
    vechainExplorer: 'обозреватель VeChain',
    wallet: 'кошелёк',
    wallets: 'кошельки',
  },
  id: {
    allocationVoting: 'pemungutan suara alokasi',
    dapp: 'aplikasi',
    dapps: 'aplikasi',
    onChain: 'di blockchain',
    vechainExplorer: 'penjelajah VeChain',
    wallet: 'dompet',
    wallets: 'dompet',
  },
  vi: {
    allocationVoting: 'bỏ phiếu phân bổ',
    dapp: 'ứng dụng',
    dapps: 'ứng dụng',
    onChain: 'trên chuỗi',
    vechainExplorer: 'trình khám phá VeChain',
    wallet: 'ví',
    wallets: 'ví',
  },
  'zh-tw': {
    allocationVoting: '分配投票',
    dapp: '應用程式',
    dapps: '應用程式',
    onChain: '鏈上',
    vechainExplorer: 'VeChain 區塊瀏覽器',
    wallet: '錢包',
    wallets: '錢包',
  },
  sv: {
    allocationVoting: 'fördelningsomröstning',
    dapp: 'app',
    dapps: 'appar',
    onChain: 'på blockkedjan',
    vechainExplorer: 'VeChain-utforskaren',
    wallet: 'plånbok',
    wallets: 'plånböcker',
  },
  ro: {
    allocationVoting: 'vot de alocare',
    dapp: 'aplicație',
    dapps: 'aplicații',
    onChain: 'pe blockchain',
    vechainExplorer: 'exploratorul VeChain',
    wallet: 'portofel',
    wallets: 'portofele',
  },
  ur: {
    allocationVoting: 'تقسیمی ووٹنگ',
    dapp: 'ایپ',
    dapps: 'ایپس',
    onChain: 'بلاک چین پر',
    vechainExplorer: 'VeChain بلاک ایکسپلورر',
    wallet: 'والیٹ',
    wallets: 'والیٹس',
  },
  pcm: {
    allocationVoting: 'vote on how reward go share',
    dapp: 'app',
    dapps: 'apps',
    onChain: 'for blockchain',
    vechainExplorer: 'VeChain block checker',
    wallet: 'wallet',
    wallets: 'wallets',
  },
  arz: {
    allocationVoting: 'تصويت التخصيص',
    dapp: 'تطبيق',
    dapps: 'تطبيقات',
    onChain: 'على البلوك تشين',
    vechainExplorer: 'مستكشف VeChain',
    wallet: 'محفظة',
    wallets: 'محافظ',
  },
  mr: {
    allocationVoting: 'वाटप मतदान',
    dapp: 'अॅप',
    dapps: 'अॅप्स',
    onChain: 'ब्लॉकचेनवर',
    vechainExplorer: 'VeChain ब्लॉक शोधक',
    wallet: 'वॉलेट',
    wallets: 'वॉलेट',
  },
  te: {
    allocationVoting: 'కేటాయింపు ఓటింగ్',
    dapp: 'యాప్',
    dapps: 'యాప్‌లు',
    onChain: 'బ్లాక్‌చెయిన్‌లో',
    vechainExplorer: 'VeChain బ్లాక్ అన్వేషకం',
    wallet: 'వాలెట్',
    wallets: 'వాలెట్లు',
  },
  sw: {
    allocationVoting: 'upigaji kura wa mgao',
    dapp: 'programu',
    dapps: 'programu',
    onChain: 'kwenye mnyororo wa bloku',
    vechainExplorer: 'kichunguzi cha VeChain',
    wallet: 'pochi',
    wallets: 'pochi',
  },
  ha: {
    allocationVoting: 'ƙuri’ar rabon kaso',
    dapp: 'manhaja',
    dapps: 'manhajoji',
    onChain: 'a kan sarkar bayanai',
    vechainExplorer: 'mai binciken VeChain',
    wallet: 'jakar kuɗi',
    wallets: 'jakunkunan kuɗi',
  },
};

const CANONICAL_BRANDS = [
  [/\bvechain\b/gi, 'VeChain'],
  [/\bb3tr\b/gi, 'B3TR'],
  [/\bvot3\b/gi, 'VOT3'],
  [/\bvebetterdao\b/gi, 'VeBetterDAO'],
  [/\bveinvite\b/gi, 'VeInvite'],
] as const;

function withInitialCapital(
  value: string,
  locale: SupportedLocale,
): string {
  if (!value) return value;
  return `${value[0].toLocaleUpperCase(locale)}${value.slice(1)}`;
}

function rewriteString(
  input: string,
  locale: SupportedLocale,
): string {
  const terminology = TERMINOLOGY_BY_LOCALE[locale];
  let output = input;

  for (const [from, to] of terminology.literal ?? []) {
    output = output.replaceAll(from, to);
  }

  output = output
    .replace(/VeChain Explorer/gi, terminology.vechainExplorer)
    .replace(/Allocation(?:-| )Voting/gi, terminology.allocationVoting)
    .replace(/\bdApps\b/gi, terminology.dapps)
    .replace(/\bdApp\b/gi, terminology.dapp)
    .replace(/on-chain/gi, terminology.onChain)
    .replace(/\bonchain\b/gi, terminology.onChain);

  if (locale !== 'en') {
    output = output
      .replace(/\bWallets\b/g, withInitialCapital(terminology.wallets, locale))
      .replace(/\bwallets\b/g, terminology.wallets)
      .replace(/\bWallet\b/g, withInitialCapital(terminology.wallet, locale))
      .replace(/\bwallet\b/g, terminology.wallet);
  }

  for (const [pattern, canonical] of CANONICAL_BRANDS) {
    output = output.replace(pattern, canonical);
  }

  return output;
}

function rewriteTree(
  value: unknown,
  locale: SupportedLocale,
): void {
  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      if (typeof item === 'string') {
        value[index] = rewriteString(item, locale);
      } else {
        rewriteTree(item, locale);
      }
    }
    return;
  }

  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === 'string') {
      record[key] = rewriteString(item, locale);
    } else {
      rewriteTree(item, locale);
    }
  }
}

for (const locale of SUPPORTED_LOCALES) {
  // snapshotLocalePack returns references to the registered copy dictionaries,
  // so rewriting this tree updates every standard user-facing surface in one
  // place without duplicating 27 full translation packs.
  rewriteTree(snapshotLocalePack(locale), locale);
  rewriteTree(INELIGIBLE_INVITER_COPY[locale], locale);
  rewriteTree(REWARD_FORECAST_COPY[locale], locale);
  rewriteTree(PRIVACY_USAGE_ANALYTICS_COPY[locale], locale);
  rewriteTree(PRIVACY_USAGE_ANALYTICS_CONTROL_COPY[locale], locale);
}
