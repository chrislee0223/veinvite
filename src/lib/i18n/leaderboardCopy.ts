import type { Locale } from './locales';

type LeaderboardCopy = {
  eyebrow: string;
  title: string;
  description: string;
  impactTitle: string;
  totalUsers: string;
  newUsers: string;
  returningUsers: string;
  impactNote: string;
  reportingSince: (round: number) => string;
  rank: string;
  wallet: string;
  completed: string;
  earned: string;
  myRank: string;
  unranked: string;
  connectForRank: string;
  empty: string;
  loading: string;
  loadError: string;
  retry: string;
  walletDetails: string;
  fullAddress: string;
  viewExplorer: string;
  explorerNote: string;
  close: string;
  openWallet: (address: string) => string;
};

export const LEADERBOARD_COPY: Record<Locale, LeaderboardCopy> = {
  en: {
    eyebrow: 'ALL-TIME',
    title: 'VeInvite Leaderboard',
    description:
      'Rankings count referrals only after every mission is complete and the inviter has received the verified reward payout.',
    impactTitle: 'People onboarded through VeInvite',
    totalUsers: 'Total',
    newUsers: 'New users',
    returningUsers: 'Returning users',
    impactNote:
      'Only wallets that finished every mission and passed verification are counted.',
    reportingSince: (round) =>
      `Official totals are tracked from Round ${round}.`,
    rank: 'Rank',
    wallet: 'Wallet',
    completed: 'Completed',
    earned: 'B3TR earned',
    myRank: 'My rank',
    unranked: 'Not ranked',
    connectForRank:
      'Connect your wallet to see your rank here.',
    empty:
      'No referral rewards have been paid yet.',
    loading: 'Loading the leaderboard…',
    loadError: 'The leaderboard could not be loaded.',
    retry: 'Try again',
    walletDetails: 'Wallet details',
    fullAddress: 'Full wallet address',
    viewExplorer: 'View on VeChain Explorer',
    explorerNote:
      'The Explorer shows public on-chain activity.',
    close: 'Close',
    openWallet: (address) =>
      `View details for wallet ${address}`,
  },
  ko: {
    eyebrow: '전체 누계',
    title: 'VeInvite 리더보드',
    description:
      '친구가 모든 미션을 완료하고, 초대한 사람이 실제 보상까지 받은 건만 순위에 반영해요.',
    impactTitle: 'VeInvite를 통해 참여한 사용자',
    totalUsers: '전체',
    newUsers: '신규 사용자',
    returningUsers: '복귀 사용자',
    impactNote:
      '모든 미션을 완료하고 검증을 통과한 지갑만 집계해요.',
    reportingSince: (round) =>
      `공식 누계는 ${round} 라운드부터 집계해요.`,
    rank: '순위',
    wallet: '지갑',
    completed: '완료한 친구',
    earned: '누적 보상',
    myRank: '내 순위',
    unranked: '순위 없음',
    connectForRank:
      '지갑을 연결하면 내 순위를 바로 확인할 수 있어요.',
    empty:
      '아직 지급까지 완료된 초대 보상이 없어요.',
    loading: '리더보드를 불러오는 중이에요…',
    loadError: '리더보드를 불러오지 못했어요.',
    retry: '다시 불러오기',
    walletDetails: '지갑 활동 확인',
    fullAddress: '전체 지갑 주소',
    viewExplorer: 'VeChain Explorer에서 확인',
    explorerNote:
      'Explorer에는 공개된 온체인 활동만 표시돼요.',
    close: '닫기',
    openWallet: (address) =>
      `${address} 지갑 상세 보기`,
  },
  zh: {
    eyebrow: '历史累计',
    title: 'VeInvite 排行榜',
    description:
      '只有好友完成全部任务，并且邀请人已经收到经验证的实际奖励后，这次邀请才会计入排名。',
    impactTitle: '通过 VeInvite 完成引导的用户',
    totalUsers: '总计',
    newUsers: '新用户',
    returningUsers: '回归用户',
    impactNote:
      '只统计完成所有任务并通过验证的钱包。',
    reportingSince: (round) =>
      `官方累计数据从第 ${round} 轮开始统计。`,
    rank: '排名',
    wallet: '钱包',
    completed: '完成邀请',
    earned: '累计 B3TR',
    myRank: '我的排名',
    unranked: '暂无排名',
    connectForRank:
      '连接钱包即可查看你的排名。',
    empty: '目前还没有完成实际奖励发放的邀请。',
    loading: '正在加载排行榜…',
    loadError: '无法加载排行榜。',
    retry: '重新加载',
    walletDetails: '钱包详情',
    fullAddress: '完整钱包地址',
    viewExplorer: '在 VeChain Explorer 中查看',
    explorerNote:
      'Explorer 只显示公开的链上活动。',
    close: '关闭',
    openWallet: (address) =>
      `查看钱包 ${address} 的详情`,
  },
  hi: {
    eyebrow: 'अब तक',
    title: 'VeInvite लीडरबोर्ड',
    description:
      'रैंकिंग में रेफ़रल तभी गिना जाता है जब दोस्त सभी मिशन पूरा कर ले और आमंत्रक को सत्यापित इनाम वास्तव में मिल चुका हो।',
    impactTitle: 'VeInvite के ज़रिए जुड़े उपयोगकर्ता',
    totalUsers: 'कुल',
    newUsers: 'नए उपयोगकर्ता',
    returningUsers: 'वापसी करने वाले',
    impactNote:
      'केवल वे वॉलेट गिने जाते हैं जिन्होंने सभी मिशन पूरे किए और सत्यापन पास किया।',
    reportingSince: (round) =>
      `आधिकारिक आँकड़े राउंड ${round} से गिने जा रहे हैं।`,
    rank: 'रैंक',
    wallet: 'वॉलेट',
    completed: 'पूरा किया',
    earned: 'कमाया B3TR',
    myRank: 'मेरी रैंक',
    unranked: 'रैंक नहीं है',
    connectForRank:
      'अपनी रैंक देखने के लिए वॉलेट कनेक्ट करें।',
    empty: 'अभी तक कोई रेफ़रल इनाम भुगतान नहीं हुआ है।',
    loading: 'लीडरबोर्ड लोड हो रहा है…',
    loadError: 'लीडरबोर्ड लोड नहीं हो सका।',
    retry: 'फिर कोशिश करें',
    walletDetails: 'वॉलेट विवरण',
    fullAddress: 'पूरा वॉलेट पता',
    viewExplorer: 'VeChain Explorer पर देखें',
    explorerNote:
      'Explorer केवल सार्वजनिक ऑन-चेन गतिविधि दिखाता है।',
    close: 'बंद करें',
    openWallet: (address) =>
      `वॉलेट ${address} का विवरण देखें`,
  },
  es: {
    eyebrow: 'HISTÓRICO',
    title: 'Clasificación de VeInvite',
    description:
      'Una invitación solo entra en la clasificación cuando el amigo completa todas las misiones y el invitador ya ha recibido la recompensa verificada.',
    impactTitle: 'Usuarios incorporados mediante VeInvite',
    totalUsers: 'Total',
    newUsers: 'Usuarios nuevos',
    returningUsers: 'Usuarios que regresan',
    impactNote:
      'Solo se cuentan las carteras que completaron todas las misiones y superaron la verificación.',
    reportingSince: (round) =>
      `Los totales oficiales se contabilizan desde la ronda ${round}.`,
    rank: 'Puesto',
    wallet: 'Cartera',
    completed: 'Completadas',
    earned: 'B3TR acumulado',
    myRank: 'Mi puesto',
    unranked: 'Sin clasificar',
    connectForRank:
      'Conecta tu cartera para ver aquí tu puesto.',
    empty:
      'Todavía no se ha pagado ninguna recompensa por invitación.',
    loading: 'Cargando la clasificación…',
    loadError: 'No se pudo cargar la clasificación.',
    retry: 'Volver a intentar',
    walletDetails: 'Detalles de la cartera',
    fullAddress: 'Dirección completa',
    viewExplorer: 'Ver en VeChain Explorer',
    explorerNote:
      'Explorer muestra únicamente actividad pública en cadena.',
    close: 'Cerrar',
    openWallet: (address) =>
      `Ver detalles de la cartera ${address}`,
  },
  ja: {
    eyebrow: '累計',
    title: 'VeInvite ランキング',
    description:
      '友だちがすべてのミッションを完了し、招待した人への確認済み報酬の支払いまで完了した招待だけがランキングに反映されます。',
    impactTitle: 'VeInviteから参加したユーザー',
    totalUsers: '合計',
    newUsers: '新規ユーザー',
    returningUsers: '復帰ユーザー',
    impactNote:
      'すべてのミッションを完了し、確認を通過したウォレットだけを集計します。',
    reportingSince: (round) =>
      `公式集計はラウンド${round}から開始しています。`,
    rank: '順位',
    wallet: 'ウォレット',
    completed: '完了数',
    earned: '累計B3TR',
    myRank: '自分の順位',
    unranked: '順位なし',
    connectForRank:
      'ウォレットを接続すると自分の順位を確認できます。',
    empty: 'まだ報酬の支払いまで完了した招待はありません。',
    loading: 'ランキングを読み込み中…',
    loadError: 'ランキングを読み込めませんでした。',
    retry: 'もう一度試す',
    walletDetails: 'ウォレット詳細',
    fullAddress: 'ウォレットの全アドレス',
    viewExplorer: 'VeChain Explorerで確認',
    explorerNote:
      'Explorerには公開されているオンチェーン活動のみ表示されます。',
    close: '閉じる',
    openWallet: (address) =>
      `ウォレット ${address} の詳細を表示`,
  },
  it: {
    eyebrow: 'DA SEMPRE',
    title: 'Classifica VeInvite',
    description:
      'Un invito entra in classifica solo quando l’amico ha completato tutte le missioni e chi lo ha invitato ha già ricevuto la ricompensa verificata.',
    impactTitle: 'Utenti entrati tramite VeInvite',
    totalUsers: 'Totale',
    newUsers: 'Nuovi utenti',
    returningUsers: 'Utenti di ritorno',
    impactNote:
      'Vengono conteggiati solo i wallet che hanno completato tutte le missioni e superato la verifica.',
    reportingSince: (round) =>
      `I totali ufficiali vengono conteggiati dalla tornata ${round}.`,
    rank: 'Posizione',
    wallet: 'Wallet',
    completed: 'Completati',
    earned: 'B3TR accumulati',
    myRank: 'La mia posizione',
    unranked: 'Non in classifica',
    connectForRank:
      'Collega il wallet per vedere qui la tua posizione.',
    empty:
      'Non è ancora stata pagata alcuna ricompensa per gli inviti.',
    loading: 'Caricamento classifica…',
    loadError: 'Impossibile caricare la classifica.',
    retry: 'Riprova',
    walletDetails: 'Dettagli wallet',
    fullAddress: 'Indirizzo completo del wallet',
    viewExplorer: 'Apri in VeChain Explorer',
    explorerNote:
      'Explorer mostra solo attività pubbliche on-chain.',
    close: 'Chiudi',
    openWallet: (address) =>
      `Mostra i dettagli del wallet ${address}`,
  },
  tr: {
    eyebrow: 'TÜM ZAMANLAR',
    title: 'VeInvite Liderlik Tablosu',
    description:
      'Bir davet, yalnızca arkadaş tüm görevleri tamamladığında ve davet eden kişi doğrulanmış ödül ödemesini gerçekten aldığında sıralamaya dahil edilir.',
    impactTitle: 'VeInvite ile katılan kullanıcılar',
    totalUsers: 'Toplam',
    newUsers: 'Yeni kullanıcılar',
    returningUsers: 'Geri dönenler',
    impactNote:
      'Yalnızca tüm görevleri tamamlayıp doğrulamadan geçen cüzdanlar sayılır.',
    reportingSince: (round) =>
      `Resmî toplamlar ${round}. turdan itibaren tutuluyor.`,
    rank: 'Sıra',
    wallet: 'Cüzdan',
    completed: 'Tamamlanan',
    earned: 'Toplam B3TR',
    myRank: 'Sıram',
    unranked: 'Sıralamada yok',
    connectForRank:
      'Sıranı görmek için cüzdanını bağla.',
    empty: 'Henüz ödemesi tamamlanan bir davet ödülü yok.',
    loading: 'Liderlik tablosu yükleniyor…',
    loadError: 'Liderlik tablosu yüklenemedi.',
    retry: 'Tekrar dene',
    walletDetails: 'Cüzdan ayrıntıları',
    fullAddress: 'Tam cüzdan adresi',
    viewExplorer: 'VeChain Explorer’da görüntüle',
    explorerNote:
      'Explorer yalnızca herkese açık zincir üstü etkinlikleri gösterir.',
    close: 'Kapat',
    openWallet: (address) =>
      `${address} cüzdanının ayrıntılarını görüntüle`,
  },
  nl: {
    eyebrow: 'ALTIJD',
    title: 'VeInvite-ranglijst',
    description:
      'Een uitnodiging telt pas mee voor de ranglijst nadat de vriend alle missies heeft afgerond én de uitnodiger de geverifieerde beloning daadwerkelijk heeft ontvangen.',
    impactTitle: 'Gebruikers gestart via VeInvite',
    totalUsers: 'Totaal',
    newUsers: 'Nieuwe gebruikers',
    returningUsers: 'Terugkerende gebruikers',
    impactNote:
      'Alleen wallets die alle missies hebben afgerond en de controle hebben doorstaan, worden meegeteld.',
    reportingSince: (round) =>
      `De officiële totalen worden bijgehouden vanaf ronde ${round}.`,
    rank: 'Positie',
    wallet: 'Wallet',
    completed: 'Voltooid',
    earned: 'B3TR verdiend',
    myRank: 'Mijn positie',
    unranked: 'Niet gerangschikt',
    connectForRank:
      'Verbind je wallet om hier je positie te zien.',
    empty:
      'Er zijn nog geen uitnodigingsbeloningen uitbetaald.',
    loading: 'Ranglijst laden…',
    loadError: 'De ranglijst kon niet worden geladen.',
    retry: 'Opnieuw proberen',
    walletDetails: 'Walletdetails',
    fullAddress: 'Volledig walletadres',
    viewExplorer: 'Bekijken in VeChain Explorer',
    explorerNote:
      'Explorer toont alleen openbare on-chain activiteit.',
    close: 'Sluiten',
    openWallet: (address) =>
      `Details van wallet ${address} bekijken`,
  },
  de: {
    eyebrow: 'GESAMT',
    title: 'VeInvite-Rangliste',
    description:
      'Eine Einladung zählt erst dann für die Rangliste, wenn der Freund alle Missionen abgeschlossen hat und die einladende Person die verifizierte Belohnung tatsächlich erhalten hat.',
    impactTitle: 'Über VeInvite gestartete Nutzer',
    totalUsers: 'Gesamt',
    newUsers: 'Neue Nutzer',
    returningUsers: 'Zurückkehrende Nutzer',
    impactNote:
      'Gezählt werden nur Wallets, die alle Missionen abgeschlossen und die Prüfung bestanden haben.',
    reportingSince: (round) =>
      `Die offiziellen Gesamtwerte werden ab Runde ${round} erfasst.`,
    rank: 'Rang',
    wallet: 'Wallet',
    completed: 'Abgeschlossen',
    earned: 'B3TR gesamt',
    myRank: 'Mein Rang',
    unranked: 'Nicht platziert',
    connectForRank:
      'Verbinde deine Wallet, um deinen Rang zu sehen.',
    empty:
      'Bisher wurde noch keine Einladungsbelohnung ausgezahlt.',
    loading: 'Rangliste wird geladen…',
    loadError: 'Die Rangliste konnte nicht geladen werden.',
    retry: 'Noch einmal versuchen',
    walletDetails: 'Wallet-Details',
    fullAddress: 'Vollständige Wallet-Adresse',
    viewExplorer: 'Im VeChain Explorer ansehen',
    explorerNote:
      'Der Explorer zeigt nur öffentliche On-Chain-Aktivitäten.',
    close: 'Schließen',
    openWallet: (address) =>
      `Details zur Wallet ${address} ansehen`,
  },
  fr: {
    eyebrow: 'DEPUIS LE DÉBUT',
    title: 'Classement VeInvite',
    description:
      'Une invitation n’entre dans le classement qu’après la fin de toutes les missions et le versement effectif de la récompense vérifiée à la personne qui a invité.',
    impactTitle: 'Utilisateurs intégrés via VeInvite',
    totalUsers: 'Total',
    newUsers: 'Nouveaux utilisateurs',
    returningUsers: 'Utilisateurs de retour',
    impactNote:
      'Seuls les wallets ayant terminé toutes les missions et passé la vérification sont comptabilisés.',
    reportingSince: (round) =>
      `Les totaux officiels sont comptabilisés à partir de la manche ${round}.`,
    rank: 'Rang',
    wallet: 'Wallet',
    completed: 'Terminées',
    earned: 'B3TR cumulés',
    myRank: 'Mon rang',
    unranked: 'Non classé',
    connectForRank:
      'Connectez votre wallet pour voir votre rang.',
    empty:
      'Aucune récompense d’invitation n’a encore été versée.',
    loading: 'Chargement du classement…',
    loadError: 'Impossible de charger le classement.',
    retry: 'Réessayer',
    walletDetails: 'Détails du wallet',
    fullAddress: 'Adresse complète du wallet',
    viewExplorer: 'Voir dans VeChain Explorer',
    explorerNote:
      'Explorer affiche uniquement l’activité publique on-chain.',
    close: 'Fermer',
    openWallet: (address) =>
      `Voir les détails du wallet ${address}`,
  },
};
