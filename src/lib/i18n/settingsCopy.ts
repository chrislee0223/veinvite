import type { Locale } from './locales';

type SettingsCopy = {
  eyebrow: string;
  title: string;
  walletTitle: string;
  connected: string;
  notConnected: string;
  connect: string;
  connectAnother: string;
  disconnect: string;
  working: string;
  walletNote: string;
  switchNote: string;
  actionError: string;
  languageTitle: string;
  languageNote: string;
  close: string;
  legalTitle: string;
  privacy: string;
  terms: string;
};

export const SETTINGS_COPY: Record<Locale, SettingsCopy> = {
  en: {
    eyebrow: 'SETTINGS',
    title: 'App settings',
    walletTitle: 'Wallet',
    connected: 'Connected',
    notConnected: 'No wallet connected',
    connect: 'Connect wallet',
    connectAnother: 'Connect another wallet',
    disconnect: 'Disconnect wallet',
    working: 'Working…',
    walletNote:
      "Disconnecting won't delete your invite or reward history.",
    switchNote:
      "When you connect another wallet, you'll sign once to verify that you own it.",
    actionError:
      'Your wallet connection could not be changed. Please try again.',
    languageTitle: 'Language',
    languageNote:
      'Your language choice is saved on this device.',
    close: 'Close',
    legalTitle: 'Legal',
    privacy: 'Privacy Policy',
    terms: 'Terms of Use',
  },
  ko: {
    eyebrow: '설정',
    title: '앱 설정',
    walletTitle: '지갑',
    connected: '연결됨',
    notConnected: '연결된 지갑이 없어요',
    connect: '지갑 연결',
    connectAnother: '다른 지갑 연결',
    disconnect: '지갑 연결 해제',
    working: '처리 중…',
    walletNote:
      '연결을 해제해도 기존 초대와 보상 기록은 그대로 유지돼요.',
    switchNote:
      '다른 지갑을 연결하면 새 지갑에서 소유권 확인 서명을 한 번 진행해요.',
    actionError:
      '지갑 연결 상태를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.',
    languageTitle: '언어',
    languageNote:
      '선택한 언어는 이 기기에 저장돼요.',
    close: '닫기',
    legalTitle: '약관 및 정책',
    privacy: '개인정보처리방침',
    terms: '이용약관',
  },
  zh: {
    eyebrow: '设置',
    title: '应用设置',
    walletTitle: '钱包',
    connected: '已连接',
    notConnected: '尚未连接钱包',
    connect: '连接钱包',
    connectAnother: '连接其他钱包',
    disconnect: '断开钱包连接',
    working: '处理中…',
    walletNote:
      '断开钱包连接不会删除已有的邀请或奖励记录。',
    switchNote:
      '连接其他钱包时，需要签名一次以确认你拥有该钱包。',
    actionError:
      '无法更改钱包连接状态，请稍后再试。',
    languageTitle: '语言',
    languageNote:
      '你选择的语言会保存在这台设备上。',
    close: '关闭',
    legalTitle: '条款与政策',
    privacy: '隐私政策',
    terms: '使用条款',
  },
  hi: {
    eyebrow: 'सेटिंग्स',
    title: 'ऐप सेटिंग्स',
    walletTitle: 'वॉलेट',
    connected: 'कनेक्टेड',
    notConnected: 'कोई वॉलेट कनेक्ट नहीं है',
    connect: 'वॉलेट कनेक्ट करें',
    connectAnother: 'दूसरा वॉलेट कनेक्ट करें',
    disconnect: 'वॉलेट डिस्कनेक्ट करें',
    working: 'प्रोसेस हो रहा है…',
    walletNote:
      'वॉलेट डिस्कनेक्ट करने से आपका आमंत्रण या इनाम इतिहास नहीं मिटेगा।',
    switchNote:
      'दूसरा वॉलेट कनेक्ट करने पर उसके मालिक होने की पुष्टि के लिए एक बार साइन करना होगा।',
    actionError:
      'वॉलेट कनेक्शन बदला नहीं जा सका। कृपया थोड़ी देर बाद फिर कोशिश करें।',
    languageTitle: 'भाषा',
    languageNote:
      'आपकी चुनी हुई भाषा इस डिवाइस पर सेव रहती है।',
    close: 'बंद करें',
    legalTitle: 'नियम और नीतियाँ',
    privacy: 'गोपनीयता नीति',
    terms: 'उपयोग की शर्तें',
  },
  es: {
    eyebrow: 'AJUSTES',
    title: 'Ajustes de la app',
    walletTitle: 'Cartera',
    connected: 'Conectada',
    notConnected: 'No hay ninguna cartera conectada',
    connect: 'Conectar cartera',
    connectAnother: 'Conectar otra cartera',
    disconnect: 'Desconectar cartera',
    working: 'Procesando…',
    walletNote:
      'Desconectar la cartera no borra tu historial de invitaciones ni de recompensas.',
    switchNote:
      'Al conectar otra cartera, firmarás una vez para confirmar que eres su propietario.',
    actionError:
      'No pudimos cambiar la conexión de la cartera. Inténtalo de nuevo en unos instantes.',
    languageTitle: 'Idioma',
    languageNote:
      'El idioma que elijas se guarda en este dispositivo.',
    close: 'Cerrar',
    legalTitle: 'Información legal',
    privacy: 'Política de privacidad',
    terms: 'Términos de uso',
  },
  ja: {
    eyebrow: '設定',
    title: 'アプリ設定',
    walletTitle: 'ウォレット',
    connected: '接続済み',
    notConnected: 'ウォレットは接続されていません',
    connect: 'ウォレットを接続',
    connectAnother: '別のウォレットを接続',
    disconnect: 'ウォレットを切断',
    working: '処理中…',
    walletNote:
      'ウォレットを切断しても、招待や報酬の履歴は削除されません。',
    switchNote:
      '別のウォレットを接続すると、所有確認のために一度署名します。',
    actionError:
      'ウォレットの接続状態を変更できませんでした。少し待ってからもう一度お試しください。',
    languageTitle: '言語',
    languageNote:
      '選んだ言語はこの端末に保存されます。',
    close: '閉じる',
    legalTitle: '規約・ポリシー',
    privacy: 'プライバシーポリシー',
    terms: '利用規約',
  },
  it: {
    eyebrow: 'IMPOSTAZIONI',
    title: 'Impostazioni dell’app',
    walletTitle: 'Wallet',
    connected: 'Collegato',
    notConnected: 'Nessun wallet collegato',
    connect: 'Collega wallet',
    connectAnother: 'Collega un altro wallet',
    disconnect: 'Scollega wallet',
    working: 'Operazione in corso…',
    walletNote:
      'Scollegare il wallet non elimina la cronologia degli inviti o delle ricompense.',
    switchNote:
      'Quando colleghi un altro wallet, dovrai firmare una volta per confermarne la proprietà.',
    actionError:
      'Non è stato possibile modificare il collegamento del wallet. Riprova tra poco.',
    languageTitle: 'Lingua',
    languageNote:
      'La lingua scelta viene salvata su questo dispositivo.',
    close: 'Chiudi',
    legalTitle: 'Note legali',
    privacy: 'Informativa sulla privacy',
    terms: 'Termini di utilizzo',
  },
  tr: {
    eyebrow: 'AYARLAR',
    title: 'Uygulama ayarları',
    walletTitle: 'Cüzdan',
    connected: 'Bağlı',
    notConnected: 'Bağlı cüzdan yok',
    connect: 'Cüzdan bağla',
    connectAnother: 'Başka cüzdan bağla',
    disconnect: 'Cüzdan bağlantısını kes',
    working: 'İşleniyor…',
    walletNote:
      'Cüzdan bağlantısını kesmek davet veya ödül geçmişini silmez.',
    switchNote:
      'Başka bir cüzdan bağladığında, cüzdanın sana ait olduğunu doğrulamak için bir kez imza atarsın.',
    actionError:
      'Cüzdan bağlantısı değiştirilemedi. Lütfen biraz sonra tekrar dene.',
    languageTitle: 'Dil',
    languageNote:
      'Seçtiğin dil bu cihazda saklanır.',
    close: 'Kapat',
    legalTitle: 'Yasal',
    privacy: 'Gizlilik Politikası',
    terms: 'Kullanım Koşulları',
  },
  nl: {
    eyebrow: 'INSTELLINGEN',
    title: 'App-instellingen',
    walletTitle: 'Wallet',
    connected: 'Verbonden',
    notConnected: 'Geen wallet verbonden',
    connect: 'Wallet verbinden',
    connectAnother: 'Andere wallet verbinden',
    disconnect: 'Wallet loskoppelen',
    working: 'Bezig…',
    walletNote:
      'Je uitnodigings- en beloningsgeschiedenis blijft bewaard als je de wallet loskoppelt.',
    switchNote:
      'Als je een andere wallet verbindt, onderteken je één keer om te bevestigen dat die van jou is.',
    actionError:
      'De walletverbinding kon niet worden gewijzigd. Probeer het zo opnieuw.',
    languageTitle: 'Taal',
    languageNote:
      'Je taalkeuze wordt op dit apparaat opgeslagen.',
    close: 'Sluiten',
    legalTitle: 'Juridisch',
    privacy: 'Privacybeleid',
    terms: 'Gebruiksvoorwaarden',
  },
  de: {
    eyebrow: 'EINSTELLUNGEN',
    title: 'App-Einstellungen',
    walletTitle: 'Wallet',
    connected: 'Verbunden',
    notConnected: 'Keine Wallet verbunden',
    connect: 'Wallet verbinden',
    connectAnother: 'Andere Wallet verbinden',
    disconnect: 'Wallet trennen',
    working: 'Wird ausgeführt…',
    walletNote:
      'Wenn du die Wallet trennst, bleiben deine Einladungs- und Belohnungsdaten erhalten.',
    switchNote:
      'Beim Verbinden einer anderen Wallet bestätigst du den Besitz einmal per Signatur.',
    actionError:
      'Die Wallet-Verbindung konnte nicht geändert werden. Versuch es bitte gleich noch einmal.',
    languageTitle: 'Sprache',
    languageNote:
      'Deine Sprachauswahl wird auf diesem Gerät gespeichert.',
    close: 'Schließen',
    legalTitle: 'Rechtliches',
    privacy: 'Datenschutzerklärung',
    terms: 'Nutzungsbedingungen',
  },
  fr: {
    eyebrow: 'PARAMÈTRES',
    title: 'Paramètres de l’application',
    walletTitle: 'Wallet',
    connected: 'Connecté',
    notConnected: 'Aucun wallet connecté',
    connect: 'Connecter un wallet',
    connectAnother: 'Connecter un autre wallet',
    disconnect: 'Déconnecter le wallet',
    working: 'Traitement en cours…',
    walletNote:
      'Déconnecter votre wallet ne supprime pas l’historique de vos invitations ni de vos récompenses.',
    switchNote:
      'Lorsque vous connectez un autre wallet, une signature vous sera demandée une fois pour en confirmer la propriété.',
    actionError:
      'Impossible de modifier la connexion du wallet. Veuillez réessayer dans un instant.',
    languageTitle: 'Langue',
    languageNote:
      'La langue choisie est enregistrée sur cet appareil.',
    close: 'Fermer',
    legalTitle: 'Mentions légales',
    privacy: 'Politique de confidentialité',
    terms: 'Conditions d’utilisation',
  },
};
