import './networkNaturalnessPolish';

import { NETWORK_CANARY_UI_COPY, type NetworkCanaryUiCopy } from './networkCanaryUiCopy';
import { NETWORK_CANVAS_CONTROL_COPY, type NetworkCanvasControlCopy } from './networkCanvasControlCopy';
import { NETWORK_COPY } from './networkCopy';
import { NETWORK_EXPERIENCE_COPY, type NetworkExperienceCopy } from './networkExperienceCopy';
import { NETWORK_HUB_COPY, type NetworkHubCopy } from './networkHubCopy';
import type { SupportedLocale } from './locales';

type StringPatch<T> = Partial<{ [K in keyof T]: string }>;

type NetworkNativeReviewPatch = {
  canary: StringPatch<NetworkCanaryUiCopy>;
  hub: StringPatch<NetworkHubCopy>;
  network: StringPatch<(typeof NETWORK_COPY)['en']>;
  controls?: StringPatch<NetworkCanvasControlCopy>;
  experience?: StringPatch<NetworkExperienceCopy>;
};

// Final presentation-only language review for every supported Network locale.
// This layer deliberately runs after networkNaturalnessPolish and is imported
// by AppGuide so normal Network, Public Network and the canary all share the
// same reviewed wording. It must never own gesture, geometry, storage or API
// behavior; mature English DOM action labels remain untouched.
const NETWORK_NATIVE_REVIEW: Record<SupportedLocale, NetworkNativeReviewPatch> = {
  en: {
    canary: { hintView: 'Press and hold a person to edit · drag the screen to move · pinch to zoom' },
    hub: {
      maintenanceTitle: 'Network is being prepared',
      maintenanceDescription: 'We’re preparing the new Network experience safely. Please check again shortly.',
    },
    network: { title: 'Your network will be available soon' },
  },
  ko: {
    canary: { hintView: '사람을 길게 눌러 편집 · 화면을 끌어 이동 · 두 손가락으로 확대/축소' },
    hub: {
      maintenanceTitle: '네트워크를 준비 중이에요',
      maintenanceDescription: '새로운 네트워크 기능을 안전하게 준비하고 있어요. 잠시 후 다시 확인해 주세요.',
    },
    network: { title: '네트워크를 준비 중이에요' },
    controls: {
      branch: '연결',
      expandBranch: '연결 펼치기',
      collapseBranch: '연결 접기',
      centerNetwork: '네트워크 중앙으로',
    },
    experience: { noMatching: '일치하는 직접 초대 연결이 없어요.' },
  },
  zh: {
    canary: { hintView: '长按成员进行编辑 · 拖动画面移动 · 双指缩放' },
    hub: {
      maintenanceTitle: '网络功能正在准备中',
      maintenanceDescription: '我们正在安全地准备新的网络功能，请稍后再试。',
    },
    network: { title: '网络功能即将上线' },
  },
  hi: {
    canary: { hintView: 'किसी व्यक्ति को संपादित करने के लिए दबाकर रखें · स्क्रीन खींचकर चलाएँ · दो उँगलियों से ज़ूम करें' },
    hub: {
      maintenanceTitle: 'नेटवर्क तैयार किया जा रहा है',
      maintenanceDescription: 'हम नए नेटवर्क अनुभव को सुरक्षित रूप से तैयार कर रहे हैं। कृपया थोड़ी देर बाद फिर देखें।',
    },
    network: { title: 'आपका नेटवर्क जल्द उपलब्ध होगा' },
  },
  es: {
    canary: { hintView: 'Mantén pulsado sobre una persona para editar · arrastra la pantalla para moverte · haz zoom con dos dedos' },
    hub: {
      maintenanceTitle: 'La red se está preparando',
      maintenanceDescription: 'Estamos preparando de forma segura la nueva experiencia de red. Vuelve a intentarlo en unos instantes.',
    },
    network: { title: 'Tu red estará disponible pronto' },
  },
  ja: {
    canary: { hintView: '人を長押しして編集 · 画面をドラッグして移動 · 2本指で拡大・縮小' },
    hub: {
      maintenanceTitle: 'ネットワークを準備しています',
      maintenanceDescription: '新しいネットワーク機能を安全に準備しています。しばらくしてからもう一度お試しください。',
    },
    network: { title: 'ネットワーク機能を準備中です' },
  },
  it: {
    canary: { hintView: 'Tieni premuto su una persona per modificare · trascina lo schermo per spostarti · usa due dita per lo zoom' },
    hub: {
      maintenanceTitle: 'La rete è in preparazione',
      maintenanceDescription: 'Stiamo preparando in sicurezza la nuova esperienza della rete. Riprova tra poco.',
    },
    network: { title: 'La tua rete sarà presto disponibile' },
  },
  tr: {
    canary: { hintView: 'Düzenlemek için kişiye basılı tut · ekranı sürükleyerek hareket et · iki parmakla yakınlaştırıp uzaklaştır' },
    hub: {
      maintenanceTitle: 'Ağ hazırlanıyor',
      maintenanceDescription: 'Yeni ağ deneyimini güvenli bir şekilde hazırlıyoruz. Lütfen biraz sonra tekrar kontrol et.',
    },
    network: { title: 'Ağın yakında hazır olacak' },
  },
  nl: {
    canary: { hintView: 'Houd een persoon ingedrukt om te bewerken · versleep het scherm om te bewegen · knijp met twee vingers om te zoomen' },
    hub: {
      maintenanceTitle: 'Netwerk wordt voorbereid',
      maintenanceDescription: 'We bereiden de nieuwe netwerkervaring veilig voor. Probeer het over een moment opnieuw.',
    },
    network: { title: 'Je netwerk is binnenkort beschikbaar' },
  },
  de: {
    canary: { hintView: 'Person zum Bearbeiten gedrückt halten · Bildschirm ziehen, um dich zu bewegen · mit zwei Fingern zoomen' },
    hub: {
      maintenanceTitle: 'Netzwerk wird vorbereitet',
      maintenanceDescription: 'Wir bereiten die neue Netzwerkansicht sicher vor. Bitte versuche es in Kürze erneut.',
    },
    network: { title: 'Dein Netzwerk ist bald verfügbar' },
  },
  fr: {
    canary: { hintView: 'Maintenez le doigt sur une personne pour modifier · faites glisser l’écran pour vous déplacer · zoomez avec deux doigts' },
    hub: {
      maintenanceTitle: 'Le réseau est en préparation',
      maintenanceDescription: 'Nous préparons la nouvelle expérience du réseau en toute sécurité. Réessayez dans un instant.',
    },
    network: { title: 'Votre réseau sera bientôt disponible' },
  },
  ar: {
    canary: { hintView: 'اضغط مطولًا على الشخص للتعديل · اسحب الشاشة للتنقل · استخدم إصبعين للتكبير والتصغير' },
    hub: {
      maintenanceTitle: 'يجري تجهيز الشبكة',
      maintenanceDescription: 'نُعد تجربة الشبكة الجديدة بأمان. يُرجى المحاولة مرة أخرى بعد قليل.',
    },
    network: { title: 'ستتوفر شبكتك قريبًا' },
  },
  bn: {
    canary: { hintView: 'সম্পাদনা করতে কাউকে চেপে ধরে রাখুন · স্ক্রিন টেনে সরান · দুই আঙুলে জুম করুন' },
    hub: {
      maintenanceTitle: 'নেটওয়ার্ক প্রস্তুত করা হচ্ছে',
      maintenanceDescription: 'নতুন নেটওয়ার্ক অভিজ্ঞতা নিরাপদভাবে প্রস্তুত করছি। একটু পরে আবার চেষ্টা করুন।',
    },
    network: { title: 'আপনার নেটওয়ার্ক শিগগিরই উপলভ্য হবে' },
  },
  pt: {
    canary: { hintView: 'Toque e segure uma pessoa para editar · arraste a tela para se mover · use dois dedos para dar zoom' },
    hub: {
      maintenanceTitle: 'A rede está sendo preparada',
      maintenanceDescription: 'Estamos preparando com segurança a nova experiência de rede. Confira novamente em instantes.',
    },
    network: { title: 'Sua rede estará disponível em breve' },
  },
  ru: {
    canary: { hintView: 'Нажмите и удерживайте человека для редактирования · перетаскивайте экран для перемещения · масштабируйте двумя пальцами' },
    hub: {
      maintenanceTitle: 'Сеть готовится',
      maintenanceDescription: 'Мы безопасно подготавливаем новый интерфейс сети. Проверьте ещё раз чуть позже.',
    },
    network: { title: 'Ваша сеть скоро будет доступна' },
  },
  id: {
    canary: { hintView: 'Tekan dan tahan orang untuk mengedit · seret layar untuk bergerak · cubit dengan dua jari untuk memperbesar atau memperkecil' },
    hub: {
      maintenanceTitle: 'Jaringan sedang disiapkan',
      maintenanceDescription: 'Kami sedang menyiapkan pengalaman jaringan baru dengan aman. Silakan cek lagi sebentar lagi.',
    },
    network: { title: 'Jaringan Anda akan segera tersedia' },
  },
  vi: {
    canary: { hintView: 'Nhấn và giữ một người để chỉnh sửa · kéo màn hình để di chuyển · chụm hai ngón tay để phóng to hoặc thu nhỏ' },
    hub: {
      maintenanceTitle: 'Mạng lưới đang được chuẩn bị',
      maintenanceDescription: 'Chúng tôi đang chuẩn bị trải nghiệm mạng lưới mới một cách an toàn. Vui lòng kiểm tra lại sau ít phút.',
    },
    network: { title: 'Mạng lưới của bạn sẽ sớm sẵn sàng' },
  },
  'zh-tw': {
    canary: { hintView: '長按成員進行編輯 · 拖動畫面移動 · 雙指縮放' },
    hub: {
      maintenanceTitle: '網路功能正在準備中',
      maintenanceDescription: '我們正在安全地準備新的網路功能，請稍後再試。',
    },
    network: { title: '網路功能即將上線' },
  },
  sv: {
    canary: { hintView: 'Tryck och håll på en person för att redigera · dra skärmen för att flytta · nyp med två fingrar för att zooma' },
    hub: {
      maintenanceTitle: 'Nätverket förbereds',
      maintenanceDescription: 'Vi förbereder den nya nätverksupplevelsen på ett säkert sätt. Försök igen om en liten stund.',
    },
    network: { title: 'Ditt nätverk blir snart tillgängligt' },
  },
  ro: {
    canary: { hintView: 'Ține apăsat pe o persoană pentru editare · trage ecranul pentru deplasare · folosește două degete pentru zoom' },
    hub: {
      maintenanceTitle: 'Rețeaua este în pregătire',
      maintenanceDescription: 'Pregătim în siguranță noua experiență a rețelei. Verifică din nou în curând.',
    },
    network: { title: 'Rețeaua ta va fi disponibilă în curând' },
  },
  ur: {
    canary: { hintView: 'ترمیم کے لیے کسی شخص کو دبا کر رکھیں · اسکرین گھسیٹ کر حرکت کریں · دو انگلیوں سے زوم کریں' },
    hub: {
      maintenanceTitle: 'نیٹ ورک تیار کیا جا رہا ہے',
      maintenanceDescription: 'ہم نیٹ ورک کا نیا تجربہ محفوظ طریقے سے تیار کر رہے ہیں۔ تھوڑی دیر بعد دوبارہ دیکھیں۔',
    },
    network: { title: 'آپ کا نیٹ ورک جلد دستیاب ہوگا' },
  },
  pcm: {
    canary: { hintView: 'Press and hold person to edit · drag screen move around · pinch to zoom' },
    hub: {
      maintenanceTitle: 'Network dey prepare',
      maintenanceDescription: 'We dey prepare the new Network experience well and safely. Abeg check again small time.',
    },
    network: { title: 'Your network go soon dey ready' },
  },
  arz: {
    canary: { hintView: 'دوس ضغطة مطوّلة على الشخص عشان تعدّله · اسحب الشاشة عشان تتحرك · قرّب وبعّد بإصبعين' },
    hub: {
      maintenanceTitle: 'الشبكة بتتجهز',
      maintenanceDescription: 'إحنا بنجهز تجربة الشبكة الجديدة بشكل آمن. جرّب تاني كمان شوية.',
    },
    network: { title: 'شبكتك هتبقى متاحة قريب' },
  },
  mr: {
    canary: { hintView: 'संपादित करण्यासाठी व्यक्तीवर दाबून ठेवा · हलण्यासाठी स्क्रीन ओढा · दोन बोटांनी झूम करा' },
    hub: {
      maintenanceTitle: 'नेटवर्क तयार केले जात आहे',
      maintenanceDescription: 'नवीन नेटवर्क अनुभव सुरक्षितपणे तयार करत आहोत. कृपया थोड्या वेळाने पुन्हा पाहा.',
    },
    network: { title: 'तुमचे नेटवर्क लवकरच उपलब्ध होईल' },
  },
  te: {
    canary: { hintView: 'సవరించడానికి వ్యక్తిని నొక్కి పట్టుకోండి · కదలడానికి స్క్రీన్‌ను లాగండి · రెండు వేళ్లతో జూమ్ చేయండి' },
    hub: {
      maintenanceTitle: 'నెట్‌వర్క్ సిద్ధం అవుతోంది',
      maintenanceDescription: 'కొత్త నెట్‌వర్క్ అనుభవాన్ని సురక్షితంగా సిద్ధం చేస్తున్నాం. కొద్దిసేపటి తర్వాత మళ్లీ చూడండి.',
    },
    network: { title: 'మీ నెట్‌వర్క్ త్వరలో అందుబాటులో ఉంటుంది' },
  },
  sw: {
    canary: { hintView: 'Bonyeza na ushikilie mtu ili kuhariri · buruta skrini ili kusogea · tumia vidole viwili kukuza au kupunguza' },
    hub: {
      maintenanceTitle: 'Mtandao unaandaliwa',
      maintenanceDescription: 'Tunaandaa matumizi mapya ya mtandao kwa usalama. Tafadhali angalia tena baada ya muda mfupi.',
    },
    network: { title: 'Mtandao wako utapatikana hivi karibuni' },
  },
  ha: {
    canary: { hintView: 'Danna ka riƙe mutum don gyarawa · ja allon don motsawa · ƙara ko rage girma da yatsu biyu' },
    hub: {
      maintenanceTitle: 'Ana shirya cibiyar sadarwa',
      maintenanceDescription: 'Muna shirya sabuwar hanyar amfani da cibiyar sadarwa cikin aminci. Da fatan za a sake dubawa nan ba da jimawa ba.',
    },
    network: { title: 'Cibiyar sadarwarka za ta kasance a shirye nan ba da jimawa ba' },
  },
  el: {
    canary: { hintView: 'Πατήστε παρατεταμένα ένα άτομο για επεξεργασία · σύρετε την οθόνη για μετακίνηση · κάντε ζουμ με δύο δάχτυλα' },
    hub: {
      maintenanceTitle: 'Το δίκτυο προετοιμάζεται',
      maintenanceDescription: 'Προετοιμάζουμε με ασφάλεια τη νέα εμπειρία δικτύου. Δοκιμάστε ξανά σε λίγο.',
    },
    network: { title: 'Το δίκτυό σας θα είναι σύντομα διαθέσιμο' },
  },
  cs: {
    canary: { hintView: 'Podrž člověka pro úpravy · táhni obrazovku · sevřením prstů měň přiblížení' },
    hub: { maintenanceTitle: 'Síť se připravuje', maintenanceDescription: 'Nové prostředí sítě připravujeme bezpečně. Zkus to prosím znovu za chvíli.', },
    network: { title: 'Tvoje síť bude brzy dostupná' },
  },
};

for (const locale of Object.keys(NETWORK_NATIVE_REVIEW) as SupportedLocale[]) {
  const patch = NETWORK_NATIVE_REVIEW[locale];
  Object.assign(NETWORK_CANARY_UI_COPY[locale], patch.canary);
  Object.assign(NETWORK_HUB_COPY[locale], patch.hub);
  Object.assign(NETWORK_COPY[locale], patch.network);
  if (patch.controls) Object.assign(NETWORK_CANVAS_CONTROL_COPY[locale], patch.controls);
  if (patch.experience) Object.assign(NETWORK_EXPERIENCE_COPY[locale], patch.experience);
}
