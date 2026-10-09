import type { Locale } from './locales';

type WalletSessionCopy = {
  checkingTitle: string;
  checkingDescription: string;
  checkingSafety: string;
  errorTitle: string;
  errorDescription: string;
  participationErrorTitle: string;
  participationErrorDescription: string;
  slowVerificationDescription: string;
  rateLimitDescription: string;
  tryAgain: string;
  disconnectWallet: string;
  disconnectingWallet: string;
};

export const WALLET_SESSION_COPY: Record<Locale, WalletSessionCopy> = {
  en: {
    checkingTitle: 'Verifying your wallet',
    checkingDescription:
      'Approve the signature request to confirm that you control the connected wallet.',
    checkingSafety:
      'This signature does not create a transaction or cost gas.',
    errorTitle: 'Wallet verification needed',
    errorDescription:
      'The signature was cancelled or wallet verification failed. Please try again.',
    participationErrorTitle: 'Participation check unavailable',
    participationErrorDescription: 'Your wallet is verified, but we could not check participation access. Try again shortly.',
    slowVerificationDescription: 'Wallet verification is taking longer than expected. Complete or cancel the request in your wallet, or disconnect and reconnect.',
    rateLimitDescription: 'Too many verification attempts. Please wait a moment before trying again.',
    tryAgain: 'Try again',
    disconnectWallet: 'Disconnect wallet',
    disconnectingWallet: 'Disconnecting…',
  },
  ko: {
    checkingTitle: '지갑을 확인하고 있어요',
    checkingDescription:
      '연결한 지갑의 소유권을 확인하려면 서명 요청을 승인해 주세요.',
    checkingSafety:
      '이 서명은 거래를 만들지 않으며 가스비가 들지 않아요.',
    errorTitle: '지갑 확인이 필요해요',
    errorDescription:
      '서명이 취소되었거나 지갑 확인에 실패했어요. 다시 시도해 주세요.',
    participationErrorTitle: '참여 상태를 확인할 수 없어요',
    participationErrorDescription: '지갑 인증은 완료됐지만 참여 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
    slowVerificationDescription: '지갑 응답이 지연되고 있어요. 지갑에서 서명을 완료하거나 취소한 뒤 다시 시도해 주세요. 계속되면 연결을 해제하고 다시 연결해 주세요.',
    rateLimitDescription: '인증 시도가 너무 많아요. 잠시 기다렸다가 다시 시도해 주세요.',
    tryAgain: '다시 시도',
    disconnectWallet: '지갑 연결 해제',
    disconnectingWallet: '연결 해제 중…',
  },
  zh: {
    checkingTitle: '正在验证钱包',
    checkingDescription:
      '请批准签名请求，以确认你拥有并控制当前连接的钱包。',
    checkingSafety:
      '此签名不会发起交易，也不会产生 Gas 费用。',
    errorTitle: '需要验证钱包',
    errorDescription:
      '签名已取消或钱包验证失败，请重试。',
    participationErrorTitle: '暂时无法确认参与状态',
    participationErrorDescription: '钱包已验证，但暂时无法检查参与资格。请稍后重试。',
    slowVerificationDescription: '钱包验证响应时间较长。请在钱包中完成或取消签名；如仍无响应，请断开后重新连接。',
    rateLimitDescription: '验证尝试次数过多。请稍后再试。',
    tryAgain: '重试',
    disconnectWallet: '断开钱包连接',
    disconnectingWallet: '正在断开连接…',
  },
  hi: {
    checkingTitle: 'वॉलेट की पुष्टि हो रही है',
    checkingDescription:
      'यह पुष्टि करने के लिए सिग्नेचर अनुरोध स्वीकार करें कि कनेक्ट किया गया वॉलेट आपका है।',
    checkingSafety:
      'यह सिग्नेचर कोई ट्रांज़ैक्शन नहीं बनाता और इसमें गैस शुल्क नहीं लगता।',
    errorTitle: 'वॉलेट की पुष्टि ज़रूरी है',
    errorDescription:
      'सिग्नेचर रद्द हो गया या वॉलेट की पुष्टि नहीं हो सकी। कृपया फिर कोशिश करें।',
    participationErrorTitle: 'भागीदारी की जाँच उपलब्ध नहीं है',
    participationErrorDescription: 'आपका वॉलेट सत्यापित है, लेकिन भागीदारी की स्थिति नहीं जाँची जा सकी। कृपया थोड़ी देर बाद फिर प्रयास करें।',
    slowVerificationDescription: 'वॉलेट की पुष्टि में देर हो रही है। वॉलेट में हस्ताक्षर पूरा करें या रद्द करें। ज़रूरत पड़े तो डिस्कनेक्ट करके फिर कनेक्ट करें।',
    rateLimitDescription: 'पुष्टि के बहुत अधिक प्रयास हुए हैं। कृपया थोड़ी देर बाद फिर प्रयास करें।',
    tryAgain: 'फिर कोशिश करें',
    disconnectWallet: 'वॉलेट डिस्कनेक्ट करें',
    disconnectingWallet: 'डिस्कनेक्ट हो रहा है…',
  },
  es: {
    checkingTitle: 'Verificando tu cartera',
    checkingDescription:
      'Aprueba la solicitud de firma para confirmar que controlas la cartera conectada.',
    checkingSafety:
      'Esta firma no crea ninguna transacción ni genera comisiones de gas.',
    errorTitle: 'Es necesario verificar la cartera',
    errorDescription:
      'La firma se canceló o no se pudo verificar la cartera. Inténtalo de nuevo.',
    participationErrorTitle: 'No se pudo comprobar la participación',
    participationErrorDescription: 'Tu cartera está verificada, pero no pudimos comprobar el acceso. Vuelve a intentarlo en unos momentos.',
    slowVerificationDescription: 'La verificación está tardando. Completa o cancela la firma en tu cartera. Si sigue sin responder, desconéctala y vuelve a conectarla.',
    rateLimitDescription: 'Demasiados intentos de verificación. Espera un momento antes de volver a intentarlo.',
    tryAgain: 'Intentar de nuevo',
    disconnectWallet: 'Desconectar cartera',
    disconnectingWallet: 'Desconectando…',
  },
  ja: {
    checkingTitle: 'ウォレットを確認しています',
    checkingDescription:
      '接続中のウォレットを所有していることを確認するため、署名リクエストを承認してください。',
    checkingSafety:
      'この署名ではトランザクションは発生せず、ガス代もかかりません。',
    errorTitle: 'ウォレットの確認が必要です',
    errorDescription:
      '署名がキャンセルされたか、ウォレットを確認できませんでした。もう一度お試しください。',
    participationErrorTitle: '参加状況を確認できません',
    participationErrorDescription: 'ウォレットの認証は完了しましたが、参加状況を確認できませんでした。少し待ってから再試行してください。',
    slowVerificationDescription: 'ウォレットの応答に時間がかかっています。署名を完了またはキャンセルしてください。続く場合は接続を解除して再接続してください。',
    rateLimitDescription: '認証の試行回数が多すぎます。少し待ってから再試行してください。',
    tryAgain: 'もう一度試す',
    disconnectWallet: 'ウォレットの接続を解除',
    disconnectingWallet: '接続を解除しています…',
  },
  it: {
    checkingTitle: 'Verifica del wallet in corso',
    checkingDescription:
      'Approva la richiesta di firma per confermare che controlli il wallet collegato.',
    checkingSafety:
      'Questa firma non crea transazioni e non comporta costi di gas.',
    errorTitle: 'È necessario verificare il wallet',
    errorDescription:
      'La firma è stata annullata oppure non è stato possibile verificare il wallet. Riprova.',
    participationErrorTitle: 'Verifica della partecipazione non disponibile',
    participationErrorDescription: 'Il wallet è stato verificato, ma non è stato possibile controllare l’accesso. Riprova tra poco.',
    slowVerificationDescription: 'La verifica del wallet sta impiegando troppo tempo. Completa o annulla la firma nel wallet oppure disconnetti e riconnetti.',
    rateLimitDescription: 'Troppi tentativi di verifica. Attendi un momento prima di riprovare.',
    tryAgain: 'Riprova',
    disconnectWallet: 'Disconnetti wallet',
    disconnectingWallet: 'Disconnessione…',
  },
  tr: {
    checkingTitle: 'Cüzdanın doğrulanıyor',
    checkingDescription:
      'Bağlı cüzdanın sana ait olduğunu doğrulamak için imza isteğini onayla.',
    checkingSafety:
      'Bu imza herhangi bir işlem oluşturmaz ve gas ücreti gerektirmez.',
    errorTitle: 'Cüzdan doğrulaması gerekiyor',
    errorDescription:
      'İmza iptal edildi veya cüzdan doğrulanamadı. Lütfen tekrar dene.',
    participationErrorTitle: 'Katılım durumu kontrol edilemiyor',
    participationErrorDescription: 'Cüzdanınız doğrulandı ancak katılım erişimi kontrol edilemedi. Lütfen biraz sonra tekrar deneyin.',
    slowVerificationDescription: 'Cüzdan doğrulaması beklenenden uzun sürüyor. İmzayı cüzdanınızda tamamlayın veya iptal edin. Gerekirse bağlantıyı kesip yeniden bağlanın.',
    rateLimitDescription: 'Çok fazla doğrulama denemesi yapıldı. Lütfen biraz bekleyip tekrar deneyin.',
    tryAgain: 'Tekrar dene',
    disconnectWallet: 'Cüzdan bağlantısını kes',
    disconnectingWallet: 'Bağlantı kesiliyor…',
  },
  nl: {
    checkingTitle: 'Je wallet wordt geverifieerd',
    checkingDescription:
      'Keur het ondertekeningsverzoek goed om te bevestigen dat jij de verbonden wallet beheert.',
    checkingSafety:
      'Deze handtekening maakt geen transactie aan en kost geen gas.',
    errorTitle: 'Walletverificatie vereist',
    errorDescription:
      'De handtekening is geannuleerd of de wallet kon niet worden geverifieerd. Probeer het opnieuw.',
    participationErrorTitle: 'Deelnamestatus niet beschikbaar',
    participationErrorDescription: 'Je wallet is geverifieerd, maar de toegang kon niet worden gecontroleerd. Probeer het zo opnieuw.',
    slowVerificationDescription: 'De walletverificatie duurt langer dan verwacht. Rond de handtekening af of annuleer deze. Verbreek zo nodig de verbinding en maak opnieuw verbinding.',
    rateLimitDescription: 'Te veel verificatiepogingen. Wacht even voordat je het opnieuw probeert.',
    tryAgain: 'Opnieuw proberen',
    disconnectWallet: 'Wallet loskoppelen',
    disconnectingWallet: 'Wallet wordt losgekoppeld…',
  },
  de: {
    checkingTitle: 'Wallet wird verifiziert',
    checkingDescription:
      'Bestätige die Signaturanfrage, um nachzuweisen, dass du die verbundene Wallet kontrollierst.',
    checkingSafety:
      'Diese Signatur erstellt keine Transaktion und verursacht keine Gasgebühren.',
    errorTitle: 'Wallet-Verifizierung erforderlich',
    errorDescription:
      'Die Signatur wurde abgebrochen oder die Wallet konnte nicht verifiziert werden. Bitte versuche es erneut.',
    participationErrorTitle: 'Teilnahmestatus nicht verfügbar',
    participationErrorDescription: 'Deine Wallet wurde verifiziert, aber der Teilnahmezugang konnte nicht geprüft werden. Versuche es gleich noch einmal.',
    slowVerificationDescription: 'Die Wallet-Verifizierung dauert länger als erwartet. Bestätige oder storniere die Signatur in deiner Wallet. Trenne bei Bedarf die Verbindung und verbinde dich erneut.',
    rateLimitDescription: 'Zu viele Verifizierungsversuche. Warte kurz, bevor du es erneut versuchst.',
    tryAgain: 'Erneut versuchen',
    disconnectWallet: 'Wallet trennen',
    disconnectingWallet: 'Wallet wird getrennt…',
  },
  fr: {
    checkingTitle: 'Vérification du wallet',
    checkingDescription:
      'Approuvez la demande de signature pour confirmer que vous contrôlez le wallet connecté.',
    checkingSafety:
      'Cette signature ne crée aucune transaction et n’entraîne aucun frais de gas.',
    errorTitle: 'Vérification du wallet requise',
    errorDescription:
      'La signature a été annulée ou le wallet n’a pas pu être vérifié. Veuillez réessayer.',
    participationErrorTitle: 'Vérification de la participation indisponible',
    participationErrorDescription: 'Votre wallet est vérifié, mais nous n’avons pas pu contrôler l’accès. Réessayez dans quelques instants.',
    slowVerificationDescription: 'La vérification du wallet prend plus de temps que prévu. Confirmez ou annulez la signature dans votre wallet. Au besoin, déconnectez-le puis reconnectez-le.',
    rateLimitDescription: 'Trop de tentatives de vérification. Patientez avant de réessayer.',
    tryAgain: 'Réessayer',
    disconnectWallet: 'Déconnecter le wallet',
    disconnectingWallet: 'Déconnexion…',
  },
};
