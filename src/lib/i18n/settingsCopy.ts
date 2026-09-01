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
  switchConfirmTitle: string;
  switchConfirmBody: string;
  switchConfirmAction: string;
  disconnectConfirmTitle: string;
  disconnectConfirmBody: string;
  disconnectConfirmAction: string;
  cancel: string;
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
    switchConfirmTitle: 'Connect another wallet?',
    switchConfirmBody:
      'You will leave the current wallet connection and choose another wallet. Your invite and reward history will stay intact.',
    switchConfirmAction: 'Connect another wallet',
    disconnectConfirmTitle: 'Disconnect this wallet?',
    disconnectConfirmBody:
      'VeInvite will stop using the currently connected wallet. Your invite and reward history will stay intact.',
    disconnectConfirmAction: 'Disconnect wallet',
    cancel: 'Cancel',
    languageTitle: 'Language',
    languageNote:
      'Your language choice is saved for your next visit.',
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
    switchConfirmTitle: '다른 지갑을 연결할까요?',
    switchConfirmBody:
      '현재 지갑 연결에서 나간 뒤 다른 지갑을 선택해요. 기존 초대와 보상 기록은 그대로 유지돼요.',
    switchConfirmAction: '다른 지갑 연결',
    disconnectConfirmTitle: '지갑 연결을 해제할까요?',
    disconnectConfirmBody:
      '현재 연결된 지갑의 사용을 중지해요. 기존 초대와 보상 기록은 그대로 유지돼요.',
    disconnectConfirmAction: '연결 해제',
    cancel: '취소',
    languageTitle: '언어',
    languageNote:
      '선택한 언어는 저장되어 다시 접속해도 유지돼요.',
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
    switchConfirmTitle: '要连接其他钱包吗？',
    switchConfirmBody:
      '你将退出当前钱包连接并选择另一个钱包。已有的邀请和奖励记录会继续保留。',
    switchConfirmAction: '连接其他钱包',
    disconnectConfirmTitle: '要断开这个钱包吗？',
    disconnectConfirmBody:
      'VeInvite 将停止使用当前已连接的钱包。已有的邀请和奖励记录会继续保留。',
    disconnectConfirmAction: '断开连接',
    cancel: '取消',
    languageTitle: '语言',
    languageNote:
      '你选择的语言会保存，下次回来时自动恢复。',
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
    switchConfirmTitle: 'दूसरा वॉलेट कनेक्ट करें?',
    switchConfirmBody:
      'आप मौजूदा वॉलेट कनेक्शन से बाहर निकलकर दूसरा वॉलेट चुनेंगे। आपका आमंत्रण और इनाम इतिहास सुरक्षित रहेगा।',
    switchConfirmAction: 'दूसरा वॉलेट कनेक्ट करें',
    disconnectConfirmTitle: 'इस वॉलेट को डिस्कनेक्ट करें?',
    disconnectConfirmBody:
      'VeInvite मौजूदा कनेक्टेड वॉलेट का उपयोग बंद कर देगा। आपका आमंत्रण और इनाम इतिहास सुरक्षित रहेगा।',
    disconnectConfirmAction: 'वॉलेट डिस्कनेक्ट करें',
    cancel: 'रद्द करें',
    languageTitle: 'भाषा',
    languageNote:
      'आपकी चुनी हुई भाषा सेव रहती है और अगली बार लौटने पर फिर लागू हो जाती है।',
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
    switchConfirmTitle: '¿Conectar otra cartera?',
    switchConfirmBody:
      'Saldrás de la conexión actual y podrás elegir otra cartera. Tu historial de invitaciones y recompensas se conservará.',
    switchConfirmAction: 'Conectar otra cartera',
    disconnectConfirmTitle: '¿Desconectar esta cartera?',
    disconnectConfirmBody:
      'VeInvite dejará de usar la cartera conectada actualmente. Tu historial de invitaciones y recompensas se conservará.',
    disconnectConfirmAction: 'Desconectar cartera',
    cancel: 'Cancelar',
    languageTitle: 'Idioma',
    languageNote:
      'El idioma que elijas queda guardado para tu próxima visita.',
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
    switchConfirmTitle: '別のウォレットを接続しますか？',
    switchConfirmBody:
      '現在のウォレット接続を離れて、別のウォレットを選択します。招待と報酬の履歴はそのまま残ります。',
    switchConfirmAction: '別のウォレットを接続',
    disconnectConfirmTitle: 'このウォレットを切断しますか？',
    disconnectConfirmBody:
      'VeInvite は現在接続中のウォレットの利用を停止します。招待と報酬の履歴はそのまま残ります。',
    disconnectConfirmAction: 'ウォレットを切断',
    cancel: 'キャンセル',
    languageTitle: '言語',
    languageNote:
      '選んだ言語は保存され、次回アクセス時にも自動で復元されます。',
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
    switchConfirmTitle: 'Collegare un altro wallet?',
    switchConfirmBody:
      'Lascerai il collegamento attuale e potrai scegliere un altro wallet. La cronologia di inviti e ricompense resterà invariata.',
    switchConfirmAction: 'Collega un altro wallet',
    disconnectConfirmTitle: 'Scollegare questo wallet?',
    disconnectConfirmBody:
      'VeInvite smetterà di usare il wallet attualmente collegato. La cronologia di inviti e ricompense resterà invariata.',
    disconnectConfirmAction: 'Scollega wallet',
    cancel: 'Annulla',
    languageTitle: 'Lingua',
    languageNote:
      'La lingua scelta resta salvata anche quando torni.',
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
    switchConfirmTitle: 'Başka bir cüzdan bağlansın mı?',
    switchConfirmBody:
      'Mevcut cüzdan bağlantısından çıkıp başka bir cüzdan seçeceksin. Davet ve ödül geçmişin korunacak.',
    switchConfirmAction: 'Başka cüzdan bağla',
    disconnectConfirmTitle: 'Bu cüzdanın bağlantısı kesilsin mi?',
    disconnectConfirmBody:
      'VeInvite mevcut bağlı cüzdanı kullanmayı bırakacak. Davet ve ödül geçmişin korunacak.',
    disconnectConfirmAction: 'Bağlantıyı kes',
    cancel: 'İptal',
    languageTitle: 'Dil',
    languageNote:
      'Seçtiğin dil kaydedilir ve bir sonraki ziyaretinde de kullanılır.',
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
    switchConfirmTitle: 'Een andere wallet verbinden?',
    switchConfirmBody:
      'Je verlaat de huidige walletverbinding en kiest daarna een andere wallet. Je uitnodigings- en beloningsgeschiedenis blijft bewaard.',
    switchConfirmAction: 'Andere wallet verbinden',
    disconnectConfirmTitle: 'Deze wallet loskoppelen?',
    disconnectConfirmBody:
      'VeInvite stopt met het gebruiken van de momenteel verbonden wallet. Je uitnodigings- en beloningsgeschiedenis blijft bewaard.',
    disconnectConfirmAction: 'Wallet loskoppelen',
    cancel: 'Annuleren',
    languageTitle: 'Taal',
    languageNote:
      'Je taalkeuze wordt opgeslagen en blijft behouden als je later terugkomt.',
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
    switchConfirmTitle: 'Eine andere Wallet verbinden?',
    switchConfirmBody:
      'Du verlässt die aktuelle Wallet-Verbindung und wählst anschließend eine andere Wallet. Deine Einladungs- und Belohnungsdaten bleiben erhalten.',
    switchConfirmAction: 'Andere Wallet verbinden',
    disconnectConfirmTitle: 'Diese Wallet trennen?',
    disconnectConfirmBody:
      'VeInvite verwendet die aktuell verbundene Wallet anschließend nicht mehr. Deine Einladungs- und Belohnungsdaten bleiben erhalten.',
    disconnectConfirmAction: 'Wallet trennen',
    cancel: 'Abbrechen',
    languageTitle: 'Sprache',
    languageNote:
      'Deine Sprachauswahl wird gespeichert und bleibt bei deinem nächsten Besuch erhalten.',
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
    switchConfirmTitle: 'Connecter un autre wallet ?',
    switchConfirmBody:
      'Vous quitterez la connexion actuelle avant de choisir un autre wallet. L’historique de vos invitations et récompenses sera conservé.',
    switchConfirmAction: 'Connecter un autre wallet',
    disconnectConfirmTitle: 'Déconnecter ce wallet ?',
    disconnectConfirmBody:
      'VeInvite cessera d’utiliser le wallet actuellement connecté. L’historique de vos invitations et récompenses sera conservé.',
    disconnectConfirmAction: 'Déconnecter le wallet',
    cancel: 'Annuler',
    languageTitle: 'Langue',
    languageNote:
      'La langue choisie est enregistrée et restaurée lors de votre prochaine visite.',
    close: 'Fermer',
    legalTitle: 'Mentions légales',
    privacy: 'Politique de confidentialité',
    terms: 'Conditions d’utilisation',
  },
};