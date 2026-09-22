import type { SupportedLocale } from './locales';

export type NetworkHubCopy = {
  maintenanceTitle: string;
  maintenanceDescription: string;
};

export const NETWORK_HUB_COPY: Record<SupportedLocale, NetworkHubCopy> = {
  en: { maintenanceTitle:'Network is being prepared', maintenanceDescription:'We are preparing the new Network experience safely. Please check again shortly.', },
  ko: { maintenanceTitle:'네트워크를 준비하고 있어요', maintenanceDescription:'새로운 네트워크 기능을 안전하게 준비 중입니다. 잠시 후 다시 확인해 주세요.', },
  zh: { maintenanceTitle:'网络功能正在准备中', maintenanceDescription:'我们正在安全地准备新的网络体验，请稍后再试。', },
  hi: { maintenanceTitle:'नेटवर्क तैयार किया जा रहा है', maintenanceDescription:'हम नए Network अनुभव को सुरक्षित रूप से तैयार कर रहे हैं। कृपया थोड़ी देर बाद फिर देखें।', },
  es: { maintenanceTitle:'Estamos preparando Network', maintenanceDescription:'Estamos preparando de forma segura la nueva experiencia de Network. Vuelve a comprobarlo en breve.', },
  ja: { maintenanceTitle:'ネットワークを準備しています', maintenanceDescription:'新しいネットワーク機能を安全に準備しています。しばらくしてからもう一度確認してください。', },
  it: { maintenanceTitle:'Network è in preparazione', maintenanceDescription:'Stiamo preparando in sicurezza la nuova esperienza Network. Ricontrolla tra poco.', },
  tr: { maintenanceTitle:'Network hazırlanıyor', maintenanceDescription:'Yeni Network deneyimini güvenli şekilde hazırlıyoruz. Lütfen kısa süre sonra tekrar kontrol edin.', },
  nl: { maintenanceTitle:'Network wordt voorbereid', maintenanceDescription:'We bereiden de nieuwe Network-ervaring veilig voor. Probeer het binnenkort opnieuw.', },
  de: { maintenanceTitle:'Network wird vorbereitet', maintenanceDescription:'Wir bereiten die neue Network-Erfahrung sicher vor. Bitte prüfe es in Kürze erneut.', },
  fr: { maintenanceTitle:'Network est en préparation', maintenanceDescription:'Nous préparons la nouvelle expérience Network en toute sécurité. Réessayez dans un instant.', },
  ar: { maintenanceTitle:'يتم تجهيز الشبكة', maintenanceDescription:'نقوم بإعداد تجربة Network الجديدة بأمان. يرجى المحاولة مرة أخرى بعد قليل.', },
  bn: { maintenanceTitle:'Network প্রস্তুত করা হচ্ছে', maintenanceDescription:'নতুন Network অভিজ্ঞতাটি নিরাপদভাবে প্রস্তুত করা হচ্ছে। একটু পরে আবার দেখুন।', },
  pt: { maintenanceTitle:'Network está sendo preparado', maintenanceDescription:'Estamos preparando com segurança a nova experiência de Network. Verifique novamente em instantes.', },
  ru: { maintenanceTitle:'Network готовится', maintenanceDescription:'Мы безопасно подготавливаем новый интерфейс Network. Проверьте ещё раз чуть позже.', },
  id: { maintenanceTitle:'Network sedang disiapkan', maintenanceDescription:'Kami sedang menyiapkan pengalaman Network baru dengan aman. Silakan cek lagi sebentar lagi.', },
  vi: { maintenanceTitle:'Network đang được chuẩn bị', maintenanceDescription:'Chúng tôi đang chuẩn bị trải nghiệm Network mới một cách an toàn. Vui lòng kiểm tra lại sau ít phút.', },
  'zh-tw': { maintenanceTitle:'網路功能正在準備中', maintenanceDescription:'我們正在安全地準備新的 Network 體驗，請稍後再試。', },
  sv: { maintenanceTitle:'Network förbereds', maintenanceDescription:'Vi förbereder den nya Network-upplevelsen på ett säkert sätt. Kontrollera igen om en liten stund.', },
  ro: { maintenanceTitle:'Network este în pregătire', maintenanceDescription:'Pregătim în siguranță noua experiență Network. Verifică din nou în curând.', },
  ur: { maintenanceTitle:'Network تیار کیا جا رہا ہے', maintenanceDescription:'ہم نئے Network تجربے کو محفوظ طریقے سے تیار کر رہے ہیں۔ تھوڑی دیر بعد دوبارہ دیکھیں۔', },
  pcm: { maintenanceTitle:'Network dey prepare', maintenanceDescription:'We dey prepare di new Network experience safely. Abeg check again small time.', },
  arz: { maintenanceTitle:'Network بيتجهز', maintenanceDescription:'إحنا بنجهز تجربة Network الجديدة بشكل آمن. جرّب تاني كمان شوية.', },
  mr: { maintenanceTitle:'Network तयार केले जात आहे', maintenanceDescription:'नवीन Network अनुभव सुरक्षितपणे तयार केला जात आहे. कृपया थोड्या वेळाने पुन्हा पाहा.', },
  te: { maintenanceTitle:'Network సిద్ధం అవుతోంది', maintenanceDescription:'కొత్త Network అనుభవాన్ని సురక్షితంగా సిద్ధం చేస్తున్నాం. కొద్దిసేపటి తర్వాత మళ్లీ చూడండి.', },
  sw: { maintenanceTitle:'Network inaandaliwa', maintenanceDescription:'Tunaandaa matumizi mapya ya Network kwa usalama. Tafadhali angalia tena baada ya muda mfupi.', },
  ha: { maintenanceTitle:'Ana shirya Network', maintenanceDescription:'Muna shirya sabon kwarewar Network cikin aminci. Da fatan za a sake dubawa nan ba da jimawa ba.', },
  el: { maintenanceTitle:'Το Network προετοιμάζεται', maintenanceDescription:'Προετοιμάζουμε με ασφάλεια τη νέα εμπειρία Network. Ελέγξτε ξανά σε λίγο.', },
  cs: { maintenanceTitle:'Síť se připravuje', maintenanceDescription:'Nové prostředí sítě připravujeme bezpečně. Zkus to prosím znovu za chvíli.', },
};
