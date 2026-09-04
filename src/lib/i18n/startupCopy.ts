import type { Locale } from './locales';

type StartupCopy = {
  errorTitle: string;
  errorDescription: string;
  retry: string;
};

export const STARTUP_COPY: Record<Locale, StartupCopy> = {
  en: {
    errorTitle: 'VeInvite could not finish loading',
    errorDescription:
      'Your wallet or Home data is taking longer than expected. Please try again.',
    retry: 'Try again',
  },
  ko: {
    errorTitle: 'VeInvite를 불러오지 못했어요',
    errorDescription:
      '지갑 또는 홈 데이터를 준비하는 데 예상보다 오래 걸리고 있어요. 다시 시도해 주세요.',
    retry: '다시 시도',
  },
  zh: {
    errorTitle: 'VeInvite 未能完成加载',
    errorDescription:
      '钱包或首页数据的准备时间超出预期，请重试。',
    retry: '重试',
  },
  hi: {
    errorTitle: 'VeInvite लोड नहीं हो सका',
    errorDescription:
      'वॉलेट या होम डेटा तैयार होने में अपेक्षा से अधिक समय लग रहा है। कृपया फिर कोशिश करें।',
    retry: 'फिर कोशिश करें',
  },
  es: {
    errorTitle: 'VeInvite no pudo terminar de cargar',
    errorDescription:
      'La cartera o los datos de inicio están tardando más de lo esperado. Inténtalo de nuevo.',
    retry: 'Intentar de nuevo',
  },
  ja: {
    errorTitle: 'VeInviteを読み込めませんでした',
    errorDescription:
      'ウォレットまたはホームデータの準備に時間がかかっています。もう一度お試しください。',
    retry: 'もう一度試す',
  },
  it: {
    errorTitle: 'VeInvite non ha completato il caricamento',
    errorDescription:
      'Il wallet o i dati Home stanno impiegando più tempo del previsto. Riprova.',
    retry: 'Riprova',
  },
  tr: {
    errorTitle: 'VeInvite yüklenemedi',
    errorDescription:
      'Cüzdan veya ana sayfa verileri beklenenden uzun sürede hazırlanıyor. Lütfen tekrar dene.',
    retry: 'Tekrar dene',
  },
  nl: {
    errorTitle: 'VeInvite kon niet volledig laden',
    errorDescription:
      'Je wallet of Home-gegevens hebben langer nodig dan verwacht. Probeer het opnieuw.',
    retry: 'Opnieuw proberen',
  },
  de: {
    errorTitle: 'VeInvite konnte nicht vollständig geladen werden',
    errorDescription:
      'Deine Wallet oder die Home-Daten benötigen länger als erwartet. Bitte versuche es erneut.',
    retry: 'Erneut versuchen',
  },
  fr: {
    errorTitle: 'VeInvite n’a pas pu terminer le chargement',
    errorDescription:
      'Le wallet ou les données d’accueil prennent plus de temps que prévu. Veuillez réessayer.',
    retry: 'Réessayer',
  },
};
