import type { Locale } from './locales';

type GuideMissionStepCopy = {
  title: string;
  description: string;
};

export const GUIDE_MISSION_STEP_COPY: Record<Locale, GuideMissionStepCopy> = {
  en: {
    title: 'Your friend completes every mission',
    description:
      'They earn B3TR from three different VeBetterDAO dApps, convert B3TR to VOT3, and cast an Allocation Vote.',
  },
  ko: {
    title: '친구가 모든 미션 완료',
    description:
      '서로 다른 VeBetterDAO dApp 3개에서 B3TR 보상을 받고, B3TR을 VOT3로 전환한 뒤 Allocation Voting에 한 번 참여해야 해요.',
  },
  zh: {
    title: '好友完成全部任务',
    description:
      '好友需要在 3 个不同的 VeBetterDAO dApp 中获得 B3TR 奖励，将 B3TR 转换为 VOT3，并参与一次 Allocation Voting。',
  },
  hi: {
    title: 'आपका दोस्त सभी मिशन पूरे करे',
    description:
      'उसे तीन अलग-अलग VeBetterDAO dApps से B3TR इनाम पाना, B3TR को VOT3 में बदलना और एक Allocation Vote करना होगा।',
  },
  es: {
    title: 'Tu amigo completa todas las misiones',
    description:
      'Debe recibir B3TR en tres dApps distintas de VeBetterDAO, convertir B3TR a VOT3 y emitir un voto en Allocation Voting.',
  },
  ja: {
    title: '友だちがすべてのミッションを完了',
    description:
      '異なる3つのVeBetterDAO dAppでB3TRを受け取り、B3TRをVOT3に変換し、Allocation Votingに1回参加します。',
  },
  it: {
    title: 'Il tuo amico completa tutte le missioni',
    description:
      'Deve ricevere B3TR da tre dApp VeBetterDAO diverse, convertire B3TR in VOT3 e votare in Allocation Voting.',
  },
  tr: {
    title: 'Arkadaşın tüm görevleri tamamlasın',
    description:
      'Üç farklı VeBetterDAO dApp’inden B3TR ödülü almalı, B3TR’yi VOT3’e dönüştürmeli ve Allocation Voting’de oy kullanmalı.',
  },
  nl: {
    title: 'Je vriend voltooit alle missies',
    description:
      'Je vriend moet B3TR ontvangen via drie verschillende VeBetterDAO-dApps, B3TR omzetten naar VOT3 en stemmen via Allocation Voting.',
  },
  de: {
    title: 'Dein Freund schließt alle Missionen ab',
    description:
      'Er muss B3TR aus drei verschiedenen VeBetterDAO-dApps erhalten, B3TR in VOT3 umwandeln und eine Stimme im Allocation Voting abgeben.',
  },
  fr: {
    title: 'Votre ami termine toutes les missions',
    description:
      'Il doit recevoir du B3TR depuis trois dApps VeBetterDAO différentes, convertir le B3TR en VOT3 et participer à l’Allocation Voting.',
  },
};
