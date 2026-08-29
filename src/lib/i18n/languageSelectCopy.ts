import type { Locale } from './locales';

type LanguageSelectCopy = {
  badge: string;
  title: string;
  subtitle: string;
  continue: string;
  note: string;
  chooseAria: string;
};

export const LANGUAGE_SELECT_COPY: Record<Locale, LanguageSelectCopy> = {
  en: {
    badge: 'STEP 1',
    title: 'Choose language',
    subtitle: 'Pick the language you prefer',
    continue: 'Continue in English',
    note: 'You can change this later',
    chooseAria: 'Choose language',
  },
  ko: {
    badge: '1단계',
    title: '언어 선택',
    subtitle: '편한 언어로 시작하세요',
    continue: '한국어로 시작하기',
    note: '언어는 나중에도 바꿀 수 있어요',
    chooseAria: '언어 선택',
  },
  zh: {
    badge: '第 1 步',
    title: '选择语言',
    subtitle: '请选择你习惯使用的语言',
    continue: '使用简体中文继续',
    note: '之后也可以随时更改语言',
    chooseAria: '选择语言',
  },
  hi: {
    badge: 'चरण 1',
    title: 'भाषा चुनें',
    subtitle: 'जिस भाषा में सहज हों, उसे चुनें',
    continue: 'हिन्दी में जारी रखें',
    note: 'आप इसे बाद में भी बदल सकते हैं',
    chooseAria: 'भाषा चुनें',
  },
  es: {
    badge: 'PASO 1',
    title: 'Elige el idioma',
    subtitle: 'Selecciona el idioma que prefieras',
    continue: 'Continuar en español',
    note: 'Podrás cambiarlo más adelante',
    chooseAria: 'Elegir idioma',
  },
  ja: {
    badge: 'STEP 1',
    title: '言語を選択',
    subtitle: '使いやすい言語を選んでください',
    continue: '日本語で続ける',
    note: '言語はあとから変更できます',
    chooseAria: '言語を選択',
  },
  it: {
    badge: 'PASSAGGIO 1',
    title: 'Scegli la lingua',
    subtitle: 'Seleziona la lingua che preferisci',
    continue: 'Continua in italiano',
    note: 'Potrai cambiarla anche in seguito',
    chooseAria: 'Scegli la lingua',
  },
  tr: {
    badge: 'ADIM 1',
    title: 'Dilini seç',
    subtitle: 'Kullanmak istediğin dili seç',
    continue: 'Türkçe devam et',
    note: 'Dili daha sonra da değiştirebilirsin',
    chooseAria: 'Dil seç',
  },
  nl: {
    badge: 'STAP 1',
    title: 'Kies je taal',
    subtitle: 'Kies de taal die je het prettigst vindt',
    continue: 'Doorgaan in het Nederlands',
    note: 'Je kunt dit later altijd wijzigen',
    chooseAria: 'Taal kiezen',
  },
  de: {
    badge: 'SCHRITT 1',
    title: 'Sprache auswählen',
    subtitle: 'Wähle die Sprache, die dir am besten passt',
    continue: 'Auf Deutsch fortfahren',
    note: 'Du kannst die Sprache später jederzeit ändern',
    chooseAria: 'Sprache auswählen',
  },
  fr: {
    badge: 'ÉTAPE 1',
    title: 'Choisissez votre langue',
    subtitle: 'Sélectionnez la langue qui vous convient',
    continue: 'Continuer en français',
    note: 'Vous pourrez la modifier plus tard',
    chooseAria: 'Choisir la langue',
  },
};
