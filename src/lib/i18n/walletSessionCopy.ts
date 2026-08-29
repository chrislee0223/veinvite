import type { Locale } from './locales';

type WalletSessionCopy = {
  checkingTitle: string;
  checkingDescription: string;
  checkingSafety: string;
  errorTitle: string;
  errorDescription: string;
  tryAgain: string;
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
    tryAgain: 'Try again',
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
    tryAgain: '다시 시도',
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
    tryAgain: '重试',
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
    tryAgain: 'फिर कोशिश करें',
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
    tryAgain: 'Intentar de nuevo',
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
    tryAgain: 'もう一度試す',
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
    tryAgain: 'Riprova',
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
    tryAgain: 'Tekrar dene',
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
    tryAgain: 'Opnieuw proberen',
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
    tryAgain: 'Erneut versuchen',
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
    tryAgain: 'Réessayer',
  },
};
