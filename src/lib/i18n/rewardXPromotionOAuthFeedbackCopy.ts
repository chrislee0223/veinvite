import type { SupportedLocale } from './locales';

export type RewardXPromotionOAuthFeedbackCopy = {
  conflict: string;
  failed: string;
};

export const REWARD_X_PROMOTION_OAUTH_FEEDBACK_COPY: Record<
  SupportedLocale,
  RewardXPromotionOAuthFeedbackCopy
> = {
  en: {
    conflict: "This X account is linked to another wallet. Connect a different public X account.",
    failed: "X account connection failed. Please try again.",
  },
  ko: {
    conflict: "이 X 계정은 다른 지갑과 연결되어 있어요. 다른 공개 X 계정으로 다시 시도해 주세요.",
    failed: "X 계정을 연결하지 못했어요. 다시 시도해 주세요.",
  },
  zh: {
    conflict: "此 X 账号已关联其他钱包。请尝试连接其他公开 X 账号。",
    failed: "X 账号连接失败，请重试。",
  },
  'zh-tw': {
    conflict: "此 X 帳號已連結其他錢包。請嘗試連結其他公開 X 帳號。",
    failed: "X 帳號連結失敗，請重試。",
  },
  ja: {
    conflict: "このXアカウントは別のウォレットに連携されています。別の公開Xアカウントを接続してください。",
    failed: "Xアカウントの接続に失敗しました。もう一度お試しください。",
  },
  es: {
    conflict: "Esta cuenta de X está vinculada a otra cartera. Conecta otra cuenta pública de X.",
    failed: "No se pudo conectar la cuenta de X. Inténtalo de nuevo.",
  },
  de: {
    conflict: "Dieses X-Konto ist mit einer anderen Wallet verknüpft. Verbinde ein anderes öffentliches X-Konto.",
    failed: "Die Verbindung mit X ist fehlgeschlagen. Bitte versuche es erneut.",
  },
  fr: {
    conflict: "Ce compte X est lié à un autre portefeuille. Connectez un autre compte X public.",
    failed: "La connexion au compte X a échoué. Veuillez réessayer.",
  },
  it: {
    conflict: "Questo account X è associato a un altro wallet. Collega un altro account X pubblico.",
    failed: "Connessione all’account X non riuscita. Riprova.",
  },
  tr: {
    conflict: "Bu X hesabı başka bir cüzdana bağlı. Başka bir herkese açık X hesabı bağla.",
    failed: "X hesabı bağlantısı başarısız oldu. Tekrar dene.",
  },
  nl: {
    conflict: "Dit X-account is gekoppeld aan een andere wallet. Koppel een ander openbaar X-account.",
    failed: "X-account koppelen is mislukt. Probeer het opnieuw.",
  },
  pt: {
    conflict: "Esta conta X está vinculada a outra carteira. Conecte outra conta X pública.",
    failed: "Falha ao conectar a conta X. Tente novamente.",
  },
  ru: {
    conflict: "Этот аккаунт X привязан к другому кошельку. Подключите другой публичный аккаунт X.",
    failed: "Не удалось подключить аккаунт X. Попробуйте снова.",
  },
  id: {
    conflict: "Akun X ini terhubung ke dompet lain. Hubungkan akun X publik lainnya.",
    failed: "Gagal menghubungkan akun X. Silakan coba lagi.",
  },
  vi: {
    conflict: "Tài khoản X này đã liên kết với ví khác. Hãy kết nối một tài khoản X công khai khác.",
    failed: "Không thể kết nối tài khoản X. Vui lòng thử lại.",
  },
  hi: {
    conflict: "यह X खाता दूसरे वॉलेट से जुड़ा है। कोई दूसरा सार्वजनिक X खाता जोड़ें।",
    failed: "X खाता नहीं जुड़ सका। कृपया फिर कोशिश करें।",
  },
  ar: {
    conflict: "حساب X هذا مرتبط بمحفظة أخرى. اربط حساب X عامًا آخر.",
    failed: "فشل ربط حساب X. يرجى المحاولة مرة أخرى.",
  },
  bn: {
    conflict: "এই X অ্যাকাউন্টটি অন্য ওয়ালেটের সঙ্গে যুক্ত। অন্য পাবলিক X অ্যাকাউন্ট যুক্ত করুন।",
    failed: "X অ্যাকাউন্ট সংযোগ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।",
  },
  sv: {
    conflict: "Det här X-kontot är kopplat till en annan plånbok. Anslut ett annat offentligt X-konto.",
    failed: "Det gick inte att ansluta X-kontot. Försök igen.",
  },
  ro: {
    conflict: "Acest cont X este conectat la alt portofel. Conectează un alt cont X public.",
    failed: "Conectarea contului X a eșuat. Încearcă din nou.",
  },
  ur: {
    conflict: "یہ X اکاؤنٹ دوسرے والیٹ سے منسلک ہے۔ کوئی دوسرا عوامی X اکاؤنٹ جوڑیں۔",
    failed: "X اکاؤنٹ منسلک نہیں ہو سکا۔ دوبارہ کوشش کریں۔",
  },
  pcm: {
    conflict: "Dis X account don link to another wallet. Connect another public X account.",
    failed: "X account no connect. Abeg try again.",
  },
  arz: {
    conflict: "حساب X ده مربوط بمحفظة تانية. اربط حساب X عام مختلف.",
    failed: "ربط حساب X فشل. جرّب تاني.",
  },
  mr: {
    conflict: "हे X खाते दुसऱ्या वॉलेटशी जोडलेले आहे. दुसरे सार्वजनिक X खाते जोडा.",
    failed: "X खाते जोडता आले नाही. पुन्हा प्रयत्न करा.",
  },
  te: {
    conflict: "ఈ X ఖాతా మరో వాలెట్‌కు లింక్ అయింది. మరో పబ్లిక్ X ఖాతాను కనెక్ట్ చేయండి.",
    failed: "X ఖాతాను కనెక్ట్ చేయలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
  },
  sw: {
    conflict: "Akaunti hii ya X imeunganishwa na pochi nyingine. Unganisha akaunti nyingine ya X ya umma.",
    failed: "Imeshindikana kuunganisha akaunti ya X. Jaribu tena.",
  },
  ha: {
    conflict: "An haɗa wannan asusun X da wani wallet. Ka haɗa wani asusun X na jama'a.",
    failed: "Haɗa asusun X bai yi nasara ba. Ka sake gwadawa.",
  },
  el: {
    conflict: "Αυτός ο λογαριασμός X είναι συνδεδεμένος με άλλο πορτοφόλι. Σύνδεσε άλλον δημόσιο λογαριασμό X.",
    failed: "Η σύνδεση του λογαριασμού X απέτυχε. Δοκίμασε ξανά.",
  },
  cs: {
    conflict: "Tento účet X je propojený s jinou peněženkou. Připoj jiný veřejný účet X.",
    failed: "Účet X se nepodařilo připojit. Zkus to znovu.",
  },
};
