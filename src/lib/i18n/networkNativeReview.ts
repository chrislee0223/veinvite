import './networkNaturalnessPolish';

import { NETWORK_CANARY_UI_COPY, type NetworkCanaryUiCopy } from './networkCanaryUiCopy';
import { NETWORK_CANVAS_CONTROL_COPY, type NetworkCanvasControlCopy } from './networkCanvasControlCopy';
import { NETWORK_COPY } from './networkCopy';
import { NETWORK_EXPERIENCE_COPY, type NetworkExperienceCopy } from './networkExperienceCopy';
import { NETWORK_EXPLORE_COPY, type NetworkExploreCopy } from './networkExploreCopy';
import { NETWORK_HUB_COPY, type NetworkHubCopy } from './networkHubCopy';
import type { SupportedLocale } from './locales';

type StringPatch<T> = Partial<{ [K in keyof T]: string }>;

type NetworkNativeReviewPatch = {
  canary: StringPatch<NetworkCanaryUiCopy>;
  explore: StringPatch<NetworkExploreCopy>;
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
    explore: {
      exploreDescription: 'Browse public VeInvite networks in the same Network view. Private connections stay hidden.',
      discoverable: 'Show in public list',
      discoverableNote: 'Show your network in the public network list.',
      privateBranchesHidden: 'Private connections stay hidden',
    },
    hub: {
      maintenanceTitle: 'Network is being prepared',
      maintenanceDescription: 'We’re preparing the new Network experience safely. Please check again shortly.',
      visibilityLoading: 'Checking your public-network setting…',
      visibilityUnknown: 'Your public-network setting could not be confirmed. Please try again.',
      publicConfirm: 'Turn on the public network? Other people will be able to see your wallet address and the invitation paths you choose to make public. Mission, reward, and security details remain private.',
    },
    network: { title: 'Your network will be available soon' },
  },
  ko: {
    canary: { hintView: '사람을 길게 눌러 편집 · 화면을 끌어 이동 · 두 손가락으로 확대/축소' },
    explore: {
      exploreDescription: '같은 네트워크 화면에서 공개된 VeInvite 네트워크를 둘러보세요. 비공개 연결은 표시되지 않아요.',
      discoverable: '공개 목록에 표시',
      discoverableNote: '내 네트워크를 공개 목록에 표시해요.',
      privateBranchesHidden: '비공개 연결은 표시되지 않아요',
    },
    hub: {
      maintenanceTitle: '네트워크를 준비 중이에요',
      maintenanceDescription: '새로운 네트워크 기능을 안전하게 준비하고 있어요. 잠시 후 다시 확인해 주세요.',
      visibilityLoading: '공개 네트워크 설정을 확인하고 있어요…',
      visibilityUnknown: '공개 네트워크 설정을 확인하지 못했어요. 다시 시도해 주세요.',
      publicConfirm: '공개 네트워크를 켤까요? 내 지갑 주소와 내가 공개한 추천 연결 경로를 다른 사람이 볼 수 있어요. 미션, 보상, 보안 정보는 공개되지 않아요.',
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
    explore: {
      exploreDescription: '在同一网络画面中浏览公开的 VeInvite 网络。私密连接不会显示。',
      discoverable: '显示在公开列表中',
      discoverableNote: '让你的网络显示在公开网络列表中。',
      privateBranchesHidden: '私密连接不会显示',
    },
    hub: {
      maintenanceTitle: '网络功能正在准备中',
      maintenanceDescription: '我们正在安全地准备新的网络功能，请稍后再试。',
      visibilityLoading: '正在检查公开网络设置…',
      visibilityUnknown: '无法确认你的公开网络设置，请重试。',
      publicConfirm: '开启公开网络吗？其他人将可以看到你的钱包地址以及你主动公开的邀请关系路径。任务、奖励和安全信息仍不会公开。',
    },
    network: { title: '网络功能即将上线' },
  },
  hi: {
    canary: { hintView: 'किसी व्यक्ति को संपादित करने के लिए दबाकर रखें · स्क्रीन खींचकर चलाएँ · दो उँगलियों से ज़ूम करें' },
    explore: {
      exploreDescription: 'इसी नेटवर्क दृश्य में सार्वजनिक VeInvite नेटवर्क देखें। निजी जुड़ाव दिखाई नहीं देंगे।',
      discoverable: 'सार्वजनिक सूची में दिखाएँ',
      discoverableNote: 'अपने नेटवर्क को सार्वजनिक नेटवर्क सूची में दिखाएँ।',
      privateBranchesHidden: 'निजी जुड़ाव छिपे रहते हैं',
    },
    hub: {
      maintenanceTitle: 'नेटवर्क तैयार किया जा रहा है',
      maintenanceDescription: 'हम नए नेटवर्क अनुभव को सुरक्षित रूप से तैयार कर रहे हैं। कृपया थोड़ी देर बाद फिर देखें।',
      visibilityLoading: 'आपकी सार्वजनिक नेटवर्क सेटिंग जाँची जा रही है…',
      visibilityUnknown: 'आपकी सार्वजनिक नेटवर्क सेटिंग की पुष्टि नहीं हो सकी। फिर कोशिश करें।',
      publicConfirm: 'सार्वजनिक नेटवर्क चालू करें? दूसरे लोग आपका वॉलेट पता और वे आमंत्रण संबंध देख सकेंगे जिन्हें आप सार्वजनिक करते हैं। मिशन, इनाम और सुरक्षा से जुड़ी जानकारी निजी रहेगी।',
    },
    network: { title: 'आपका नेटवर्क जल्द उपलब्ध होगा' },
  },
  es: {
    canary: { hintView: 'Mantén pulsado sobre una persona para editar · arrastra la pantalla para moverte · haz zoom con dos dedos' },
    explore: {
      exploreDescription: 'Explora redes públicas de VeInvite en la misma vista de Red. Las conexiones privadas permanecen ocultas.',
      discoverable: 'Mostrar en la lista pública',
      discoverableNote: 'Muestra tu red en la lista de redes públicas.',
      privateBranchesHidden: 'Las conexiones privadas permanecen ocultas',
    },
    hub: {
      maintenanceTitle: 'La red se está preparando',
      maintenanceDescription: 'Estamos preparando de forma segura la nueva experiencia de red. Vuelve a intentarlo en unos instantes.',
      visibilityLoading: 'Comprobando tu configuración de red pública…',
      visibilityUnknown: 'No pudimos confirmar tu configuración de red pública. Inténtalo de nuevo.',
      publicConfirm: '¿Activar la red pública? Otras personas podrán ver la dirección de tu cartera y las rutas de invitación que decidas hacer públicas. La información sobre misiones, recompensas y seguridad seguirá siendo privada.',
    },
    network: { title: 'Tu red estará disponible pronto' },
  },
  ja: {
    canary: { hintView: '人を長押しして編集 · 画面をドラッグして移動 · 2本指で拡大・縮小' },
    explore: {
      exploreDescription: '同じネットワーク画面で公開されている VeInvite ネットワークを見てみましょう。非公開のつながりは表示されません。',
      discoverable: '公開一覧に表示',
      discoverableNote: '自分のネットワークを公開一覧に表示します。',
      privateBranchesHidden: '非公開のつながりは表示されません',
    },
    hub: {
      maintenanceTitle: 'ネットワークを準備しています',
      maintenanceDescription: '新しいネットワーク機能を安全に準備しています。しばらくしてからもう一度お試しください。',
      visibilityLoading: '公開ネットワーク設定を確認しています…',
      visibilityUnknown: '公開ネットワーク設定を確認できませんでした。もう一度お試しください。',
      publicConfirm: '公開ネットワークをオンにしますか？ウォレットアドレスと、あなたが公開した招待経路をほかの人が見られるようになります。ミッション、報酬、セキュリティ情報は非公開のままです。',
    },
    network: { title: 'ネットワーク機能を準備中です' },
  },
  it: {
    canary: { hintView: 'Tieni premuto su una persona per modificare · trascina lo schermo per spostarti · usa due dita per lo zoom' },
    explore: {
      exploreDescription: 'Esplora le reti VeInvite pubbliche nella stessa vista Rete. I collegamenti privati restano nascosti.',
      discoverable: 'Mostra nell’elenco pubblico',
      discoverableNote: 'Mostra la tua rete nell’elenco delle reti pubbliche.',
      privateBranchesHidden: 'I collegamenti privati restano nascosti',
    },
    hub: {
      maintenanceTitle: 'La rete è in preparazione',
      maintenanceDescription: 'Stiamo preparando in sicurezza la nuova esperienza della rete. Riprova tra poco.',
      visibilityLoading: 'Controllo delle impostazioni della rete pubblica…',
      visibilityUnknown: 'Non è stato possibile confermare le impostazioni della rete pubblica. Riprova.',
      publicConfirm: 'Attivare la rete pubblica? Le altre persone potranno vedere l’indirizzo del tuo portafoglio e i percorsi di invito che scegli di rendere pubblici. Le informazioni su missioni, ricompense e sicurezza resteranno private.',
    },
    network: { title: 'La tua rete sarà presto disponibile' },
  },
  tr: {
    canary: { hintView: 'Düzenlemek için kişiye basılı tut · ekranı sürükleyerek hareket et · iki parmakla yakınlaştırıp uzaklaştır' },
    explore: {
      exploreDescription: 'Aynı Ağ ekranında herkese açık VeInvite ağlarını keşfet. Özel bağlantılar gizli kalır.',
      discoverable: 'Herkese açık listede göster',
      discoverableNote: 'Ağını herkese açık ağlar listesinde gösterir.',
      privateBranchesHidden: 'Özel bağlantılar gizli kalır',
    },
    hub: {
      maintenanceTitle: 'Ağ hazırlanıyor',
      maintenanceDescription: 'Yeni ağ deneyimini güvenli bir şekilde hazırlıyoruz. Lütfen biraz sonra tekrar kontrol et.',
      visibilityLoading: 'Herkese açık ağ ayarın kontrol ediliyor…',
      visibilityUnknown: 'Herkese açık ağ ayarın doğrulanamadı. Lütfen tekrar dene.',
      publicConfirm: 'Herkese açık ağı açmak ister misin? Cüzdan adresin ve herkese açık hale getirdiğin davet bağlantıları başkaları tarafından görülebilir. Görev, ödül ve güvenlik bilgileri gizli kalır.',
    },
    network: { title: 'Ağın yakında hazır olacak' },
  },
  nl: {
    canary: { hintView: 'Houd een persoon ingedrukt om te bewerken · versleep het scherm om te bewegen · knijp met twee vingers om te zoomen' },
    explore: {
      exploreDescription: 'Bekijk openbare VeInvite-netwerken in dezelfde netwerkweergave. Privéverbindingen blijven verborgen.',
      discoverable: 'In openbare lijst tonen',
      discoverableNote: 'Toon je netwerk in de lijst met openbare netwerken.',
      privateBranchesHidden: 'Privéverbindingen blijven verborgen',
    },
    hub: {
      maintenanceTitle: 'Netwerk wordt voorbereid',
      maintenanceDescription: 'We bereiden de nieuwe netwerkervaring veilig voor. Probeer het over een moment opnieuw.',
      visibilityLoading: 'Je instelling voor het openbare netwerk wordt gecontroleerd…',
      visibilityUnknown: 'Je instelling voor het openbare netwerk kon niet worden bevestigd. Probeer opnieuw.',
      publicConfirm: 'Openbaar netwerk inschakelen? Andere mensen kunnen je walletadres en de uitnodigingspaden zien die je openbaar maakt. Gegevens over missies, beloningen en beveiliging blijven privé.',
    },
    network: { title: 'Je netwerk is binnenkort beschikbaar' },
  },
  de: {
    canary: { hintView: 'Person zum Bearbeiten gedrückt halten · Bildschirm ziehen, um dich zu bewegen · mit zwei Fingern zoomen' },
    explore: {
      exploreDescription: 'Entdecke öffentliche VeInvite-Netzwerke in derselben Netzwerkansicht. Private Verbindungen bleiben verborgen.',
      discoverable: 'In öffentlicher Liste anzeigen',
      discoverableNote: 'Zeigt dein Netzwerk in der Liste öffentlicher Netzwerke an.',
      privateBranchesHidden: 'Private Verbindungen bleiben verborgen',
    },
    hub: {
      maintenanceTitle: 'Netzwerk wird vorbereitet',
      maintenanceDescription: 'Wir bereiten die neue Netzwerkansicht sicher vor. Bitte versuche es in Kürze erneut.',
      visibilityLoading: 'Deine Einstellung für das öffentliche Netzwerk wird geprüft…',
      visibilityUnknown: 'Deine Einstellung für das öffentliche Netzwerk konnte nicht bestätigt werden. Bitte versuche es erneut.',
      publicConfirm: 'Öffentliches Netzwerk aktivieren? Andere können deine Wallet-Adresse und die von dir öffentlich freigegebenen Einladungswege sehen. Angaben zu Missionen, Belohnungen und Sicherheit bleiben privat.',
    },
    network: { title: 'Dein Netzwerk ist bald verfügbar' },
  },
  fr: {
    canary: { hintView: 'Maintenez le doigt sur une personne pour modifier · faites glisser l’écran pour vous déplacer · zoomez avec deux doigts' },
    explore: {
      exploreDescription: 'Explorez les réseaux VeInvite publics dans la même vue Réseau. Les connexions privées restent masquées.',
      discoverable: 'Afficher dans la liste publique',
      discoverableNote: 'Affiche votre réseau dans la liste des réseaux publics.',
      privateBranchesHidden: 'Les connexions privées restent masquées',
    },
    hub: {
      maintenanceTitle: 'Le réseau est en préparation',
      maintenanceDescription: 'Nous préparons la nouvelle expérience du réseau en toute sécurité. Réessayez dans un instant.',
      visibilityLoading: 'Vérification de votre réglage de réseau public…',
      visibilityUnknown: 'Votre réglage de réseau public n’a pas pu être confirmé. Réessayez.',
      publicConfirm: 'Activer le réseau public ? Les autres pourront voir l’adresse de votre portefeuille et les parcours d’invitation que vous choisissez de rendre publics. Les informations sur les missions, les récompenses et la sécurité resteront privées.',
    },
    network: { title: 'Votre réseau sera bientôt disponible' },
  },
  ar: {
    canary: { hintView: 'اضغط مطولًا على الشخص للتعديل · اسحب الشاشة للتنقل · استخدم إصبعين للتكبير والتصغير' },
    explore: {
      exploreDescription: 'استعرض شبكات VeInvite العامة في شاشة الشبكة نفسها. تظل الاتصالات الخاصة مخفية.',
      discoverable: 'إظهار في القائمة العامة',
      discoverableNote: 'إظهار شبكتك في قائمة الشبكات العامة.',
      privateBranchesHidden: 'تظل الاتصالات الخاصة مخفية',
    },
    hub: {
      maintenanceTitle: 'يجري تجهيز الشبكة',
      maintenanceDescription: 'نُعد تجربة الشبكة الجديدة بأمان. يُرجى المحاولة مرة أخرى بعد قليل.',
      visibilityLoading: 'جارٍ التحقق من إعداد الشبكة العامة…',
      visibilityUnknown: 'تعذر تأكيد إعداد الشبكة العامة. يُرجى المحاولة مرة أخرى.',
      publicConfirm: 'هل تريد تشغيل الشبكة العامة؟ سيتمكن الآخرون من رؤية عنوان محفظتك ومسارات الدعوة التي تختار نشرها. ستظل معلومات المهام والمكافآت والأمان خاصة.',
    },
    network: { title: 'ستتوفر شبكتك قريبًا' },
  },
  bn: {
    canary: { hintView: 'সম্পাদনা করতে কাউকে চেপে ধরে রাখুন · স্ক্রিন টেনে সরান · দুই আঙুলে জুম করুন' },
    explore: {
      exploreDescription: 'একই নেটওয়ার্ক স্ক্রিনে পাবলিক VeInvite নেটওয়ার্কগুলো দেখুন। ব্যক্তিগত সংযোগগুলো লুকানো থাকবে।',
      discoverable: 'পাবলিক তালিকায় দেখান',
      discoverableNote: 'আপনার নেটওয়ার্ককে পাবলিক নেটওয়ার্ক তালিকায় দেখান।',
      privateBranchesHidden: 'ব্যক্তিগত সংযোগগুলো লুকানো থাকবে',
    },
    hub: {
      maintenanceTitle: 'নেটওয়ার্ক প্রস্তুত করা হচ্ছে',
      maintenanceDescription: 'নতুন নেটওয়ার্ক অভিজ্ঞতা নিরাপদভাবে প্রস্তুত করছি। একটু পরে আবার চেষ্টা করুন।',
      visibilityLoading: 'আপনার পাবলিক নেটওয়ার্ক সেটিং পরীক্ষা করা হচ্ছে…',
      visibilityUnknown: 'আপনার পাবলিক নেটওয়ার্ক সেটিং নিশ্চিত করা যায়নি। আবার চেষ্টা করুন।',
      publicConfirm: 'পাবলিক নেটওয়ার্ক চালু করবেন? অন্যরা আপনার ওয়ালেট ঠিকানা এবং আপনি প্রকাশ করা আমন্ত্রণের পথগুলো দেখতে পারবে। মিশন, পুরস্কার ও নিরাপত্তার তথ্য ব্যক্তিগত থাকবে।',
    },
    network: { title: 'আপনার নেটওয়ার্ক শিগগিরই উপলভ্য হবে' },
  },
  pt: {
    canary: { hintView: 'Toque e segure uma pessoa para editar · arraste a tela para se mover · use dois dedos para dar zoom' },
    explore: {
      exploreDescription: 'Explore redes públicas do VeInvite na mesma visualização de Rede. As conexões privadas continuam ocultas.',
      discoverable: 'Mostrar na lista pública',
      discoverableNote: 'Mostra sua rede na lista de redes públicas.',
      privateBranchesHidden: 'As conexões privadas continuam ocultas',
    },
    hub: {
      maintenanceTitle: 'A rede está sendo preparada',
      maintenanceDescription: 'Estamos preparando com segurança a nova experiência de rede. Confira novamente em instantes.',
      visibilityLoading: 'Verificando sua configuração de rede pública…',
      visibilityUnknown: 'Não foi possível confirmar sua configuração de rede pública. Tente novamente.',
      publicConfirm: 'Ativar a rede pública? Outras pessoas poderão ver o endereço da sua carteira e os caminhos de convite que você decidir tornar públicos. As informações de missões, recompensas e segurança continuarão privadas.',
    },
    network: { title: 'Sua rede estará disponível em breve' },
  },
  ru: {
    canary: { hintView: 'Нажмите и удерживайте человека для редактирования · перетаскивайте экран для перемещения · масштабируйте двумя пальцами' },
    explore: {
      exploreDescription: 'Просматривайте публичные сети VeInvite в том же представлении сети. Приватные связи остаются скрытыми.',
      discoverable: 'Показывать в публичном списке',
      discoverableNote: 'Показывает вашу сеть в списке публичных сетей.',
      privateBranchesHidden: 'Приватные связи остаются скрытыми',
    },
    hub: {
      maintenanceTitle: 'Сеть готовится',
      maintenanceDescription: 'Мы безопасно подготавливаем новый интерфейс сети. Проверьте ещё раз чуть позже.',
      visibilityLoading: 'Проверяем настройку публичной сети…',
      visibilityUnknown: 'Не удалось подтвердить настройку публичной сети. Попробуйте снова.',
      publicConfirm: 'Включить публичную сеть? Другие смогут видеть адрес вашего кошелька и пути приглашений, которые вы сделали публичными. Данные о миссиях, наградах и безопасности останутся приватными.',
    },
    network: { title: 'Ваша сеть скоро будет доступна' },
  },
  id: {
    canary: { hintView: 'Tekan dan tahan orang untuk mengedit · seret layar untuk bergerak · cubit dengan dua jari untuk memperbesar atau memperkecil' },
    explore: {
      exploreDescription: 'Jelajahi jaringan VeInvite publik di tampilan Jaringan yang sama. Koneksi privat tetap disembunyikan.',
      discoverable: 'Tampilkan di daftar publik',
      discoverableNote: 'Tampilkan jaringan Anda di daftar jaringan publik.',
      privateBranchesHidden: 'Koneksi privat tetap disembunyikan',
    },
    hub: {
      maintenanceTitle: 'Jaringan sedang disiapkan',
      maintenanceDescription: 'Kami sedang menyiapkan pengalaman jaringan baru dengan aman. Silakan cek lagi sebentar lagi.',
      visibilityLoading: 'Memeriksa pengaturan jaringan publik Anda…',
      visibilityUnknown: 'Pengaturan jaringan publik Anda tidak dapat dikonfirmasi. Coba lagi.',
      publicConfirm: 'Aktifkan jaringan publik? Orang lain dapat melihat alamat dompet Anda dan jalur undangan yang Anda pilih untuk dibuka ke publik. Informasi misi, reward, dan keamanan tetap privat.',
    },
    network: { title: 'Jaringan Anda akan segera tersedia' },
  },
  vi: {
    canary: { hintView: 'Nhấn và giữ một người để chỉnh sửa · kéo màn hình để di chuyển · chụm hai ngón tay để phóng to hoặc thu nhỏ' },
    explore: {
      exploreDescription: 'Khám phá các mạng VeInvite công khai ngay trong cùng màn hình Mạng lưới. Các kết nối riêng tư vẫn được ẩn.',
      discoverable: 'Hiển thị trong danh sách công khai',
      discoverableNote: 'Hiển thị mạng lưới của bạn trong danh sách mạng công khai.',
      privateBranchesHidden: 'Các kết nối riêng tư vẫn được ẩn',
    },
    hub: {
      maintenanceTitle: 'Mạng lưới đang được chuẩn bị',
      maintenanceDescription: 'Chúng tôi đang chuẩn bị trải nghiệm mạng lưới mới một cách an toàn. Vui lòng kiểm tra lại sau ít phút.',
      visibilityLoading: 'Đang kiểm tra cài đặt mạng công khai của bạn…',
      visibilityUnknown: 'Không thể xác nhận cài đặt mạng công khai của bạn. Vui lòng thử lại.',
      publicConfirm: 'Bật mạng công khai? Người khác có thể xem địa chỉ ví và các đường mời mà bạn chủ động công khai. Thông tin nhiệm vụ, phần thưởng và bảo mật vẫn được giữ riêng tư.',
    },
    network: { title: 'Mạng lưới của bạn sẽ sớm sẵn sàng' },
  },
  'zh-tw': {
    canary: { hintView: '長按成員進行編輯 · 拖動畫面移動 · 雙指縮放' },
    explore: {
      exploreDescription: '在同一個網路畫面中瀏覽公開的 VeInvite 網路。私人連結不會顯示。',
      discoverable: '顯示於公開清單',
      discoverableNote: '將你的網路顯示於公開網路清單中。',
      privateBranchesHidden: '私人連結不會顯示',
    },
    hub: {
      maintenanceTitle: '網路功能正在準備中',
      maintenanceDescription: '我們正在安全地準備新的網路功能，請稍後再試。',
      visibilityLoading: '正在確認公開網路設定…',
      visibilityUnknown: '無法確認你的公開網路設定，請再試一次。',
      publicConfirm: '要開啟公開網路嗎？其他人將能看到你的錢包地址，以及你主動公開的邀請關係路徑。任務、獎勵與安全資訊仍不會公開。',
    },
    network: { title: '網路功能即將上線' },
  },
  sv: {
    canary: { hintView: 'Tryck och håll på en person för att redigera · dra skärmen för att flytta · nyp med två fingrar för att zooma' },
    explore: {
      exploreDescription: 'Utforska offentliga VeInvite-nätverk i samma nätverksvy. Privata anslutningar förblir dolda.',
      discoverable: 'Visa i den offentliga listan',
      discoverableNote: 'Visa ditt nätverk i listan över offentliga nätverk.',
      privateBranchesHidden: 'Privata anslutningar förblir dolda',
    },
    hub: {
      maintenanceTitle: 'Nätverket förbereds',
      maintenanceDescription: 'Vi förbereder den nya nätverksupplevelsen på ett säkert sätt. Försök igen om en liten stund.',
      visibilityLoading: 'Kontrollerar inställningen för ditt offentliga nätverk…',
      visibilityUnknown: 'Inställningen för ditt offentliga nätverk kunde inte bekräftas. Försök igen.',
      publicConfirm: 'Aktivera det offentliga nätverket? Andra kan se din plånboksadress och de inbjudningsvägar du väljer att göra offentliga. Uppgifter om uppdrag, belöningar och säkerhet förblir privata.',
    },
    network: { title: 'Ditt nätverk blir snart tillgängligt' },
  },
  ro: {
    canary: { hintView: 'Ține apăsat pe o persoană pentru editare · trage ecranul pentru deplasare · folosește două degete pentru zoom' },
    explore: {
      exploreDescription: 'Explorează rețele VeInvite publice în aceeași vizualizare a rețelei. Conexiunile private rămân ascunse.',
      discoverable: 'Afișează în lista publică',
      discoverableNote: 'Afișează rețeaua ta în lista rețelelor publice.',
      privateBranchesHidden: 'Conexiunile private rămân ascunse',
    },
    hub: {
      maintenanceTitle: 'Rețeaua este în pregătire',
      maintenanceDescription: 'Pregătim în siguranță noua experiență a rețelei. Verifică din nou în curând.',
      visibilityLoading: 'Se verifică setarea rețelei tale publice…',
      visibilityUnknown: 'Setarea rețelei tale publice nu a putut fi confirmată. Încearcă din nou.',
      publicConfirm: 'Activezi rețeaua publică? Alte persoane vor putea vedea adresa portofelului și traseele de invitație pe care alegi să le faci publice. Detaliile despre misiuni, recompense și securitate rămân private.',
    },
    network: { title: 'Rețeaua ta va fi disponibilă în curând' },
  },
  ur: {
    canary: { hintView: 'ترمیم کے لیے کسی شخص کو دبا کر رکھیں · اسکرین گھسیٹ کر حرکت کریں · دو انگلیوں سے زوم کریں' },
    explore: {
      exploreDescription: 'اسی نیٹ ورک اسکرین میں عوامی VeInvite نیٹ ورکس دیکھیں۔ نجی روابط پوشیدہ رہیں گے۔',
      discoverable: 'عوامی فہرست میں دکھائیں',
      discoverableNote: 'اپنے نیٹ ورک کو عوامی نیٹ ورک فہرست میں دکھائیں۔',
      privateBranchesHidden: 'نجی روابط پوشیدہ رہیں گے',
    },
    hub: {
      maintenanceTitle: 'نیٹ ورک تیار کیا جا رہا ہے',
      maintenanceDescription: 'ہم نیٹ ورک کا نیا تجربہ محفوظ طریقے سے تیار کر رہے ہیں۔ تھوڑی دیر بعد دوبارہ دیکھیں۔',
      visibilityLoading: 'آپ کی عوامی نیٹ ورک سیٹنگ چیک کی جا رہی ہے…',
      visibilityUnknown: 'آپ کی عوامی نیٹ ورک سیٹنگ کی تصدیق نہیں ہو سکی۔ دوبارہ کوشش کریں۔',
      publicConfirm: 'عوامی نیٹ ورک آن کریں؟ دوسرے لوگ آپ کا والیٹ ایڈریس اور دعوت کے وہ راستے دیکھ سکیں گے جنہیں آپ عوامی کریں گے۔ مشن، انعام اور سیکیورٹی کی معلومات نجی رہیں گی۔',
    },
    network: { title: 'آپ کا نیٹ ورک جلد دستیاب ہوگا' },
  },
  pcm: {
    canary: { hintView: 'Press and hold person to edit · drag screen move around · pinch to zoom' },
    explore: {
      exploreDescription: 'Check public VeInvite networks for the same Network screen. Private connections no go show.',
      discoverable: 'Show for public list',
      discoverableNote: 'Make your network show for public network list.',
      privateBranchesHidden: 'Private connections no go show',
    },
    hub: {
      maintenanceTitle: 'Network dey prepare',
      maintenanceDescription: 'We dey prepare the new Network experience well and safely. Abeg check again small time.',
      visibilityLoading: 'We dey check your public Network setting…',
      visibilityUnknown: 'We no fit confirm your public Network setting. Try again.',
      publicConfirm: 'Turn on public Network? Other people fit see your wallet address and the invite paths wey you choose make public. Mission, reward and security details go remain private.',
    },
    network: { title: 'Your network go soon dey ready' },
  },
  arz: {
    canary: { hintView: 'دوس ضغطة مطوّلة على الشخص عشان تعدّله · اسحب الشاشة عشان تتحرك · قرّب وبعّد بإصبعين' },
    explore: {
      exploreDescription: 'اتفرّج على شبكات VeInvite العامة في نفس شاشة الشبكة. الاتصالات الخاصة هتفضل مخفية.',
      discoverable: 'اظهر في القائمة العامة',
      discoverableNote: 'يخلّي شبكتك تظهر في قائمة الشبكات العامة.',
      privateBranchesHidden: 'الاتصالات الخاصة هتفضل مخفية',
    },
    hub: {
      maintenanceTitle: 'الشبكة بتتجهز',
      maintenanceDescription: 'إحنا بنجهز تجربة الشبكة الجديدة بشكل آمن. جرّب تاني كمان شوية.',
      visibilityLoading: 'بنتأكد من إعداد الشبكة العامة…',
      visibilityUnknown: 'مقدرناش نتأكد من إعداد الشبكة العامة. جرّب تاني.',
      publicConfirm: 'تشغّل الشبكة العامة؟ الناس هتقدر تشوف عنوان محفظتك ومسارات الدعوات اللي إنت بتختار تخليها عامة. تفاصيل المهمات والمكافآت والأمان هتفضل خاصة.',
    },
    network: { title: 'شبكتك هتبقى متاحة قريب' },
  },
  mr: {
    canary: { hintView: 'संपादित करण्यासाठी व्यक्तीवर दाबून ठेवा · हलण्यासाठी स्क्रीन ओढा · दोन बोटांनी झूम करा' },
    explore: {
      exploreDescription: 'याच नेटवर्क स्क्रीनवर सार्वजनिक VeInvite नेटवर्क पाहा. खाजगी जोडण्या लपलेल्या राहतील.',
      discoverable: 'सार्वजनिक यादीत दाखवा',
      discoverableNote: 'तुमचे नेटवर्क सार्वजनिक नेटवर्कच्या यादीत दाखवा.',
      privateBranchesHidden: 'खाजगी जोडण्या लपलेल्या राहतील',
    },
    hub: {
      maintenanceTitle: 'नेटवर्क तयार केले जात आहे',
      maintenanceDescription: 'नवीन नेटवर्क अनुभव सुरक्षितपणे तयार करत आहोत. कृपया थोड्या वेळाने पुन्हा पाहा.',
      visibilityLoading: 'तुमची सार्वजनिक नेटवर्क सेटिंग तपासली जात आहे…',
      visibilityUnknown: 'तुमची सार्वजनिक नेटवर्क सेटिंग निश्चित करता आली नाही. पुन्हा प्रयत्न करा.',
      publicConfirm: 'सार्वजनिक नेटवर्क सुरू करायचे? इतरांना तुमचा वॉलेट पत्ता आणि तुम्ही सार्वजनिक केलेले आमंत्रण मार्ग दिसू शकतील. मिशन, बक्षीस आणि सुरक्षा माहिती खाजगी राहील.',
    },
    network: { title: 'तुमचे नेटवर्क लवकरच उपलब्ध होईल' },
  },
  te: {
    canary: { hintView: 'సవరించడానికి వ్యక్తిని నొక్కి పట్టుకోండి · కదలడానికి స్క్రీన్‌ను లాగండి · రెండు వేళ్లతో జూమ్ చేయండి' },
    explore: {
      exploreDescription: 'అదే నెట్‌వర్క్ స్క్రీన్‌లో బహిరంగ VeInvite నెట్‌వర్క్‌లను చూడండి. గోప్య అనుసంధానాలు కనిపించవు.',
      discoverable: 'బహిరంగ జాబితాలో చూపించండి',
      discoverableNote: 'మీ నెట్‌వర్క్‌ను బహిరంగ నెట్‌వర్క్‌ల జాబితాలో చూపిస్తుంది.',
      privateBranchesHidden: 'గోప్య అనుసంధానాలు కనిపించవు',
    },
    hub: {
      maintenanceTitle: 'నెట్‌వర్క్ సిద్ధం అవుతోంది',
      maintenanceDescription: 'కొత్త నెట్‌వర్క్ అనుభవాన్ని సురక్షితంగా సిద్ధం చేస్తున్నాం. కొద్దిసేపటి తర్వాత మళ్లీ చూడండి.',
      visibilityLoading: 'మీ బహిరంగ నెట్‌వర్క్ సెట్టింగ్‌ను తనిఖీ చేస్తున్నాం…',
      visibilityUnknown: 'మీ బహిరంగ నెట్‌వర్క్ సెట్టింగ్‌ను నిర్ధారించలేకపోయాం. మళ్లీ ప్రయత్నించండి.',
      publicConfirm: 'బహిరంగ నెట్‌వర్క్‌ను ఆన్ చేయాలా? ఇతరులు మీ వాలెట్ చిరునామా మరియు మీరు బహిరంగంగా ఉంచిన ఆహ్వాన మార్గాలను చూడగలరు. మిషన్‌లు, రివార్డ్‌లు మరియు భద్రతా సమాచారం గోప్యంగానే ఉంటాయి.',
    },
    network: { title: 'మీ నెట్‌వర్క్ త్వరలో అందుబాటులో ఉంటుంది' },
  },
  sw: {
    canary: { hintView: 'Bonyeza na ushikilie mtu ili kuhariri · buruta skrini ili kusogea · tumia vidole viwili kukuza au kupunguza' },
    explore: {
      exploreDescription: 'Vinjari mitandao ya VeInvite iliyo wazi kwenye mwonekano huo huo wa Mtandao. Miunganisho ya faragha hubaki imefichwa.',
      discoverable: 'Onyesha kwenye orodha ya umma',
      discoverableNote: 'Onyesha mtandao wako kwenye orodha ya mitandao ya umma.',
      privateBranchesHidden: 'Miunganisho ya faragha hubaki imefichwa',
    },
    hub: {
      maintenanceTitle: 'Mtandao unaandaliwa',
      maintenanceDescription: 'Tunaandaa matumizi mapya ya mtandao kwa usalama. Tafadhali angalia tena baada ya muda mfupi.',
      visibilityLoading: 'Tunakagua mpangilio wa mtandao wako wa umma…',
      visibilityUnknown: 'Hatukuweza kuthibitisha mpangilio wa mtandao wako wa umma. Jaribu tena.',
      publicConfirm: 'Washa mtandao wa umma? Watu wengine wataweza kuona anwani ya pochi yako na njia za mialiko unazochagua kuweka wazi. Taarifa za misheni, zawadi na usalama zitaendelea kuwa za faragha.',
    },
    network: { title: 'Mtandao wako utapatikana hivi karibuni' },
  },
  ha: {
    canary: { hintView: 'Danna ka riƙe mutum don gyarawa · ja allon don motsawa · ƙara ko rage girma da yatsu biyu' },
    explore: {
      exploreDescription: 'Duba cibiyoyin VeInvite na jama’a a wannan allon cibiyar sadarwa. Haɗin sirri ba za su bayyana ba.',
      discoverable: 'Nuna a jerin jama’a',
      discoverableNote: 'Nuna cibiyar sadarwarka a jerin cibiyoyin jama’a.',
      privateBranchesHidden: 'Haɗin sirri ba za su bayyana ba',
    },
    hub: {
      maintenanceTitle: 'Ana shirya cibiyar sadarwa',
      maintenanceDescription: 'Muna shirya sabuwar hanyar amfani da cibiyar sadarwa cikin aminci. Da fatan za a sake dubawa nan ba da jimawa ba.',
      visibilityLoading: 'Ana duba saitin cibiyar sadarwar jama’a naka…',
      visibilityUnknown: 'Ba a iya tabbatar da saitin cibiyar sadarwar jama’a naka ba. Sake gwadawa.',
      publicConfirm: 'A kunna cibiyar sadarwar jama’a? Wasu za su iya ganin adireshin walat ɗinka da hanyoyin gayyatar da ka zaɓa ka bayyana ga jama’a. Bayanan ayyuka, lada da tsaro za su ci gaba da zama na sirri.',
    },
    network: { title: 'Cibiyar sadarwarka za ta kasance a shirye nan ba da jimawa ba' },
  },
  el: {
    canary: { hintView: 'Πατήστε παρατεταμένα ένα άτομο για επεξεργασία · σύρετε την οθόνη για μετακίνηση · κάντε ζουμ με δύο δάχτυλα' },
    explore: {
      exploreDescription: 'Εξερευνήστε δημόσια δίκτυα VeInvite στην ίδια προβολή Δικτύου. Οι ιδιωτικές συνδέσεις παραμένουν κρυφές.',
      discoverable: 'Εμφάνιση στη δημόσια λίστα',
      discoverableNote: 'Εμφανίζει το δίκτυό σας στη λίστα δημόσιων δικτύων.',
      privateBranchesHidden: 'Οι ιδιωτικές συνδέσεις παραμένουν κρυφές',
    },
    hub: {
      maintenanceTitle: 'Το δίκτυο προετοιμάζεται',
      maintenanceDescription: 'Προετοιμάζουμε με ασφάλεια τη νέα εμπειρία δικτύου. Δοκιμάστε ξανά σε λίγο.',
      visibilityLoading: 'Ελέγχουμε τη ρύθμιση του δημόσιου δικτύου σας…',
      visibilityUnknown: 'Δεν ήταν δυνατή η επιβεβαίωση της ρύθμισης του δημόσιου δικτύου σας. Δοκιμάστε ξανά.',
      publicConfirm: 'Ενεργοποίηση δημόσιου δικτύου; Άλλοι θα μπορούν να βλέπουν τη διεύθυνση του πορτοφολιού σας και τις διαδρομές προσκλήσεων που επιλέγετε να δημοσιοποιήσετε. Οι πληροφορίες για αποστολές, ανταμοιβές και ασφάλεια παραμένουν ιδιωτικές.',
    },
    network: { title: 'Το δίκτυό σας θα είναι σύντομα διαθέσιμο' },
  },
  cs: {
    canary: { hintView: 'Podrž člověka pro úpravy · táhni obrazovku · sevřením prstů měň přiblížení' },
    explore: { exploreDescription: 'Procházej veřejné sítě VeInvite ve stejném zobrazení sítě. Soukromá spojení zůstávají skrytá.', discoverable: 'Zobrazit ve veřejném seznamu', discoverableNote: 'Zobraz svou síť v seznamu veřejných sítí.', privateBranchesHidden: 'Soukromá spojení zůstávají skrytá' },
    hub: { maintenanceTitle: 'Síť se připravuje', maintenanceDescription: 'Nové prostředí sítě připravujeme bezpečně. Zkus to prosím znovu za chvíli.', visibilityLoading: 'Kontrolujeme nastavení veřejné sítě…', visibilityUnknown: 'Nastavení veřejné sítě se nepodařilo ověřit. Zkus to znovu.', publicConfirm: 'Zapnout veřejnou síť? Ostatní uvidí adresu tvé peněženky a cesty pozvánek, které se rozhodneš zveřejnit. Informace o misích, odměnách a zabezpečení zůstanou soukromé.' },
    network: { title: 'Tvoje síť bude brzy dostupná' },
  },
};

for (const locale of Object.keys(NETWORK_NATIVE_REVIEW) as SupportedLocale[]) {
  const patch = NETWORK_NATIVE_REVIEW[locale];
  Object.assign(NETWORK_CANARY_UI_COPY[locale], patch.canary);
  Object.assign(NETWORK_EXPLORE_COPY[locale], patch.explore);
  Object.assign(NETWORK_HUB_COPY[locale], patch.hub);
  Object.assign(NETWORK_COPY[locale], patch.network);
  if (patch.controls) Object.assign(NETWORK_CANVAS_CONTROL_COPY[locale], patch.controls);
  if (patch.experience) Object.assign(NETWORK_EXPERIENCE_COPY[locale], patch.experience);
}
