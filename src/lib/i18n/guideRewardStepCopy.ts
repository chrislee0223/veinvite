import type { Locale } from './locales';

type GuideRewardStepCopy = {
  title: string;
  description: string;
};

export const GUIDE_REWARD_STEP_COPY: Record<Locale, GuideRewardStepCopy> = {
  en: {
    title: 'Receive your reward after the missions',
    description:
      'Once your friend completes every mission, you can receive your reward through VeInvite.',
  },
  ko: {
    title: '미션 완료 후 보상 받기',
    description:
      '친구가 모든 미션을 완료하면, 초대한 사람은 VeInvite에서 보상을 받을 수 있어요.',
  },
  zh: {
    title: '完成任务后领取奖励',
    description:
      '好友完成全部任务后，邀请人就可以通过 VeInvite 获得奖励。',
  },
  hi: {
    title: 'मिशन पूरे होने के बाद इनाम पाएँ',
    description:
      'दोस्त के सभी मिशन पूरे होने के बाद आप VeInvite के ज़रिए अपना इनाम पा सकते हैं।',
  },
  es: {
    title: 'Recibe tu recompensa al completar las misiones',
    description:
      'Cuando tu amigo complete todas las misiones, podrás recibir tu recompensa a través de VeInvite.',
  },
  ja: {
    title: 'ミッション完了後に報酬を受け取る',
    description:
      '友だちがすべてのミッションを完了すると、招待した人はVeInviteで報酬を受け取れます。',
  },
  it: {
    title: 'Ricevi la ricompensa dopo le missioni',
    description:
      'Quando il tuo amico completa tutte le missioni, puoi ricevere la ricompensa tramite VeInvite.',
  },
  tr: {
    title: 'Görevler tamamlandıktan sonra ödülünü al',
    description:
      'Arkadaşın tüm görevleri tamamladığında ödülünü VeInvite üzerinden alabilirsin.',
  },
  nl: {
    title: 'Ontvang je beloning na de missies',
    description:
      'Zodra je vriend alle missies heeft voltooid, kun je je beloning via VeInvite ontvangen.',
  },
  de: {
    title: 'Belohnung nach Abschluss der Missionen erhalten',
    description:
      'Sobald dein Freund alle Missionen abgeschlossen hat, kannst du deine Belohnung über VeInvite erhalten.',
  },
  fr: {
    title: 'Recevez votre récompense après les missions',
    description:
      'Lorsque votre ami a terminé toutes les missions, vous pouvez recevoir votre récompense via VeInvite.',
  },
};
