import type { Locale } from './locales';

type EntryRejectionCopy = {
  title: string;
  reasonLabel: string;
  reason: string;
  help: string;
};

export const ENTRY_REJECTION_COPY: Record<Locale, EntryRejectionCopy> = {
  en: {
    title: 'This wallet is not eligible for VeInvite.',
    reasonLabel: 'Reason',
    reason:
      'Recent VeBetterDAO activity was found, so this wallet does not meet the new or returning user criteria.',
    help: 'You can continue using VeBetterDAO normally.',
  },
  ko: {
    title: '이 지갑은 VeInvite 초대 대상이 아니에요.',
    reasonLabel: '초대 불가 사유',
    reason:
      '최근 VeBetterDAO 활동 이력이 확인되어 신규 또는 복귀 사용자 기준에 해당하지 않아요.',
    help: 'VeBetterDAO는 계속 정상적으로 이용할 수 있어요.',
  },
  zh: {
    title: '此钱包目前不符合 VeInvite 的邀请条件。',
    reasonLabel: '无法参与的原因',
    reason:
      '检测到近期 VeBetterDAO 活动，因此此钱包不符合新用户或回归用户的资格标准。',
    help: '你仍可正常使用 VeBetterDAO。',
  },
  hi: {
    title: 'यह वॉलेट अभी VeInvite के लिए पात्र नहीं है।',
    reasonLabel: 'भाग न ले पाने का कारण',
    reason:
      'हाल की VeBetterDAO गतिविधि मिली है, इसलिए यह वॉलेट नए या लौटने वाले उपयोगकर्ता के मानदंडों को पूरा नहीं करता।',
    help: 'आप VeBetterDAO का सामान्य उपयोग जारी रख सकते हैं।',
  },
  es: {
    title: 'Esta cartera no puede participar ahora en VeInvite.',
    reasonLabel: 'Motivo',
    reason:
      'Se detectó actividad reciente en VeBetterDAO, por lo que esta cartera no cumple los criterios de usuario nuevo o que regresa.',
    help: 'Puedes seguir usando VeBetterDAO con normalidad.',
  },
  ja: {
    title: 'このウォレットは現在VeInviteの招待対象ではありません。',
    reasonLabel: '参加できない理由',
    reason:
      '最近のVeBetterDAO活動が確認されたため、新規ユーザーまたは復帰ユーザーの条件を満たしていません。',
    help: 'VeBetterDAOは引き続き通常どおり利用できます。',
  },
  it: {
    title: 'Questo wallet al momento non può partecipare a VeInvite.',
    reasonLabel: 'Motivo',
    reason:
      'È stata rilevata attività recente su VeBetterDAO, quindi questo wallet non soddisfa i criteri per un nuovo utente o un utente di ritorno.',
    help: 'Puoi continuare a usare VeBetterDAO normalmente.',
  },
  tr: {
    title: 'Bu cüzdan şu anda VeInvite için uygun değil.',
    reasonLabel: 'Neden',
    reason:
      'Yakın zamanda VeBetterDAO etkinliği tespit edildiği için bu cüzdan yeni veya geri dönen kullanıcı kriterlerini karşılamıyor.',
    help: 'VeBetterDAO’yu normal şekilde kullanmaya devam edebilirsin.',
  },
  nl: {
    title: 'Deze wallet komt momenteel niet in aanmerking voor VeInvite.',
    reasonLabel: 'Reden',
    reason:
      'Er is recente VeBetterDAO-activiteit gevonden, waardoor deze wallet niet voldoet aan de criteria voor een nieuwe of terugkerende gebruiker.',
    help: 'Je kunt VeBetterDAO gewoon blijven gebruiken.',
  },
  de: {
    title: 'Diese Wallet ist derzeit nicht für VeInvite berechtigt.',
    reasonLabel: 'Grund',
    reason:
      'Es wurde kürzlich VeBetterDAO-Aktivität festgestellt. Daher erfüllt diese Wallet nicht die Kriterien für neue oder zurückkehrende Nutzer.',
    help: 'VeBetterDAO kann weiterhin normal genutzt werden.',
  },
  fr: {
    title: 'Ce wallet n’est actuellement pas éligible à VeInvite.',
    reasonLabel: 'Motif',
    reason:
      'Une activité récente sur VeBetterDAO a été détectée. Ce wallet ne remplit donc pas les critères d’un nouvel utilisateur ou d’un utilisateur de retour.',
    help: 'Vous pouvez continuer à utiliser VeBetterDAO normalement.',
  },
};
