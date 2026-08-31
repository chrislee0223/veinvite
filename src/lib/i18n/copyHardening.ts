import { ENTRY_REJECTION_COPY } from './entryRejectionCopy';
import { HOME_COPY } from './homeCopy';
import { INVITEE_COPY } from './inviteeCopy';
import { NOTIFICATION_COPY } from './notificationCopy';
import type { Locale } from './locales';

// Keep user-facing rejection feedback useful without exposing the exact
// reward/voting evidence or timing rules used by the eligibility engine.
// Detailed evidence remains server-side for audit and abuse investigation.
for (const locale of Object.keys(ENTRY_REJECTION_COPY) as Locale[]) {
  const rejection = ENTRY_REJECTION_COPY[locale];
  INVITEE_COPY[locale].errors.existing = rejection.title;
  INVITEE_COPY[locale].existingHelp =
    `${rejection.reasonLabel}: ${rejection.reason} ${rejection.help}`;
}

// Reward processing can still use internal queue/review states, but those are
// implementation details. User-facing copy should describe what the user can
// understand and do without exposing or teaching internal payout mechanics.
const REWARD_STATUS_COPY: Record<
  Locale,
  { title: string; description: string; missionHint: string }
> = {
  en: {
    title: 'Mission complete',
    description:
      'Your friend completed every mission. You can check your reward status here in VeInvite.',
    missionHint:
      'You can now check your reward status in VeInvite.',
  },
  ko: {
    title: '미션 완료',
    description:
      '친구가 모든 미션을 완료했어요. VeInvite에서 보상 상태를 확인할 수 있어요.',
    missionHint:
      '이제 VeInvite에서 보상 상태를 확인할 수 있어요.',
  },
  zh: {
    title: '任务已完成',
    description:
      '好友已完成所有任务。你可以在 VeInvite 中查看奖励状态。',
    missionHint:
      '现在可以在 VeInvite 中查看奖励状态。',
  },
  hi: {
    title: 'मिशन पूरा',
    description:
      'आपके दोस्त ने सभी मिशन पूरे कर लिए हैं। अब आप VeInvite में इनाम की स्थिति देख सकते हैं।',
    missionHint:
      'अब आप VeInvite में इनाम की स्थिति देख सकते हैं।',
  },
  es: {
    title: 'Misión completada',
    description:
      'Tu amigo ha completado todas las misiones. Puedes consultar el estado de tu recompensa en VeInvite.',
    missionHint:
      'Ya puedes consultar el estado de tu recompensa en VeInvite.',
  },
  ja: {
    title: 'ミッション完了',
    description:
      '友だちがすべてのミッションを完了しました。VeInviteで報酬状況を確認できます。',
    missionHint:
      'VeInviteで報酬状況を確認できるようになりました。',
  },
  it: {
    title: 'Missione completata',
    description:
      'Il tuo amico ha completato tutte le missioni. Puoi controllare lo stato della ricompensa su VeInvite.',
    missionHint:
      'Ora puoi controllare lo stato della ricompensa su VeInvite.',
  },
  tr: {
    title: 'Görev tamamlandı',
    description:
      'Arkadaşın tüm görevleri tamamladı. Ödül durumunu VeInvite üzerinden kontrol edebilirsin.',
    missionHint:
      'Artık ödül durumunu VeInvite üzerinden kontrol edebilirsin.',
  },
  nl: {
    title: 'Missie voltooid',
    description:
      'Je vriend heeft alle missies voltooid. Je kunt de status van je beloning in VeInvite bekijken.',
    missionHint:
      'Je kunt nu de status van je beloning in VeInvite bekijken.',
  },
  de: {
    title: 'Mission abgeschlossen',
    description:
      'Dein Freund hat alle Missionen abgeschlossen. Du kannst den Status deiner Belohnung in VeInvite prüfen.',
    missionHint:
      'Du kannst jetzt den Status deiner Belohnung in VeInvite prüfen.',
  },
  fr: {
    title: 'Mission terminée',
    description:
      'Votre ami a terminé toutes les missions. Vous pouvez consulter le statut de votre récompense dans VeInvite.',
    missionHint:
      'Vous pouvez maintenant consulter le statut de votre récompense dans VeInvite.',
  },
};

for (const locale of Object.keys(REWARD_STATUS_COPY) as Locale[]) {
  const reward = REWARD_STATUS_COPY[locale];
  HOME_COPY[locale].rewardPending = reward.title;
  HOME_COPY[locale].rewardDescription = reward.description;
  NOTIFICATION_COPY[locale].allMissionsHint = reward.missionHint;
}

// Natural Korean particles for the token name. These messages are visible in
// the notification surface and should read like native Korean copy.
NOTIFICATION_COPY.ko.dappBody =
  '초대받은 사용자가 서로 다른 VeBetter dApp 3개에서 B3TR을 획득했습니다.';
NOTIFICATION_COPY.ko.vot3Body =
  '초대받은 사용자가 B3TR을 VOT3로 전환했습니다.';
NOTIFICATION_COPY.ko.progressVot3Body =
  '초대받은 사용자가 dApp 미션을 완료하고 B3TR을 VOT3로 전환했습니다.';
