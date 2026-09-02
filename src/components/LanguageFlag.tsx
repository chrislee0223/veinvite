import {
  getLanguageOption,
  type SupportedLocale,
} from '@/lib/i18n/locales';

type LanguageFlagProps = {
  locale: SupportedLocale;
};

export function LanguageFlag({ locale }: LanguageFlagProps) {
  const language = getLanguageOption(locale);

  return (
    <img
      className="flagSvg"
      src={language.flagSource}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
