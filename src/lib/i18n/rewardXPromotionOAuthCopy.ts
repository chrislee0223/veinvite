import type { SupportedLocale } from './locales';

export type RewardXPromotionOAuthCopy = {
  conflict: string;
  failed: string;
};

export const REWARD_X_PROMOTION_OAUTH_COPY: Record<
  SupportedLocale,
  RewardXPromotionOAuthCopy
> = {
  en: {
    conflict: 'This X account is already linked elsewhere. Return to your reward and connect the correct X account.',
    failed: 'We could not connect your X account. Return to your reward and try connecting again.',
  },
  ko: {
    conflict: '이 X 계정은 다른 곳에 이미 연결되어 있어요. 보상 화면으로 돌아가 올바른 X 계정을 연결해 주세요.',
    failed: 'X 계정을 연결하지 못했어요. 보상 화면으로 돌아가 다시 연결해 주세요.',
  },
  zh: {
    conflict: '此 X 账号已在其他地方绑定。请返回奖励页面并连接正确的 X 账号。',
    failed: '无法连接 X 账号。请返回奖励页面后重新连接。',
  },
  'zh-tw': {
    conflict: '此 X 帳號已在其他地方連接。請返回獎勵頁面並連接正確的 X 帳號。',
    failed: '無法連接 X 帳號。請返回獎勵頁面後重新連接。',
  },
  ja: {
    conflict: 'このXアカウントは別の場所に連携済みです。報酬画面に戻り、正しいXアカウントを連携してください。',
    failed: 'Xアカウントを連携できませんでした。報酬画面に戻って、もう一度お試しください。',
  },
  es: {
    conflict: 'Esta cuenta de X ya está vinculada en otro lugar. Vuelve a tu recompensa y conecta la cuenta de X correcta.',
    failed: 'No se pudo conectar tu cuenta de X. Vuelve a tu recompensa e inténtalo de nuevo.',
  },
  de: {
    conflict: 'Dieses X-Konto ist bereits anderswo verknüpft. Kehre zu deiner Belohnung zurück und verbinde das richtige X-Konto.',
    failed: 'Dein X-Konto konnte nicht verbunden werden. Kehre zu deiner Belohnung zurück und versuche es erneut.',
  },
  fr: {
    conflict: 'Ce compte X est déjà lié ailleurs. Revenez à votre récompense et connectez le bon compte X.',
    failed: 'Impossible de connecter votre compte X. Revenez à votre récompense et réessayez.',
  },
  it: {
    conflict: 'Questo account X è già collegato altrove. Torna alla ricompensa e collega l’account X corretto.',
    failed: 'Non è stato possibile collegare il tuo account X. Torna alla ricompensa e riprova.',
  },
  tr: {
    conflict: 'Bu X hesabı başka bir yerde zaten bağlı. Ödülüne dön ve doğru X hesabını bağla.',
    failed: 'X hesabın bağlanamadı. Ödülüne dönüp yeniden bağlamayı dene.',
  },
  nl: {
    conflict: 'Dit X-account is al ergens anders gekoppeld. Ga terug naar je beloning en koppel het juiste X-account.',
    failed: 'Je X-account kon niet worden gekoppeld. Ga terug naar je beloning en probeer opnieuw.',
  },
  pt: {
    conflict: 'Esta conta X já está vinculada em outro lugar. Volte à sua recompensa e conecte a conta X correta.',
    failed: 'Não foi possível conectar sua conta X. Volte à sua recompensa e tente novamente.',
  },
  ru: {
    conflict: 'Этот аккаунт X уже привязан в другом месте. Вернитесь к награде и подключите правильный аккаунт X.',
    failed: 'Не удалось подключить аккаунт X. Вернитесь к награде и попробуйте ещё раз.',
  },
  id: {
    conflict: 'Akun X ini sudah terhubung di tempat lain. Kembali ke reward Anda dan hubungkan akun X yang benar.',
    failed: 'Akun X Anda tidak dapat dihubungkan. Kembali ke reward lalu coba hubungkan lagi.',
  },
  vi: {
    conflict: 'Tài khoản X này đã được liên kết ở nơi khác. Hãy quay lại phần thưởng và kết nối đúng tài khoản X.',
    failed: 'Không thể kết nối tài khoản X. Hãy quay lại phần thưởng và thử kết nối lại.',
  },
  hi: {
    conflict: 'यह X अकाउंट पहले से कहीं और जुड़ा है। अपने रिवॉर्ड पर लौटें और सही X अकाउंट कनेक्ट करें।',
    failed: 'आपका X अकाउंट कनेक्ट नहीं हो पाया। अपने रिवॉर्ड पर लौटकर फिर से कनेक्ट करें।',
  },
  ar: {
    conflict: 'حساب X هذا مرتبط بالفعل في مكان آخر. ارجع إلى مكافأتك واربط حساب X الصحيح.',
    failed: 'تعذر ربط حساب X. ارجع إلى مكافأتك وحاول الربط مرة أخرى.',
  },
  bn: {
    conflict: 'এই X অ্যাকাউন্টটি অন্য কোথাও ইতিমধ্যে যুক্ত আছে। আপনার রিওয়ার্ডে ফিরে সঠিক X অ্যাকাউন্টটি যুক্ত করুন।',
    failed: 'আপনার X অ্যাকাউন্টটি যুক্ত করা যায়নি। রিওয়ার্ডে ফিরে আবার চেষ্টা করুন।',
  },
  sv: {
    conflict: 'Det här X-kontot är redan kopplat någon annanstans. Gå tillbaka till din belöning och anslut rätt X-konto.',
    failed: 'Ditt X-konto kunde inte anslutas. Gå tillbaka till din belöning och försök igen.',
  },
  ro: {
    conflict: 'Acest cont X este deja conectat în altă parte. Revino la recompensă și conectează contul X corect.',
    failed: 'Contul X nu a putut fi conectat. Revino la recompensă și încearcă din nou.',
  },
  ur: {
    conflict: 'یہ X اکاؤنٹ پہلے ہی کسی اور جگہ منسلک ہے۔ اپنے ریوارڈ پر واپس جائیں اور درست X اکاؤنٹ منسلک کریں۔',
    failed: 'آپ کا X اکاؤنٹ منسلک نہیں ہو سکا۔ اپنے ریوارڈ پر واپس جا کر دوبارہ کوشش کریں۔',
  },
  pcm: {
    conflict: 'Dis X account don already connect somewhere else. Go back to your reward and connect di correct X account.',
    failed: 'We no fit connect your X account. Go back to your reward and try connect am again.',
  },
  arz: {
    conflict: 'حساب X ده متوصل في مكان تاني بالفعل. ارجع للمكافأة ووصل حساب X الصح.',
    failed: 'مقدرناش نوصل حساب X. ارجع للمكافأة وجرّب توصل الحساب تاني.',
  },
  mr: {
    conflict: 'हे X खाते आधीच दुसरीकडे जोडलेले आहे. तुमच्या रिवॉर्डकडे परत जा आणि योग्य X खाते जोडा.',
    failed: 'तुमचे X खाते जोडता आले नाही. रिवॉर्डकडे परत जाऊन पुन्हा प्रयत्न करा.',
  },
  te: {
    conflict: 'ఈ X ఖాతా ఇప్పటికే మరొక చోట కనెక్ట్ అయింది. మీ రివార్డ్‌కు తిరిగి వెళ్లి సరైన X ఖాతాను కనెక్ట్ చేయండి.',
    failed: 'మీ X ఖాతాను కనెక్ట్ చేయలేకపోయాం. రివార్డ్‌కు తిరిగి వెళ్లి మళ్లీ ప్రయత్నించండి.',
  },
  sw: {
    conflict: 'Akaunti hii ya X tayari imeunganishwa mahali pengine. Rudi kwenye zawadi yako na uunganishe akaunti sahihi ya X.',
    failed: 'Hatukuweza kuunganisha akaunti yako ya X. Rudi kwenye zawadi yako na ujaribu tena.',
  },
  ha: {
    conflict: 'An riga an haɗa wannan asusun X a wani wuri. Koma zuwa ladanka ka haɗa asusun X da ya dace.',
    failed: 'Ba a iya haɗa asusun X ɗinka ba. Koma zuwa ladanka ka sake gwadawa.',
  },
  el: {
    conflict: 'Αυτός ο λογαριασμός X είναι ήδη συνδεδεμένος αλλού. Γύρισε στην ανταμοιβή σου και σύνδεσε τον σωστό λογαριασμό X.',
    failed: 'Δεν ήταν δυνατή η σύνδεση του λογαριασμού X. Γύρισε στην ανταμοιβή σου και δοκίμασε ξανά.',
  },
  cs: {
    conflict: 'Tento účet X je už propojený jinde. Vrať se k odměně a připoj správný účet X.',
    failed: 'Účet X se nepodařilo připojit. Vrať se k odměně a zkus to znovu.',
  },
};
