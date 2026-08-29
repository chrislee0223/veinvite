import type { Locale } from './locales';

type GuideStep = {
  title: string;
  description: string;
};

type GuideCopy = {
  eyebrow: string;
  title: string;
  description: string;
  steps: [GuideStep, GuideStep, GuideStep];
  eligibilityTitle: string;
  newTitle: string;
  newDescription: string;
  returningTitle: string;
  returningDescription: string;
  countTitle: string;
  countDescription: string;
};

export const GUIDE_COPY: Record<Locale, GuideCopy> = {
  en: {
    eyebrow: '30-SECOND GUIDE',
    title: 'How VeInvite works',
    description:
      "VeInvite doesn't reward a link click. A referral counts only after your friend completes the full journey and passes verification.",
    steps: [
      {
        title: 'Invite one friend',
        description:
          'Only one invite can be active at a time. Once your friend completes every mission and the final check is finished, you can invite someone else.',
      },
      {
        title: 'They finish every mission',
        description:
          'They earn B3TR from three different VeBetterDAO dApps, convert B3TR to VOT3, and vote.',
      },
      {
        title: 'Claim after verification',
        description:
          "Once the final checks are complete, you'll get a notice and can request your reward from Home.",
      },
    ],
    eligibilityTitle: 'Who can take part?',
    newTitle: 'New user',
    newDescription:
      'A wallet with no previous VeBetterDAO reward or voting history.',
    returningTitle: 'Returning user',
    returningDescription:
      'A user with no reward or voting activity in the last 12 completed rounds.',
    countTitle: 'What the public totals count',
    countDescription:
      'New and returning user totals include only wallets that finished every mission and passed verification.',
  },
  ko: {
    eyebrow: '30초 가이드',
    title: '이렇게 초대하면 돼요',
    description:
      'VeInvite는 링크만 열었다고 보상을 주지 않아요. 친구가 생태계를 끝까지 경험하고 검증을 통과해야 초대가 완료돼요.',
    steps: [
      {
        title: '친구 한 명 초대',
        description:
          '활성 초대 슬롯은 한 개예요. 친구가 미션을 모두 완료하고 최종 확인이 끝나면 다음 친구를 초대할 수 있어요.',
      },
      {
        title: '친구가 모든 미션 완료',
        description:
          '서로 다른 VeBetterDAO dApp 3개에서 활동해 B3TR 보상을 받고, B3TR → VOT3 전환과 투표까지 완료해야 해요.',
      },
      {
        title: '검증 후 보상 수령',
        description:
          '최종 검토를 통과하면 알림을 받고 홈에서 보상 수령을 요청할 수 있어요.',
      },
    ],
    eligibilityTitle: '누가 참여할 수 있나요?',
    newTitle: '신규 사용자',
    newDescription:
      '이전 VeBetterDAO 보상이나 투표 이력이 없는 지갑이에요.',
    returningTitle: '복귀 사용자',
    returningDescription:
      '최근 12개 완료 라운드 동안 보상이나 투표 활동이 없었던 사용자예요.',
    countTitle: '공개 집계 기준',
    countDescription:
      '모든 미션을 완료하고 검증을 통과한 지갑만 신규·복귀 사용자 수에 포함해요.',
  },
  zh: {
    eyebrow: '30 秒指南',
    title: 'VeInvite 怎么用',
    description:
      'VeInvite 不会因为点开邀请链接就发放奖励。好友需要完成全部流程并通过验证，这次邀请才算完成。',
    steps: [
      {
        title: '邀请一位好友',
        description:
          '同一时间只能有一个有效邀请。好友完成所有任务并通过最终检查后，你就可以邀请下一位好友。',
      },
      {
        title: '好友完成全部任务',
        description:
          '好友需要在 3 个不同的 VeBetterDAO dApp 中获得 B3TR 奖励，再把 B3TR 转为 VOT3，并完成一次投票。',
      },
      {
        title: '验证通过后领取奖励',
        description:
          '最终检查通过后，你会收到提示，并可在首页提交奖励领取请求。',
      },
    ],
    eligibilityTitle: '哪些用户可以参加？',
    newTitle: '新用户',
    newDescription:
      '此前没有 VeBetterDAO 奖励或投票记录的钱包。',
    returningTitle: '回归用户',
    returningDescription:
      '最近 12 个已结束轮次内没有奖励或投票活动的用户。',
    countTitle: '公开数据如何统计',
    countDescription:
      '新用户和回归用户数据只统计完成全部任务并通过验证的钱包。',
  },
  hi: {
    eyebrow: '30-सेकंड गाइड',
    title: 'VeInvite कैसे काम करता है',
    description:
      'सिर्फ लिंक खोलने पर VeInvite इनाम नहीं देता। रेफ़रल तभी पूरा माना जाता है जब आपका दोस्त सभी चरण पूरे करके सत्यापन पास कर ले।',
    steps: [
      {
        title: 'एक दोस्त को आमंत्रित करें',
        description:
          'एक समय में केवल एक सक्रिय आमंत्रण हो सकता है। दोस्त के सभी मिशन और अंतिम जाँच पूरी होते ही आप किसी और को आमंत्रित कर सकते हैं।',
      },
      {
        title: 'दोस्त सभी मिशन पूरा करे',
        description:
          'उसे तीन अलग-अलग VeBetterDAO dApps से B3TR कमाना, B3TR को VOT3 में बदलना और एक वोट करना होगा।',
      },
      {
        title: 'सत्यापन के बाद इनाम माँगें',
        description:
          'अंतिम जाँच पूरी होने पर आपको सूचना मिलेगी और आप होम से अपना इनाम अनुरोध कर सकेंगे।',
      },
    ],
    eligibilityTitle: 'कौन भाग ले सकता है?',
    newTitle: 'नया उपयोगकर्ता',
    newDescription:
      'ऐसा वॉलेट जिसमें पहले कोई VeBetterDAO इनाम या वोटिंग इतिहास नहीं है।',
    returningTitle: 'वापसी करने वाला उपयोगकर्ता',
    returningDescription:
      'ऐसा उपयोगकर्ता जिसने पिछले 12 पूरे हुए राउंड में कोई इनाम या वोटिंग गतिविधि नहीं की।',
    countTitle: 'सार्वजनिक आँकड़ों में क्या गिना जाता है',
    countDescription:
      'नए और वापस आने वाले उपयोगकर्ताओं में केवल वे वॉलेट गिने जाते हैं जिन्होंने सभी मिशन पूरे किए और सत्यापन पास किया।',
  },
  es: {
    eyebrow: 'GUÍA EN 30 SEGUNDOS',
    title: 'Cómo funciona VeInvite',
    description:
      'VeInvite no recompensa por abrir un enlace. La invitación solo cuenta cuando tu amigo completa todo el recorrido y supera la verificación.',
    steps: [
      {
        title: 'Invita a un amigo',
        description:
          'Solo puede haber una invitación activa a la vez. Cuando tu amigo complete todas las misiones y termine la verificación final, podrás invitar a otra persona.',
      },
      {
        title: 'Completa todas las misiones',
        description:
          'Tu amigo debe ganar B3TR en tres dApps distintas de VeBetterDAO, convertir B3TR a VOT3 y votar.',
      },
      {
        title: 'Solicita la recompensa tras verificar',
        description:
          'Cuando terminen las comprobaciones finales, recibirás un aviso y podrás solicitar la recompensa desde Inicio.',
      },
    ],
    eligibilityTitle: '¿Quién puede participar?',
    newTitle: 'Usuario nuevo',
    newDescription:
      'Una cartera sin historial previo de recompensas o votaciones en VeBetterDAO.',
    returningTitle: 'Usuario que regresa',
    returningDescription:
      'Un usuario sin actividad de recompensas ni votaciones durante las últimas 12 rondas completadas.',
    countTitle: 'Qué incluyen las cifras públicas',
    countDescription:
      'Los totales de usuarios nuevos y que regresan solo incluyen carteras que completaron todas las misiones y superaron la verificación.',
  },
  ja: {
    eyebrow: '30秒ガイド',
    title: 'VeInviteの使い方',
    description:
      'VeInviteは、リンクを開いただけでは報酬の対象になりません。友だちがすべてのステップを完了し、確認を通過して初めて招待完了となります。',
    steps: [
      {
        title: '友だちを1人招待',
        description:
          '有効にできる招待は同時に1件だけです。友だちが全ミッションを終え、最終確認が完了すると次の友だちを招待できます。',
      },
      {
        title: 'すべてのミッションを完了',
        description:
          '異なる3つのVeBetterDAO dAppでB3TRを獲得し、B3TRをVOT3へ変換して、1回投票します。',
      },
      {
        title: '確認後に報酬を申請',
        description:
          '最終確認が終わると通知が表示され、ホームから報酬を申請できます。',
      },
    ],
    eligibilityTitle: '参加できるのは？',
    newTitle: '新規ユーザー',
    newDescription:
      '過去にVeBetterDAOの報酬受取や投票履歴がないウォレットです。',
    returningTitle: '復帰ユーザー',
    returningDescription:
      '直近12回の完了済みラウンドで報酬受取や投票がなかったユーザーです。',
    countTitle: '公開集計の対象',
    countDescription:
      '新規・復帰ユーザー数には、全ミッションを完了して確認を通過したウォレットだけを含みます。',
  },
  it: {
    eyebrow: 'GUIDA IN 30 SECONDI',
    title: 'Come funziona VeInvite',
    description:
      'VeInvite non premia il semplice clic su un link. Un invito conta solo quando il tuo amico completa tutto il percorso e supera la verifica.',
    steps: [
      {
        title: 'Invita un amico',
        description:
          'Può esserci un solo invito attivo alla volta. Quando il tuo amico completa tutte le missioni e il controllo finale, puoi invitare un’altra persona.',
      },
      {
        title: 'Completa tutte le missioni',
        description:
          'Il tuo amico deve guadagnare B3TR da tre dApp VeBetterDAO diverse, convertire B3TR in VOT3 e votare.',
      },
      {
        title: 'Richiedi la ricompensa dopo la verifica',
        description:
          'Al termine dei controlli finali riceverai un avviso e potrai richiedere la ricompensa dalla Home.',
      },
    ],
    eligibilityTitle: 'Chi può partecipare?',
    newTitle: 'Nuovo utente',
    newDescription:
      'Un wallet senza precedenti ricompense o votazioni su VeBetterDAO.',
    returningTitle: 'Utente di ritorno',
    returningDescription:
      'Un utente senza ricompense o votazioni nelle ultime 12 tornate completate.',
    countTitle: 'Cosa includono i dati pubblici',
    countDescription:
      'I totali dei nuovi utenti e di quelli di ritorno includono solo i wallet che hanno completato tutte le missioni e superato la verifica.',
  },
  tr: {
    eyebrow: '30 SANİYELİK REHBER',
    title: 'VeInvite nasıl çalışır',
    description:
      'VeInvite yalnızca bağlantıya tıklandığı için ödül vermez. Davet, arkadaşın tüm süreci tamamlayıp doğrulamadan geçtiğinde sayılır.',
    steps: [
      {
        title: 'Bir arkadaşını davet et',
        description:
          'Aynı anda yalnızca bir aktif davet olabilir. Arkadaşın tüm görevleri ve son kontrolü tamamladığında başka birini davet edebilirsin.',
      },
      {
        title: 'Tüm görevleri tamamlasın',
        description:
          'Üç farklı VeBetterDAO dApp’inden B3TR kazanmalı, B3TR’yi VOT3’e dönüştürmeli ve oy kullanmalı.',
      },
      {
        title: 'Doğrulamadan sonra ödülü iste',
        description:
          'Son kontroller tamamlandığında bildirim alırsın ve Ana Sayfa’dan ödülünü talep edebilirsin.',
      },
    ],
    eligibilityTitle: 'Kimler katılabilir?',
    newTitle: 'Yeni kullanıcı',
    newDescription:
      'Daha önce VeBetterDAO ödülü veya oy geçmişi olmayan bir cüzdan.',
    returningTitle: 'Geri dönen kullanıcı',
    returningDescription:
      'Son 12 tamamlanmış turda ödül veya oy etkinliği olmayan bir kullanıcı.',
    countTitle: 'Herkese açık toplamlar neyi sayıyor?',
    countDescription:
      'Yeni ve geri dönen kullanıcı toplamlarına yalnızca tüm görevleri tamamlayıp doğrulamadan geçen cüzdanlar dahil edilir.',
  },
  nl: {
    eyebrow: 'UITLEG IN 30 SECONDEN',
    title: 'Zo werkt VeInvite',
    description:
      'VeInvite beloont niet alleen het openen van een link. Een uitnodiging telt pas als je vriend het hele traject afrondt en de controle doorstaat.',
    steps: [
      {
        title: 'Nodig één vriend uit',
        description:
          'Er kan maar één uitnodiging tegelijk actief zijn. Zodra je vriend alle missies en de laatste controle heeft afgerond, kun je iemand anders uitnodigen.',
      },
      {
        title: 'Laat alle missies afronden',
        description:
          'Je vriend verdient B3TR bij drie verschillende VeBetterDAO-dApps, zet B3TR om naar VOT3 en brengt een stem uit.',
      },
      {
        title: 'Vraag de beloning aan na controle',
        description:
          'Na de laatste controles krijg je een melding en kun je op Home je beloning aanvragen.',
      },
    ],
    eligibilityTitle: 'Wie kan meedoen?',
    newTitle: 'Nieuwe gebruiker',
    newDescription:
      'Een wallet zonder eerdere VeBetterDAO-beloning of stemgeschiedenis.',
    returningTitle: 'Terugkerende gebruiker',
    returningDescription:
      'Een gebruiker zonder beloning of stemactiviteit in de laatste 12 afgeronde rondes.',
    countTitle: 'Wat telt mee in de openbare cijfers?',
    countDescription:
      'De totalen voor nieuwe en terugkerende gebruikers tellen alleen wallets die alle missies hebben afgerond en de controle hebben doorstaan.',
  },
  de: {
    eyebrow: '30-SEKUNDEN-ANLEITUNG',
    title: 'So funktioniert VeInvite',
    description:
      'VeInvite belohnt nicht das bloße Öffnen eines Links. Eine Einladung zählt erst, wenn dein Freund den gesamten Ablauf abgeschlossen und die Prüfung bestanden hat.',
    steps: [
      {
        title: 'Einen Freund einladen',
        description:
          'Es kann immer nur eine Einladung aktiv sein. Sobald dein Freund alle Missionen und die abschließende Prüfung erledigt hat, kannst du die nächste Person einladen.',
      },
      {
        title: 'Alle Missionen abschließen',
        description:
          'Dein Freund verdient B3TR bei drei verschiedenen VeBetterDAO-dApps, wandelt B3TR in VOT3 um und gibt eine Stimme ab.',
      },
      {
        title: 'Belohnung nach Prüfung anfordern',
        description:
          'Nach den abschließenden Prüfungen bekommst du einen Hinweis und kannst die Belohnung auf der Startseite anfordern.',
      },
    ],
    eligibilityTitle: 'Wer kann teilnehmen?',
    newTitle: 'Neuer Nutzer',
    newDescription:
      'Eine Wallet ohne frühere VeBetterDAO-Belohnungen oder Abstimmungen.',
    returningTitle: 'Zurückkehrender Nutzer',
    returningDescription:
      'Ein Nutzer ohne Belohnungs- oder Abstimmungsaktivität in den letzten 12 abgeschlossenen Runden.',
    countTitle: 'Was zählt in den öffentlichen Zahlen?',
    countDescription:
      'Bei neuen und zurückkehrenden Nutzern zählen nur Wallets, die alle Missionen abgeschlossen und die Prüfung bestanden haben.',
  },
  fr: {
    eyebrow: 'GUIDE EN 30 SECONDES',
    title: 'Comment fonctionne VeInvite',
    description:
      'VeInvite ne récompense pas un simple clic sur un lien. Une invitation compte uniquement lorsque votre ami termine tout le parcours et passe la vérification.',
    steps: [
      {
        title: 'Invitez un ami',
        description:
          'Une seule invitation peut être active à la fois. Quand votre ami a terminé toutes les missions et la vérification finale, vous pouvez inviter quelqu’un d’autre.',
      },
      {
        title: 'Il termine toutes les missions',
        description:
          'Votre ami doit gagner du B3TR sur trois dApps VeBetterDAO différentes, convertir du B3TR en VOT3 et voter.',
      },
      {
        title: 'Demandez la récompense après vérification',
        description:
          'Une fois les contrôles finaux terminés, vous recevez une notification et pouvez demander votre récompense depuis l’accueil.',
      },
    ],
    eligibilityTitle: 'Qui peut participer ?',
    newTitle: 'Nouvel utilisateur',
    newDescription:
      'Un wallet sans historique de récompense ou de vote VeBetterDAO.',
    returningTitle: 'Utilisateur de retour',
    returningDescription:
      'Un utilisateur sans récompense ni vote au cours des 12 dernières manches terminées.',
    countTitle: 'Ce que comptent les chiffres publics',
    countDescription:
      'Les totaux des nouveaux utilisateurs et des utilisateurs de retour incluent uniquement les wallets ayant terminé toutes les missions et passé la vérification.',
  },
};
