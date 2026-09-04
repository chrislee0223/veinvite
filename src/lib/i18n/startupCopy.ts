import type { SupportedLocale } from './locales';

type StartupCopy = {
  errorTitle: string;
  errorDescription: string;
  retry: string;
};

export const STARTUP_COPY: Record<SupportedLocale, StartupCopy> = {
  en: {
    errorTitle: 'VeInvite could not finish loading',
    errorDescription:
      'Your wallet or Home data is taking longer than expected. Please try again.',
    retry: 'Try again',
  },
  ko: {
    errorTitle: 'VeInvite를 불러오지 못했어요',
    errorDescription:
      '지갑 또는 홈 데이터를 준비하는 데 예상보다 오래 걸리고 있어요. 다시 시도해 주세요.',
    retry: '다시 시도',
  },
  zh: {
    errorTitle: 'VeInvite 未能完成加载',
    errorDescription:
      '钱包或首页数据的准备时间超出预期，请重试。',
    retry: '重试',
  },
  hi: {
    errorTitle: 'VeInvite लोड नहीं हो सका',
    errorDescription:
      'वॉलेट या होम डेटा तैयार होने में अपेक्षा से अधिक समय लग रहा है। कृपया फिर कोशिश करें।',
    retry: 'फिर कोशिश करें',
  },
  es: {
    errorTitle: 'VeInvite no pudo terminar de cargar',
    errorDescription:
      'La cartera o los datos de inicio están tardando más de lo esperado. Inténtalo de nuevo.',
    retry: 'Intentar de nuevo',
  },
  ja: {
    errorTitle: 'VeInviteを読み込めませんでした',
    errorDescription:
      'ウォレットまたはホームデータの準備に時間がかかっています。もう一度お試しください。',
    retry: 'もう一度試す',
  },
  it: {
    errorTitle: 'VeInvite non ha completato il caricamento',
    errorDescription:
      'Il wallet o i dati Home stanno impiegando più tempo del previsto. Riprova.',
    retry: 'Riprova',
  },
  tr: {
    errorTitle: 'VeInvite yüklenemedi',
    errorDescription:
      'Cüzdan veya ana sayfa verileri beklenenden uzun sürede hazırlanıyor. Lütfen tekrar dene.',
    retry: 'Tekrar dene',
  },
  nl: {
    errorTitle: 'VeInvite kon niet volledig laden',
    errorDescription:
      'Je wallet of Home-gegevens hebben langer nodig dan verwacht. Probeer het opnieuw.',
    retry: 'Opnieuw proberen',
  },
  de: {
    errorTitle: 'VeInvite konnte nicht vollständig geladen werden',
    errorDescription:
      'Deine Wallet oder die Home-Daten benötigen länger als erwartet. Bitte versuche es erneut.',
    retry: 'Erneut versuchen',
  },
  fr: {
    errorTitle: 'VeInvite n’a pas pu terminer le chargement',
    errorDescription:
      'Le wallet ou les données d’accueil prennent plus de temps que prévu. Veuillez réessayer.',
    retry: 'Réessayer',
  },
  ar: {
    errorTitle: 'تعذّر إكمال تحميل VeInvite',
    errorDescription:
      'يستغرق تجهيز المحفظة أو بيانات الصفحة الرئيسية وقتًا أطول من المتوقع. حاول مرة أخرى.',
    retry: 'حاول مرة أخرى',
  },
  bn: {
    errorTitle: 'VeInvite লোড সম্পূর্ণ করতে পারেনি',
    errorDescription:
      'আপনার ওয়ালেট বা হোম ডেটা প্রস্তুত হতে প্রত্যাশার চেয়ে বেশি সময় লাগছে। আবার চেষ্টা করুন।',
    retry: 'আবার চেষ্টা করুন',
  },
  pt: {
    errorTitle: 'O VeInvite não conseguiu concluir o carregamento',
    errorDescription:
      'A carteira ou os dados da página inicial estão demorando mais do que o esperado. Tente novamente.',
    retry: 'Tentar novamente',
  },
  ru: {
    errorTitle: 'VeInvite не удалось завершить загрузку',
    errorDescription:
      'Подготовка кошелька или данных главной страницы занимает больше времени, чем ожидалось. Попробуйте ещё раз.',
    retry: 'Попробовать снова',
  },
  id: {
    errorTitle: 'VeInvite belum selesai dimuat',
    errorDescription:
      'Wallet atau data Beranda membutuhkan waktu lebih lama dari yang diperkirakan. Coba lagi.',
    retry: 'Coba lagi',
  },
  vi: {
    errorTitle: 'VeInvite chưa thể tải xong',
    errorDescription:
      'Ví hoặc dữ liệu Trang chủ đang mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.',
    retry: 'Thử lại',
  },
  'zh-tw': {
    errorTitle: 'VeInvite 無法完成載入',
    errorDescription:
      '錢包或首頁資料的準備時間比預期更久，請再試一次。',
    retry: '再試一次',
  },
  sv: {
    errorTitle: 'VeInvite kunde inte slutföra inläsningen',
    errorDescription:
      'Din plånbok eller startsideinformationen tar längre tid än väntat att förbereda. Försök igen.',
    retry: 'Försök igen',
  },
  ro: {
    errorTitle: 'VeInvite nu a putut finaliza încărcarea',
    errorDescription:
      'Portofelul sau datele paginii principale se pregătesc mai greu decât era de așteptat. Încearcă din nou.',
    retry: 'Încearcă din nou',
  },
  ur: {
    errorTitle: 'VeInvite لوڈ مکمل نہیں کر سکا',
    errorDescription:
      'آپ کے والیٹ یا ہوم ڈیٹا کو تیار ہونے میں توقع سے زیادہ وقت لگ رہا ہے۔ دوبارہ کوشش کریں۔',
    retry: 'دوبارہ کوشش کریں',
  },
  pcm: {
    errorTitle: 'VeInvite no fit finish to load',
    errorDescription:
      'Your wallet or Home data dey take longer than we expect. Abeg try am again.',
    retry: 'Try again',
  },
  arz: {
    errorTitle: 'VeInvite مقدرش يكمّل التحميل',
    errorDescription:
      'المحفظة أو بيانات الصفحة الرئيسية واخدين وقت أطول من المتوقع. جرّب تاني.',
    retry: 'جرّب تاني',
  },
  mr: {
    errorTitle: 'VeInvite लोड पूर्ण करू शकले नाही',
    errorDescription:
      'तुमचे वॉलेट किंवा होम डेटा तयार होण्यासाठी अपेक्षेपेक्षा जास्त वेळ लागत आहे. पुन्हा प्रयत्न करा.',
    retry: 'पुन्हा प्रयत्न करा',
  },
  te: {
    errorTitle: 'VeInvite లోడింగ్‌ను పూర్తి చేయలేకపోయింది',
    errorDescription:
      'మీ వాలెట్ లేదా హోమ్ డేటా సిద్ధం కావడానికి ఊహించినదానికంటే ఎక్కువ సమయం పడుతోంది. మళ్లీ ప్రయత్నించండి.',
    retry: 'మళ్లీ ప్రయత్నించండి',
  },
  sw: {
    errorTitle: 'VeInvite haikuweza kukamilisha upakiaji',
    errorDescription:
      'Wallet yako au data ya ukurasa wa mwanzo inachukua muda mrefu kuliko ilivyotarajiwa. Jaribu tena.',
    retry: 'Jaribu tena',
  },
  ha: {
    errorTitle: 'VeInvite bai kammala lodin ba',
    errorDescription:
      'Wallet ɗinka ko bayanan shafin farko suna ɗaukar lokaci fiye da yadda aka zata. Sake gwadawa.',
    retry: 'Sake gwadawa',
  },
};
