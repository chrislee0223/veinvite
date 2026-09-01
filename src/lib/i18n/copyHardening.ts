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

// Keep the invitee-facing eligibility explanation aligned with the exact
// public rule while using Allocation Voting consistently in every locale.
const INVITEE_ELIGIBILITY_COPY: Record<
  Locale,
  {
    eligibilityDescription: string;
    newSuccessDescription: string;
    returningSuccessDescription: string;
    autoProgress: string;
  }
> = {
  en: {
    eligibilityDescription:
      'You can participate if you are new to VeBetterDAO, or if you are returning with no VeBetterDAO reward or Allocation Voting activity since the start of the oldest of the last 12 completed rounds.',
    newSuccessDescription:
      'No previous VeBetterDAO reward or Allocation Voting history was found for this wallet. You can continue with the VeInvite missions.',
    returningSuccessDescription:
      'This wallet has older VeBetterDAO activity, but no VeBetterDAO reward or Allocation Voting activity since the start of the oldest of the last 12 completed rounds. You can continue with the VeInvite missions.',
    autoProgress:
      'Your dApp rewards, VOT3 conversion, and Allocation Voting participation are verified automatically on-chain.',
  },
  ko: {
    eligibilityDescription:
      'VeBetterDAO가 처음이거나, 최근 완료된 12개 라운드 중 가장 오래된 라운드의 시작 시점부터 지금까지 VeBetterDAO 보상이나 Allocation Voting 활동이 없었던 복귀 사용자라면 참여할 수 있어요.',
    newSuccessDescription:
      '이 지갑에서는 이전 VeBetterDAO 보상이나 Allocation Voting 참여 이력이 확인되지 않았어요. VeInvite 미션을 진행할 수 있어요.',
    returningSuccessDescription:
      '과거 VeBetterDAO 활동은 있지만 최근 완료된 12개 라운드 중 가장 오래된 라운드의 시작 시점부터 지금까지 VeBetterDAO 보상이나 Allocation Voting 활동이 없었어요. VeInvite 미션을 진행할 수 있어요.',
    autoProgress:
      'dApp 보상, VOT3 전환, Allocation Voting 참여 기록을 온체인에서 자동으로 확인해요.',
  },
  zh: {
    eligibilityDescription:
      '如果你是第一次使用 VeBetterDAO，或从最近 12 个已完成轮次中最早一轮的开始时点至今没有 VeBetterDAO 奖励或 Allocation Voting 活动的回归用户，就可以参加。',
    newSuccessDescription:
      '未发现这个钱包此前有 VeBetterDAO 奖励或 Allocation Voting 记录，可以继续完成 VeInvite 任务。',
    returningSuccessDescription:
      '这个钱包过去有 VeBetterDAO 活动，但从最近 12 个已完成轮次中最早一轮的开始时点至今没有 VeBetterDAO 奖励或 Allocation Voting 活动，可以继续完成 VeInvite 任务。',
    autoProgress:
      'dApp 奖励、VOT3 转换和 Allocation Voting 参与记录会自动从链上验证。',
  },
  hi: {
    eligibilityDescription:
      'अगर आप VeBetterDAO पर नए हैं, या वापस लौट रहे हैं और पिछली 12 पूरी हुई राउंड में सबसे पुरानी राउंड की शुरुआत से अब तक कोई VeBetterDAO इनाम या Allocation Voting गतिविधि नहीं रही है, तो आप भाग ले सकते हैं।',
    newSuccessDescription:
      'इस वॉलेट पर पहले कोई VeBetterDAO इनाम या Allocation Voting इतिहास नहीं मिला। आप VeInvite मिशन जारी रख सकते हैं।',
    returningSuccessDescription:
      'इस वॉलेट पर पुरानी VeBetterDAO गतिविधि है, लेकिन पिछली 12 पूरी हुई राउंड में सबसे पुरानी राउंड की शुरुआत से अब तक कोई VeBetterDAO इनाम या Allocation Voting गतिविधि नहीं है। आप VeInvite मिशन जारी रख सकते हैं।',
    autoProgress:
      'आपकी dApp रिवार्ड, VOT3 कन्वर्ज़न और Allocation Voting भागीदारी ऑन-चेन अपने-आप सत्यापित होती है।',
  },
  es: {
    eligibilityDescription:
      'Puedes participar si eres nuevo en VeBetterDAO o si regresas sin recompensas de VeBetterDAO ni actividad en Allocation Voting desde el inicio de la más antigua de las últimas 12 rondas completadas.',
    newSuccessDescription:
      'No se encontró historial previo de recompensas de VeBetterDAO ni de Allocation Voting en esta cartera. Puedes continuar con las misiones de VeInvite.',
    returningSuccessDescription:
      'Esta cartera tiene actividad antigua de VeBetterDAO, pero ninguna recompensa de VeBetterDAO ni actividad en Allocation Voting desde el inicio de la más antigua de las últimas 12 rondas completadas. Puedes continuar con las misiones de VeInvite.',
    autoProgress:
      'Las recompensas de dApps, la conversión a VOT3 y la participación en Allocation Voting se verifican automáticamente en cadena.',
  },
  ja: {
    eligibilityDescription:
      'VeBetterDAOが初めての方、または直近12回の完了済みラウンドのうち最も古いラウンドの開始時点から現在までVeBetterDAOの報酬受取やAllocation Votingがなかった復帰ユーザーが対象です。',
    newSuccessDescription:
      'このウォレットには過去のVeBetterDAO報酬受取やAllocation Votingの履歴がありません。VeInviteミッションを進められます。',
    returningSuccessDescription:
      '過去のVeBetterDAO活動はありますが、直近12回の完了済みラウンドのうち最も古いラウンドの開始時点から現在までVeBetterDAOの報酬受取やAllocation Votingがありません。VeInviteミッションを進められます。',
    autoProgress:
      'dApp報酬、VOT3変換、Allocation Votingへの参加はオンチェーンで自動確認されます。',
  },
  it: {
    eligibilityDescription:
      'Puoi partecipare se sei nuovo su VeBetterDAO o se stai tornando senza ricompense VeBetterDAO né attività di Allocation Voting dall’inizio della più vecchia delle ultime 12 tornate completate.',
    newSuccessDescription:
      'Non risultano precedenti ricompense VeBetterDAO né attività di Allocation Voting per questo wallet. Puoi continuare con le missioni VeInvite.',
    returningSuccessDescription:
      'Questo wallet presenta attività VeBetterDAO più vecchie, ma nessuna ricompensa VeBetterDAO né attività di Allocation Voting dall’inizio della più vecchia delle ultime 12 tornate completate. Puoi continuare con le missioni VeInvite.',
    autoProgress:
      'Le ricompense dApp, la conversione in VOT3 e la partecipazione all’Allocation Voting vengono verificate automaticamente on-chain.',
  },
  tr: {
    eligibilityDescription:
      'VeBetterDAO’da yeniysen veya son 12 tamamlanmış turun en eskisinin başlangıcından bugüne kadar VeBetterDAO ödülü ya da Allocation Voting etkinliği olmayan geri dönen bir kullanıcıysan katılabilirsin.',
    newSuccessDescription:
      'Bu cüzdanda daha önce VeBetterDAO ödülü veya Allocation Voting geçmişi bulunmadı. VeInvite görevlerine devam edebilirsin.',
    returningSuccessDescription:
      'Bu cüzdanda daha eski VeBetterDAO etkinliği var, ancak son 12 tamamlanmış turun en eskisinin başlangıcından bugüne kadar VeBetterDAO ödülü veya Allocation Voting etkinliği yok. VeInvite görevlerine devam edebilirsin.',
    autoProgress:
      'dApp ödüllerin, VOT3 dönüşümün ve Allocation Voting katılımın zincir üzerinde otomatik olarak doğrulanır.',
  },
  nl: {
    eligibilityDescription:
      'Je kunt deelnemen als je nieuw bent bij VeBetterDAO, of als je terugkeert zonder VeBetterDAO-beloningen of Allocation Voting-activiteit sinds het begin van de oudste van de laatste 12 voltooide rondes.',
    newSuccessDescription:
      'Voor deze wallet is geen eerdere VeBetterDAO-beloning of Allocation Voting-geschiedenis gevonden. Je kunt doorgaan met de VeInvite-missies.',
    returningSuccessDescription:
      'Deze wallet heeft oudere VeBetterDAO-activiteit, maar geen VeBetterDAO-beloningen of Allocation Voting-activiteit sinds het begin van de oudste van de laatste 12 voltooide rondes. Je kunt doorgaan met de VeInvite-missies.',
    autoProgress:
      'Je dApp-beloningen, VOT3-conversie en deelname aan Allocation Voting worden automatisch on-chain geverifieerd.',
  },
  de: {
    eligibilityDescription:
      'Du kannst teilnehmen, wenn du neu bei VeBetterDAO bist oder zurückkehrst und seit Beginn der ältesten der letzten 12 abgeschlossenen Runden keine VeBetterDAO-Belohnungen oder Allocation-Voting-Aktivität hattest.',
    newSuccessDescription:
      'Für diese Wallet wurden keine früheren VeBetterDAO-Belohnungen oder Allocation-Voting-Aktivitäten gefunden. Du kannst mit den VeInvite-Missionen fortfahren.',
    returningSuccessDescription:
      'Diese Wallet hat ältere VeBetterDAO-Aktivität, aber seit Beginn der ältesten der letzten 12 abgeschlossenen Runden keine VeBetterDAO-Belohnungen oder Allocation-Voting-Aktivität. Du kannst mit den VeInvite-Missionen fortfahren.',
    autoProgress:
      'Deine dApp-Belohnungen, die VOT3-Umwandlung und die Teilnahme am Allocation Voting werden automatisch on-chain verifiziert.',
  },
  fr: {
    eligibilityDescription:
      'Vous pouvez participer si vous découvrez VeBetterDAO ou si vous revenez sans récompense VeBetterDAO ni activité d’Allocation Voting depuis le début du plus ancien des 12 derniers rounds terminés.',
    newSuccessDescription:
      'Aucun historique de récompense VeBetterDAO ni d’Allocation Voting n’a été trouvé pour ce wallet. Vous pouvez poursuivre les missions VeInvite.',
    returningSuccessDescription:
      'Ce wallet présente une activité VeBetterDAO plus ancienne, mais aucune récompense VeBetterDAO ni activité d’Allocation Voting depuis le début du plus ancien des 12 derniers rounds terminés. Vous pouvez poursuivre les missions VeInvite.',
    autoProgress:
      'Les récompenses dApp, la conversion en VOT3 et la participation à l’Allocation Voting sont vérifiées automatiquement on-chain.',
  },
};

for (const locale of Object.keys(INVITEE_ELIGIBILITY_COPY) as Locale[]) {
  Object.assign(INVITEE_COPY[locale], INVITEE_ELIGIBILITY_COPY[locale]);
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