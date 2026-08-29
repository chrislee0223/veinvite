import type { Locale } from './locales';

export const NAV_COPY: Record<
  Locale,
  {
    home: string;
    guide: string;
    leaderboard: string;
    settings: string;
    ariaLabel: string;
  }
> = {
  en: {
    home: 'Home',
    guide: 'Guide',
    leaderboard: 'Leaderboard',
    settings: 'Settings',
    ariaLabel: 'Main navigation',
  },
  ko: {
    home: '홈',
    guide: '가이드',
    leaderboard: '리더보드',
    settings: '설정',
    ariaLabel: '주요 메뉴',
  },
  zh: {
    home: '首页',
    guide: '指南',
    leaderboard: '排行榜',
    settings: '设置',
    ariaLabel: '主导航',
  },
  hi: {
    home: 'होम',
    guide: 'गाइड',
    leaderboard: 'लीडरबोर्ड',
    settings: 'सेटिंग्स',
    ariaLabel: 'मुख्य नेविगेशन',
  },
  es: {
    home: 'Inicio',
    guide: 'Guía',
    leaderboard: 'Clasificación',
    settings: 'Ajustes',
    ariaLabel: 'Navegación principal',
  },
  ja: {
    home: 'ホーム',
    guide: 'ガイド',
    leaderboard: 'ランキング',
    settings: '設定',
    ariaLabel: 'メインメニュー',
  },
  it: {
    home: 'Home',
    guide: 'Guida',
    leaderboard: 'Classifica',
    settings: 'Impostazioni',
    ariaLabel: 'Navigazione principale',
  },
  tr: {
    home: 'Ana Sayfa',
    guide: 'Rehber',
    leaderboard: 'Liderlik',
    settings: 'Ayarlar',
    ariaLabel: 'Ana gezinme',
  },
  nl: {
    home: 'Home',
    guide: 'Uitleg',
    leaderboard: 'Ranglijst',
    settings: 'Instellingen',
    ariaLabel: 'Hoofdnavigatie',
  },
  de: {
    home: 'Start',
    guide: 'Anleitung',
    leaderboard: 'Rangliste',
    settings: 'Einstellungen',
    ariaLabel: 'Hauptnavigation',
  },
  fr: {
    home: 'Accueil',
    guide: 'Guide',
    leaderboard: 'Classement',
    settings: 'Réglages',
    ariaLabel: 'Navigation principale',
  },
};
