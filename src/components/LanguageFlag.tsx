import {
  getLanguageOption,
  type Locale,
} from '@/lib/i18n/locales';

type LanguageFlagProps = {
  locale: Locale;
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
