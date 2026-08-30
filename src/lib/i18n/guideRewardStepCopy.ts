import type { Locale } from './locales';

type GuideRewardStepCopy = {
  title: string;
  description: string;
};

export const GUIDE_REWARD_STEP_COPY: Record<Locale, GuideRewardStepCopy> = {
  en: {
    title: 'Reward queued automatically after verification',
    description:
      "After the final checks, your reward is automatically queued for payout. You don't need to claim it.",
  },
  ko: {
    title: '검증 후 보상 자동 등록',
    description:
      '최종 검증을 통과하면 보상 지급 대기열에 자동으로 등록돼요. 따로 수령 신청할 필요가 없어요.',
  },
  zh: {
    title: '验证后自动进入奖励队列',
    description:
      '通过最终检查后，奖励会自动进入发放队列，无需手动领取。',
  },
  hi: {
    title: 'सत्यापन के बाद इनाम अपने-आप कतार में',
    description:
      'अंतिम जाँच पूरी होने के बाद आपका इनाम भुगतान की कतार में अपने-आप जुड़ जाएगा। आपको अलग से क्लेम करने की ज़रूरत नहीं है।',
  },
  es: {
    title: 'Recompensa en cola automáticamente tras la verificación',
    description:
      'Cuando terminen las comprobaciones finales, tu recompensa entrará automáticamente en la cola de pago. No tienes que solicitarla.',
  },
  ja: {
    title: '確認後は報酬が自動で支払い待ちに',
    description:
      '最終確認を通過すると、報酬は自動で支払い待ちに登録されます。申請は不要です。',
  },
  it: {
    title: 'Ricompensa in coda automaticamente dopo la verifica',
    description:
      'Al termine dei controlli finali, la ricompensa viene inserita automaticamente nella coda di pagamento. Non devi richiederla.',
  },
  tr: {
    title: 'Doğrulamadan sonra ödül otomatik sıraya alınır',
    description:
      'Son kontroller tamamlandığında ödülün otomatik olarak ödeme sırasına alınır. Ayrı bir talepte bulunmana gerek yok.',
  },
  nl: {
    title: 'Beloning wordt na controle automatisch klaargezet',
    description:
      'Na de laatste controles wordt je beloning automatisch in de uitbetalingswachtrij geplaatst. Je hoeft niets aan te vragen.',
  },
  de: {
    title: 'Belohnung wird nach Prüfung automatisch eingeplant',
    description:
      'Nach den abschließenden Prüfungen wird deine Belohnung automatisch zur Auszahlung vorgemerkt. Du musst sie nicht selbst anfordern.',
  },
  fr: {
    title: 'Récompense mise en paiement automatiquement après vérification',
    description:
      'Une fois les contrôles finaux terminés, votre récompense est automatiquement placée dans la file de paiement. Aucune demande n’est nécessaire.',
  },
};
