import type { Locale } from './locales';

type GuideFlowCopy = {
  description: string;
  inviteDescription: string;
  countDescription: string;
};

export const GUIDE_FLOW_COPY: Record<Locale, GuideFlowCopy> = {
  en: {
    description:
      "VeInvite doesn't reward a link click. A referral counts only after your friend completes every mission.",
    inviteDescription:
      'You have one permanent invite link and two reusable friend slots. Up to two eligible friends can progress at the same time. Opening the link alone never uses a slot; a slot is reserved only after eligibility is verified.',
    countDescription:
      'New and returning user totals include only wallets that finished every mission.',
  },
  ko: {
    description:
      'VeInvite는 링크만 열었다고 보상을 주지 않아요. 친구가 모든 미션을 완료해야 초대가 완료돼요.',
    inviteDescription:
      '영구 초대 링크 1개와 재사용 가능한 친구 슬롯 2개가 있어요. 자격을 충족한 친구는 동시에 최대 2명까지 진행할 수 있어요. 링크를 열기만 해서는 슬롯을 사용하지 않고, 자격 확인을 통과한 뒤에만 슬롯이 배정돼요.',
    countDescription:
      '모든 미션을 완료한 지갑만 신규·복귀 사용자 수에 포함해요.',
  },
  zh: {
    description:
      'VeInvite 不会因为点开邀请链接就发放奖励。好友完成全部任务后，这次邀请才算完成。',
    inviteDescription:
      '你有一个永久邀请链接和两个可重复使用的好友名额。最多两位符合资格的好友可同时进行。仅打开链接不会占用名额，只有通过资格验证后才会分配名额。',
    countDescription:
      '新用户和回归用户数据只统计完成全部任务的钱包。',
  },
  hi: {
    description:
      'सिर्फ लिंक खोलने पर VeInvite इनाम नहीं देता। रेफ़रल तभी पूरा माना जाता है जब आपका दोस्त सभी मिशन पूरे कर ले।',
    inviteDescription:
      'आपके पास एक स्थायी आमंत्रण लिंक और दो दोबारा इस्तेमाल होने वाले मित्र स्लॉट हैं। एक समय में अधिकतम दो पात्र मित्र आगे बढ़ सकते हैं। लिंक खोलने भर से स्लॉट नहीं लगता; पात्रता सत्यापित होने के बाद ही स्लॉट आरक्षित होता है।',
    countDescription:
      'नए और वापस आने वाले उपयोगकर्ताओं में केवल वे वॉलेट गिने जाते हैं जिन्होंने सभी मिशन पूरे किए हैं।',
  },
  es: {
    description:
      'VeInvite no recompensa por abrir un enlace. La invitación solo cuenta cuando tu amigo completa todas las misiones.',
    inviteDescription:
      'Tienes un enlace de invitación permanente y dos cupos reutilizables. Hasta dos amigos elegibles pueden avanzar al mismo tiempo. Abrir el enlace no ocupa un cupo; solo se reserva después de verificar la elegibilidad.',
    countDescription:
      'Los totales de usuarios nuevos y que regresan solo incluyen carteras que completaron todas las misiones.',
  },
  ja: {
    description:
      'VeInviteは、リンクを開いただけでは報酬の対象になりません。友だちがすべてのミッションを完了して初めて招待完了となります。',
    inviteDescription:
      '永久招待リンクは1つ、再利用できる友だち枠は2つです。対象となる友だちは同時に最大2人まで進行できます。リンクを開くだけでは枠は使われず、参加資格の確認後にのみ枠が確保されます。',
    countDescription:
      '新規・復帰ユーザー数には、すべてのミッションを完了したウォレットだけを含みます。',
  },
  it: {
    description:
      'VeInvite non premia il semplice clic su un link. Un invito conta solo quando il tuo amico completa tutte le missioni.',
    inviteDescription:
      'Hai un link di invito permanente e due posti riutilizzabili. Fino a due amici idonei possono procedere insieme. Aprire il link non occupa un posto; il posto viene riservato solo dopo la verifica dell’idoneità.',
    countDescription:
      'I totali dei nuovi utenti e di quelli di ritorno includono solo i wallet che hanno completato tutte le missioni.',
  },
  tr: {
    description:
      'VeInvite yalnızca davet bağlantısının açılması için ödül vermez. Davet, arkadaşın tüm görevleri tamamladığında tamamlanmış sayılır.',
    inviteDescription:
      'Bir kalıcı davet bağlantın ve yeniden kullanılabilen iki arkadaş yuvan var. Aynı anda en fazla iki uygun arkadaş ilerleyebilir. Bağlantıyı açmak yuva kullanmaz; yuva yalnızca uygunluk doğrulandıktan sonra ayrılır.',
    countDescription:
      'Yeni ve geri dönen kullanıcı toplamlarına yalnızca tüm görevleri tamamlayan cüzdanlar dahil edilir.',
  },
  nl: {
    description:
      'VeInvite beloont niet alleen het openen van een link. Een uitnodiging telt pas wanneer je vriend alle missies heeft voltooid.',
    inviteDescription:
      'Je hebt één permanente uitnodigingslink en twee herbruikbare vriendplekken. Maximaal twee geschikte vrienden kunnen tegelijk doorgaan. Alleen de link openen gebruikt geen plek; die wordt pas gereserveerd na de geschiktheidscontrole.',
    countDescription:
      'De totalen voor nieuwe en terugkerende gebruikers tellen alleen wallets mee die alle missies hebben voltooid.',
  },
  de: {
    description:
      'VeInvite belohnt nicht das bloße Öffnen eines Links. Eine Einladung zählt erst, wenn dein Freund alle Missionen abgeschlossen hat.',
    inviteDescription:
      'Du hast einen permanenten Einladungslink und zwei wiederverwendbare Freund-Plätze. Bis zu zwei berechtigte Freunde können gleichzeitig teilnehmen. Das Öffnen des Links belegt keinen Platz; er wird erst nach der Berechtigungsprüfung reserviert.',
    countDescription:
      'Bei den neuen und zurückkehrenden Nutzern werden nur Wallets gezählt, die alle Missionen abgeschlossen haben.',
  },
  fr: {
    description:
      'VeInvite ne récompense pas le simple fait d’ouvrir un lien. Une invitation ne compte qu’une fois que votre ami a terminé toutes les missions.',
    inviteDescription:
      'Vous disposez d’un lien d’invitation permanent et de deux places réutilisables. Jusqu’à deux amis éligibles peuvent avancer simultanément. Ouvrir le lien ne prend pas de place ; elle n’est réservée qu’après validation de l’éligibilité.',
    countDescription:
      'Les totaux des nouveaux utilisateurs et des utilisateurs de retour incluent uniquement les wallets ayant terminé toutes les missions.',
  },
};
