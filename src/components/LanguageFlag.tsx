import type { Locale } from '@/lib/i18n/locales';

type LanguageFlagProps = {
  locale: Locale;
};

const FLAG_SOURCE: Record<Locale, string> = {
  en: '/flags/us.svg',
  ko: '/flags/kr.svg',
  zh: '/flags/cn.svg',
  hi: '/flags/in.svg',
  es: '/flags/es.svg',
  ja: '/flags/jp.svg',
  it: '/flags/it.svg',
  tr: '/flags/tr.svg',
  nl: '/flags/nl.svg',
  de: '/flags/de.svg',
  fr: '/flags/fr.svg',
};

export function LanguageFlag({ locale }: LanguageFlagProps) {
  return (
    <img
      className="flagSvg"
      src={FLAG_SOURCE[locale]}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
