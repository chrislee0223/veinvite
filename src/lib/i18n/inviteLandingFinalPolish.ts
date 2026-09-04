import { INVITE_LANDING_COPY } from './inviteLandingCopy';
import type { SupportedLocale } from './locales';

// Final invite-entry headline copy. Expanded locale packs are registered
// before this module is imported, so every supported locale is updated here
// without duplicating the surrounding invite-landing dictionary.
const INVITE_LANDING_FINAL_COPY: Record<
  SupportedLocale,
  { rewardTitle: string; title: string }
> = {
  en: {
    rewardTitle: 'Get started with VeBetterDAO',
    title: 'Complete each step one by one',
  },
  ko: {
    rewardTitle: 'VeBetterDAO 시작하기',
    title: '단계별로 하나씩 완료하면 돼요',
  },
  zh: {
    rewardTitle: '开始使用 VeBetterDAO',
    title: '按顺序逐步完成即可',
  },
  hi: {
    rewardTitle: 'VeBetterDAO के साथ शुरुआत करें',
    title: 'हर चरण को एक-एक करके पूरा करें',
  },
  es: {
    rewardTitle: 'Empieza con VeBetterDAO',
    title: 'Completa cada paso uno por uno',
  },
  ja: {
    rewardTitle: 'VeBetterDAOを始めよう',
    title: '各ステップを順番に完了しましょう',
  },
  it: {
    rewardTitle: 'Inizia con VeBetterDAO',
    title: 'Completa ogni passaggio uno alla volta',
  },
  tr: {
    rewardTitle: "VeBetterDAO'ya başla",
    title: 'Her adımı sırayla tamamla',
  },
  nl: {
    rewardTitle: 'Begin met VeBetterDAO',
    title: 'Voltooi elke stap één voor één',
  },
  de: {
    rewardTitle: 'Starte mit VeBetterDAO',
    title: 'Schließe jeden Schritt nacheinander ab',
  },
  fr: {
    rewardTitle: 'Commencez avec VeBetterDAO',
    title: 'Terminez chaque étape une par une',
  },
  ar: {
    rewardTitle: 'ابدأ مع VeBetterDAO',
    title: 'أكمل كل خطوة واحدة تلو الأخرى',
  },
  bn: {
    rewardTitle: 'VeBetterDAO দিয়ে শুরু করুন',
    title: 'প্রতিটি ধাপ একে একে সম্পন্ন করুন',
  },
  pt: {
    rewardTitle: 'Comece com o VeBetterDAO',
    title: 'Conclua cada etapa uma de cada vez',
  },
  ru: {
    rewardTitle: 'Начните работу с VeBetterDAO',
    title: 'Выполняйте каждый шаг по порядку',
  },
  id: {
    rewardTitle: 'Mulai dengan VeBetterDAO',
    title: 'Selesaikan setiap langkah satu per satu',
  },
  vi: {
    rewardTitle: 'Bắt đầu với VeBetterDAO',
    title: 'Hoàn thành từng bước một',
  },
  'zh-tw': {
    rewardTitle: '開始使用 VeBetterDAO',
    title: '依序完成每個步驟即可',
  },
  sv: {
    rewardTitle: 'Kom igång med VeBetterDAO',
    title: 'Slutför varje steg ett i taget',
  },
  ro: {
    rewardTitle: 'Începe cu VeBetterDAO',
    title: 'Finalizează fiecare pas pe rând',
  },
  ur: {
    rewardTitle: 'VeBetterDAO کے ساتھ شروعات کریں',
    title: 'ہر مرحلہ ایک ایک کر کے مکمل کریں',
  },
  pcm: {
    rewardTitle: 'Start with VeBetterDAO',
    title: 'Do each step one by one',
  },
  arz: {
    rewardTitle: 'ابدأ مع VeBetterDAO',
    title: 'كمّل كل خطوة واحدة واحدة',
  },
  mr: {
    rewardTitle: 'VeBetterDAO सोबत सुरुवात करा',
    title: 'प्रत्येक टप्पा एकेक करून पूर्ण करा',
  },
  te: {
    rewardTitle: 'VeBetterDAOతో ప్రారంభించండి',
    title: 'ప్రతి దశను ఒక్కొక్కటిగా పూర్తి చేయండి',
  },
  sw: {
    rewardTitle: 'Anza na VeBetterDAO',
    title: 'Kamilisha kila hatua moja baada ya nyingine',
  },
  ha: {
    rewardTitle: 'Fara da VeBetterDAO',
    title: 'Kammala kowane mataki ɗaya bayan ɗaya',
  },
};

for (const [locale, copy] of Object.entries(INVITE_LANDING_FINAL_COPY) as Array<
  [SupportedLocale, { rewardTitle: string; title: string }]
>) {
  Object.assign(INVITE_LANDING_COPY[locale], copy);
}
