import type { SupportedLocale } from './locales';

type WalletSwitchCopy = {
  title: string;
  description: string;
  continueCurrent: string;
  chooseAnother: string;
};

export const WALLET_SWITCH_COPY: Record<
  SupportedLocale,
  WalletSwitchCopy
> = {
  en: {
    title: 'Your VeWorld wallet changed',
    description:
      'VeWorld is now connected to a different wallet. Continue with this wallet or choose another one.',
    continueCurrent: 'Continue with current wallet',
    chooseAnother: 'Choose another wallet',
  },
  ko: {
    title: 'VeWorld에서 지갑이 변경되었어요',
    description:
      '현재 VeWorld에는 이전과 다른 지갑이 연결되어 있어요. 이 지갑으로 계속하거나 다른 지갑을 선택할 수 있어요.',
    continueCurrent: '현재 지갑으로 계속',
    chooseAnother: '다른 지갑 선택',
  },
  zh: {
    title: 'VeWorld 中的钱包已更改',
    description:
      'VeWorld 当前连接的是另一个钱包。你可以使用当前钱包继续，或选择其他钱包。',
    continueCurrent: '使用当前钱包继续',
    chooseAnother: '选择其他钱包',
  },
  hi: {
    title: 'VeWorld में वॉलेट बदल गया है',
    description:
      'VeWorld में अब पहले से अलग वॉलेट जुड़ा है। मौजूदा वॉलेट से जारी रखें या दूसरा वॉलेट चुनें।',
    continueCurrent: 'मौजूदा वॉलेट से जारी रखें',
    chooseAnother: 'दूसरा वॉलेट चुनें',
  },
  es: {
    title: 'La cartera de VeWorld cambió',
    description:
      'VeWorld está conectado a una cartera distinta. Continúa con la cartera actual o elige otra.',
    continueCurrent: 'Continuar con la cartera actual',
    chooseAnother: 'Elegir otra cartera',
  },
  ja: {
    title: 'VeWorldでウォレットが変更されました',
    description:
      'VeWorldでは以前とは別のウォレットが接続されています。このウォレットで続行するか、別のウォレットを選択できます。',
    continueCurrent: '現在のウォレットで続行',
    chooseAnother: '別のウォレットを選ぶ',
  },
  it: {
    title: 'Il wallet in VeWorld è cambiato',
    description:
      'VeWorld ora è collegato a un wallet diverso. Continua con il wallet attuale oppure scegline un altro.',
    continueCurrent: 'Continua con il wallet attuale',
    chooseAnother: 'Scegli un altro wallet',
  },
  tr: {
    title: 'VeWorld cüzdanın değişti',
    description:
      'VeWorld artık farklı bir cüzdana bağlı. Mevcut cüzdanla devam edebilir veya başka bir cüzdan seçebilirsin.',
    continueCurrent: 'Mevcut cüzdanla devam et',
    chooseAnother: 'Başka bir cüzdan seç',
  },
  nl: {
    title: 'Je VeWorld-wallet is gewijzigd',
    description:
      'VeWorld is nu met een andere wallet verbonden. Ga verder met de huidige wallet of kies een andere.',
    continueCurrent: 'Doorgaan met huidige wallet',
    chooseAnother: 'Andere wallet kiezen',
  },
  de: {
    title: 'Dein VeWorld-Wallet wurde gewechselt',
    description:
      'VeWorld ist jetzt mit einem anderen Wallet verbunden. Fahre mit diesem Wallet fort oder wähle ein anderes.',
    continueCurrent: 'Mit aktuellem Wallet fortfahren',
    chooseAnother: 'Anderes Wallet wählen',
  },
  fr: {
    title: 'Le wallet VeWorld a changé',
    description:
      'VeWorld est maintenant connecté à un autre wallet. Continuez avec le wallet actuel ou choisissez-en un autre.',
    continueCurrent: 'Continuer avec le wallet actuel',
    chooseAnother: 'Choisir un autre wallet',
  },
  ar: {
    title: 'تم تغيير المحفظة في VeWorld',
    description:
      'VeWorld متصل الآن بمحفظة مختلفة. يمكنك المتابعة بالمحفظة الحالية أو اختيار محفظة أخرى.',
    continueCurrent: 'المتابعة بالمحفظة الحالية',
    chooseAnother: 'اختيار محفظة أخرى',
  },
  bn: {
    title: 'VeWorld-এ ওয়ালেট পরিবর্তন হয়েছে',
    description:
      'VeWorld এখন অন্য একটি ওয়ালেটের সঙ্গে যুক্ত। বর্তমান ওয়ালেট দিয়ে চালিয়ে যান অথবা অন্য ওয়ালেট বেছে নিন।',
    continueCurrent: 'বর্তমান ওয়ালেট দিয়ে চালিয়ে যান',
    chooseAnother: 'অন্য ওয়ালেট বেছে নিন',
  },
  pt: {
    title: 'A carteira no VeWorld mudou',
    description:
      'O VeWorld agora está conectado a outra carteira. Continue com a carteira atual ou escolha outra.',
    continueCurrent: 'Continuar com a carteira atual',
    chooseAnother: 'Escolher outra carteira',
  },
  ru: {
    title: 'Кошелёк в VeWorld изменён',
    description:
      'VeWorld теперь подключён к другому кошельку. Продолжите с текущим кошельком или выберите другой.',
    continueCurrent: 'Продолжить с текущим кошельком',
    chooseAnother: 'Выбрать другой кошелёк',
  },
  id: {
    title: 'Dompet di VeWorld berubah',
    description:
      'VeWorld sekarang terhubung ke dompet yang berbeda. Lanjutkan dengan dompet saat ini atau pilih dompet lain.',
    continueCurrent: 'Lanjutkan dengan dompet saat ini',
    chooseAnother: 'Pilih dompet lain',
  },
  vi: {
    title: 'Ví trong VeWorld đã thay đổi',
    description:
      'VeWorld hiện đang kết nối với một ví khác. Hãy tiếp tục với ví hiện tại hoặc chọn một ví khác.',
    continueCurrent: 'Tiếp tục với ví hiện tại',
    chooseAnother: 'Chọn ví khác',
  },
  'zh-tw': {
    title: 'VeWorld 中的錢包已變更',
    description:
      'VeWorld 目前連接的是另一個錢包。你可以使用目前的錢包繼續，或選擇其他錢包。',
    continueCurrent: '使用目前的錢包繼續',
    chooseAnother: '選擇其他錢包',
  },
  sv: {
    title: 'Plånboken i VeWorld har ändrats',
    description:
      'VeWorld är nu ansluten till en annan plånbok. Fortsätt med den aktuella plånboken eller välj en annan.',
    continueCurrent: 'Fortsätt med aktuell plånbok',
    chooseAnother: 'Välj en annan plånbok',
  },
  ro: {
    title: 'Portofelul din VeWorld s-a schimbat',
    description:
      'VeWorld este acum conectat la un alt portofel. Continuă cu portofelul actual sau alege altul.',
    continueCurrent: 'Continuă cu portofelul actual',
    chooseAnother: 'Alege alt portofel',
  },
  ur: {
    title: 'VeWorld میں والٹ تبدیل ہو گیا ہے',
    description:
      'VeWorld اب ایک مختلف والٹ سے منسلک ہے۔ موجودہ والٹ کے ساتھ جاری رکھیں یا دوسرا والٹ منتخب کریں۔',
    continueCurrent: 'موجودہ والٹ کے ساتھ جاری رکھیں',
    chooseAnother: 'دوسرا والٹ منتخب کریں',
  },
  pcm: {
    title: 'Your VeWorld wallet don change',
    description:
      'VeWorld don connect to another wallet now. You fit continue with this wallet or choose another one.',
    continueCurrent: 'Continue with this wallet',
    chooseAnother: 'Choose another wallet',
  },
  arz: {
    title: 'المحفظة في VeWorld اتغيّرت',
    description:
      'VeWorld متوصل دلوقتي بمحفظة مختلفة. تقدر تكمل بالمحفظة الحالية أو تختار محفظة تانية.',
    continueCurrent: 'كمّل بالمحفظة الحالية',
    chooseAnother: 'اختار محفظة تانية',
  },
  mr: {
    title: 'VeWorld मधील वॉलेट बदलले आहे',
    description:
      'VeWorld आता वेगळ्या वॉलेटशी जोडलेले आहे. सध्याच्या वॉलेटसह पुढे जा किंवा दुसरे वॉलेट निवडा.',
    continueCurrent: 'सध्याच्या वॉलेटसह पुढे जा',
    chooseAnother: 'दुसरे वॉलेट निवडा',
  },
  te: {
    title: 'VeWorld లో వాలెట్ మారింది',
    description:
      'VeWorld ఇప్పుడు వేరే వాలెట్‌కు కనెక్ట్ అయింది. ప్రస్తుత వాలెట్‌తో కొనసాగండి లేదా మరో వాలెట్‌ను ఎంచుకోండి.',
    continueCurrent: 'ప్రస్తుత వాలెట్‌తో కొనసాగండి',
    chooseAnother: 'మరో వాలెట్‌ను ఎంచుకోండి',
  },
  sw: {
    title: 'Wallet ya VeWorld imebadilika',
    description:
      'VeWorld sasa imeunganishwa na wallet tofauti. Endelea na wallet ya sasa au chagua nyingine.',
    continueCurrent: 'Endelea na wallet ya sasa',
    chooseAnother: 'Chagua wallet nyingine',
  },
  ha: {
    title: 'An canza wallet a VeWorld',
    description:
      'VeWorld yanzu yana haɗe da wani wallet daban. Ci gaba da wallet na yanzu ko zaɓi wani.',
    continueCurrent: 'Ci gaba da wallet na yanzu',
    chooseAnother: 'Zaɓi wani wallet',
  },
  el: {
    title: 'Το πορτοφόλι σου στο VeWorld άλλαξε',
    description:
      'Το VeWorld είναι πλέον συνδεδεμένο με διαφορετικό πορτοφόλι. Συνέχισε με το τρέχον πορτοφόλι ή επίλεξε άλλο.',
    continueCurrent: 'Συνέχεια με το τρέχον πορτοφόλι',
    chooseAnother: 'Επιλογή άλλου πορτοφολιού',
  },
};
