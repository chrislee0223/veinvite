import { NETWORK_CANVAS_CONTROL_COPY, type NetworkCanvasControlCopy } from './networkCanvasControlCopy';
import { NETWORK_CANARY_INTERACTION_COPY } from './networkCanaryInteractionCopy';
import { NETWORK_CANARY_UI_COPY, type NetworkCanaryUiCopy } from './networkCanaryUiCopy';
import { NETWORK_COPY } from './networkCopy';
import { NETWORK_EXPERIENCE_COPY, type NetworkExperienceCopy } from './networkExperienceCopy';
import { NETWORK_EXPLORE_COPY, type NetworkExploreCopy } from './networkExploreCopy';
import type { SupportedLocale } from './locales';

type StringPatch<T> = Partial<{ [K in keyof T]: string }>;

type NetworkNaturalnessPatch = {
  canary: StringPatch<NetworkCanaryUiCopy>;
  controls?: StringPatch<NetworkCanvasControlCopy>;
  experience?: StringPatch<NetworkExperienceCopy>;
  explore?: StringPatch<NetworkExploreCopy>;
  network?: StringPatch<(typeof NETWORK_COPY)['en']>;
  interaction?: StringPatch<(typeof NETWORK_CANARY_INTERACTION_COPY)['en']>;
};

// Final language-quality pass for the production Network experience.
// Keep this separate from the mature English DOM action labels: V42/V44 still
// use those labels as interaction state. These patches only refine localized
// presentation copy and therefore cannot change drag/drop or group semantics.
// Count labels deliberately put the number after a noun label in languages
// where singular/plural inflection would otherwise produce strings like
// "1 people" or an equivalent grammatical mismatch.
const NETWORK_NATURALNESS_PATCHES: Record<SupportedLocale, NetworkNaturalnessPatch> = {
  en: {
    canary: {
      savedCount: 'People in this group: {count}',
      peopleCount: 'People: {count}',
      groupsCount: 'Groups: {count}',
      zeroAllowed: 'This group can stay empty',
      dragUngroup: 'Drop here to remove from the group',
      newNodeAdded: 'New friend added',
    },
  },
  ko: {
    canary: {
      savedCount: '이 그룹 인원 {count}명',
      peopleCount: '인원 {count}명',
      groupsCount: '그룹 {count}개',
      dropPersonOrTap: '사람을 여기로 끌거나 눌러 그룹 만들기',
      releaseAdd: '놓으면 추가',
      emptyReady: '비어 있음 · 사람을 놓을 수 있어요',
      optional: '사람을 선택하지 않아도 돼요',
      zeroAllowed: '빈 그룹으로 저장할 수 있어요',
      save: '변경사항 저장',
      tapAddRemove: '사람을 눌러 추가하거나 제거하세요',
      removeFromGroup: '그룹에서 제거',
      dragUngroup: '그룹에서만 빼려면 여기에 놓기',
      hintEdit: '자유롭게 이동 · 배경을 눌러 편집 종료',
      hintCluster: '확대하거나 +N을 눌러 펼치기 · 축소하면 다시 묶기',
      hintView: '사람을 길게 눌러 편집 · 화면을 끌어 이동 · 두 손가락으로 확대/축소',
      newNodeAdded: '새 친구가 추가됐어요',
    },
    controls: {
      branch: '분기',
      expandBranch: '분기 펼치기',
      collapseBranch: '분기 접기',
      centerNetwork: '네트워크 중앙 맞춤',
    },
    experience: {
      directNetwork: '직접 초대 네트워크',
      emptyTitle: '내 네트워크는 여기서 시작돼요',
      invitedBy: '초대한 사람',
      noMatching: '일치하는 직접 초대 분기가 없어요.',
    },
    interaction: {
      confirmMoveError: '그룹 이동이 완료됐는지 확인하지 못했어요.',
    },
  },
  zh: {
    canary: {
      savedCount: '此分组人数：{count}',
      peopleCount: '人数：{count}',
      groupsCount: '分组：{count}',
      zeroAllowed: '分组可以留空',
      dragUngroup: '拖到这里即可移出分组',
      newNodeAdded: '已添加新朋友',
    },
  },
  hi: {
    canary: {
      savedCount: 'इस समूह में लोग: {count}',
      peopleCount: 'लोग: {count}',
      groupsCount: 'समूह: {count}',
      zeroAllowed: 'समूह खाली भी रह सकता है',
      dragUngroup: 'समूह से हटाने के लिए यहाँ छोड़ें',
      newNodeAdded: 'नया दोस्त जोड़ा गया',
    },
    experience: {
      invitedBy: 'आमंत्रणकर्ता',
    },
  },
  es: {
    canary: {
      savedCount: 'Personas en este grupo: {count}',
      peopleCount: 'Personas: {count}',
      groupsCount: 'Grupos: {count}',
      zeroAllowed: 'El grupo puede quedar vacío',
      dragUngroup: 'Suelta aquí para quitar del grupo',
      hintView: 'Mantén un nodo para editar · arrastra el lienzo · pellizca para hacer zoom',
      newNodeAdded: 'Nuevo amigo añadido',
    },
  },
  ja: {
    canary: {
      savedCount: 'このグループの人数：{count}',
      peopleCount: '人数：{count}',
      groupsCount: 'グループ：{count}',
      zeroAllowed: '空のグループでも保存できます',
      dragUngroup: 'グループから外すならここにドロップ',
      newNodeAdded: '新しい友だちを追加しました',
    },
  },
  it: {
    canary: {
      savedCount: 'Persone nel gruppo: {count}',
      peopleCount: 'Persone: {count}',
      groupsCount: 'Gruppi: {count}',
      zeroAllowed: 'Il gruppo può restare vuoto',
      dragUngroup: 'Rilascia qui per rimuovere dal gruppo',
      joining: 'Sta entrando nella rete',
      verifiedAdding: 'Verificato · inserimento nella rete in corso',
      newNodeAdded: 'Nuovo amico aggiunto',
    },
    explore: {
      maintenance: 'La rete non è al momento disponibile.',
    },
  },
  tr: {
    canary: {
      savedCount: 'Bu gruptaki kişi: {count}',
      peopleCount: 'Kişi: {count}',
      groupsCount: 'Grup: {count}',
      zeroAllowed: 'Grup boş kalabilir',
      dragUngroup: 'Gruptan çıkarmak için buraya bırak',
      available: 'Davet edilebilir',
      newNodeAdded: 'Yeni arkadaş eklendi',
    },
    network: {
      title: 'Ağın çok yakında hazır olacak',
    },
  },
  nl: {
    canary: {
      savedCount: 'Personen in deze groep: {count}',
      peopleCount: 'Personen: {count}',
      groupsCount: 'Groepen: {count}',
      zeroAllowed: 'De groep mag leeg blijven',
      dragUngroup: 'Laat hier los om uit de groep te halen',
      newNodeAdded: 'Nieuwe vriend toegevoegd',
    },
  },
  de: {
    canary: {
      savedCount: 'Personen in dieser Gruppe: {count}',
      peopleCount: 'Personen: {count}',
      groupsCount: 'Gruppen: {count}',
      zeroAllowed: 'Die Gruppe kann leer bleiben',
      dragUngroup: 'Hier loslassen, um aus der Gruppe zu entfernen',
      fit: 'Ansicht anpassen',
      hintView: 'Knoten halten zum Bearbeiten · Fläche ziehen · mit zwei Fingern zoomen',
      newNodeAdded: 'Neuer Freund hinzugefügt',
    },
    explore: {
      viewing: 'Erkundung',
    },
  },
  fr: {
    canary: {
      savedCount: 'Personnes dans ce groupe : {count}',
      peopleCount: 'Personnes : {count}',
      groupsCount: 'Groupes : {count}',
      zeroAllowed: 'Le groupe peut rester vide',
      dragUngroup: 'Relâchez ici pour retirer du groupe',
      joining: 'Rejoint le réseau',
      newNodeAdded: 'Nouvel ami ajouté',
    },
  },
  ar: {
    canary: {
      savedCount: 'الأشخاص في هذه المجموعة: {count}',
      peopleCount: 'الأشخاص: {count}',
      groupsCount: 'المجموعات: {count}',
      zeroAllowed: 'يمكن أن تبقى المجموعة فارغة',
      dragUngroup: 'أفلت هنا للإزالة من المجموعة',
      hintView: 'اضغط مطولًا على العقدة للتعديل · اسحب اللوحة · استخدم إصبعين للتكبير والتصغير',
      newNodeAdded: 'تمت إضافة صديق جديد',
    },
  },
  bn: {
    canary: {
      savedCount: 'এই গ্রুপে সদস্য: {count}',
      peopleCount: 'সদস্য: {count}',
      groupsCount: 'গ্রুপ: {count}',
      zeroAllowed: 'গ্রুপ খালি রাখা যায়',
      dragUngroup: 'গ্রুপ থেকে সরাতে এখানে ছেড়ে দিন',
      newNodeAdded: 'নতুন বন্ধু যোগ হয়েছে',
    },
  },
  pt: {
    canary: {
      savedCount: 'Pessoas neste grupo: {count}',
      peopleCount: 'Pessoas: {count}',
      groupsCount: 'Grupos: {count}',
      zeroAllowed: 'O grupo pode ficar vazio',
      dragUngroup: 'Solte aqui para remover do grupo',
      hintView: 'Segure um nó para editar · arraste a tela · faça pinça para dar zoom',
      newNodeAdded: 'Novo amigo adicionado',
    },
  },
  ru: {
    canary: {
      savedCount: 'Участники в этой группе: {count}',
      peopleCount: 'Участники: {count}',
      groupsCount: 'Группы: {count}',
      zeroAllowed: 'Группа может оставаться пустой',
      dragUngroup: 'Отпустите здесь, чтобы убрать из группы',
      newNodeAdded: 'Добавлен новый друг',
    },
  },
  id: {
    canary: {
      savedCount: 'Orang di grup ini: {count}',
      peopleCount: 'Orang: {count}',
      groupsCount: 'Grup: {count}',
      zeroAllowed: 'Grup boleh tetap kosong',
      dragUngroup: 'Lepaskan di sini untuk mengeluarkan dari grup',
      hintView: 'Tahan node untuk mengedit · seret kanvas · cubit untuk memperbesar atau memperkecil',
      newNodeAdded: 'Teman baru ditambahkan',
    },
  },
  vi: {
    canary: {
      savedCount: 'Số người trong nhóm: {count}',
      peopleCount: 'Số người: {count}',
      groupsCount: 'Số nhóm: {count}',
      zeroAllowed: 'Nhóm có thể để trống',
      dragUngroup: 'Thả vào đây để đưa ra khỏi nhóm',
      hintView: 'Giữ một nút mạng để chỉnh sửa · kéo màn hình · chụm để thu phóng',
      newNodeAdded: 'Đã thêm người bạn mới',
    },
    network: {
      title: 'Mạng lưới của bạn sắp sẵn sàng',
    },
  },
  'zh-tw': {
    canary: {
      savedCount: '此群組人數：{count}',
      peopleCount: '人數：{count}',
      groupsCount: '群組：{count}',
      zeroAllowed: '群組可以留空',
      dragUngroup: '拖到這裡即可移出群組',
      dragOrTap: '從網路拖入或點按選擇',
      verifiedAdding: '已驗證 · 正在加入此網路',
      newNodeAdded: '已新增朋友',
    },
    experience: {
      title: '我的網路',
      directNetwork: '直接網路',
      searchPlaceholder: '在我的網路中搜尋錢包',
      noSearchResults: '你的網路中沒有相符的錢包。',
      networkSize: '網路規模',
      emptyTitle: '你的網路從這裡開始',
      connectTitle: '連接錢包查看你的網路',
      connectDescription: 'VeInvite 網路僅能在已驗證的錢包工作階段查看。',
      loadError: '無法載入你的網路。',
      backToMine: '返回我的網路',
    },
    network: {
      navLabel: '網路',
      title: '網路功能即將推出',
      description: '我們正在準備一個頁面，讓你可以一目了然地查看你邀請的朋友，以及從他們繼續延伸的 VeInvite 網路。',
    },
  },
  sv: {
    canary: {
      savedCount: 'Personer i den här gruppen: {count}',
      peopleCount: 'Personer: {count}',
      groupsCount: 'Grupper: {count}',
      zeroAllowed: 'Gruppen kan vara tom',
      dragUngroup: 'Släpp här för att ta bort från gruppen',
      joining: 'Går med',
      newFriendJoining: 'En ny vän går med…',
      newNodeAdded: 'Ny vän tillagd',
    },
  },
  ro: {
    canary: {
      savedCount: 'Persoane în acest grup: {count}',
      peopleCount: 'Persoane: {count}',
      groupsCount: 'Grupuri: {count}',
      zeroAllowed: 'Grupul poate rămâne gol',
      dragUngroup: 'Eliberează aici pentru a scoate din grup',
      newNodeAdded: 'Prieten nou adăugat',
    },
  },
  ur: {
    canary: {
      savedCount: 'اس گروپ میں افراد: {count}',
      peopleCount: 'افراد: {count}',
      groupsCount: 'گروپس: {count}',
      zeroAllowed: 'گروپ خالی بھی رہ سکتا ہے',
      dragUngroup: 'گروپ سے نکالنے کے لیے یہاں چھوڑیں',
      newNodeAdded: 'نیا دوست شامل ہوگیا',
    },
  },
  pcm: {
    canary: {
      savedCount: 'People for this group: {count}',
      peopleCount: 'People: {count}',
      groupsCount: 'Groups: {count}',
      zeroAllowed: 'Group fit remain empty',
      dragUngroup: 'Drop am here to comot am from group',
      hintEdit: 'Drag am anywhere · tap background to finish',
      newNodeAdded: 'New friend don join',
    },
  },
  arz: {
    canary: {
      savedCount: 'الأشخاص في المجموعة دي: {count}',
      peopleCount: 'الأشخاص: {count}',
      groupsCount: 'المجموعات: {count}',
      zeroAllowed: 'المجموعة ينفع تفضل فاضية',
      dragUngroup: 'سيبه هنا عشان تشيله من المجموعة',
      newNodeAdded: 'اتضاف صديق جديد',
    },
  },
  mr: {
    canary: {
      savedCount: 'या गटातील लोक: {count}',
      peopleCount: 'लोक: {count}',
      groupsCount: 'गट: {count}',
      zeroAllowed: 'गट रिकामा ठेवू शकता',
      dragUngroup: 'गटातून काढण्यासाठी इथे सोडा',
      collapsed: 'आकुंचित',
      expanded: 'विस्तारित',
      newNodeAdded: 'नवा मित्र जोडला',
    },
    controls: {
      collapseBranch: 'शाखा दुमडा',
    },
  },
  te: {
    canary: {
      savedCount: 'ఈ గ్రూపులో వ్యక్తులు: {count}',
      peopleCount: 'వ్యక్తులు: {count}',
      groupsCount: 'గ్రూపులు: {count}',
      zeroAllowed: 'గ్రూపును ఖాళీగా ఉంచవచ్చు',
      dragUngroup: 'గ్రూపు నుంచి తీసివేయడానికి ఇక్కడ వదలండి',
      newNodeAdded: 'కొత్త స్నేహితుడు జోడించబడ్డాడు',
    },
  },
  sw: {
    canary: {
      savedCount: 'Watu katika kikundi hiki: {count}',
      peopleCount: 'Watu: {count}',
      groupsCount: 'Vikundi: {count}',
      zeroAllowed: 'Kikundi kinaweza kubaki tupu',
      dragUngroup: 'Achia hapa ili kuondoa kwenye kikundi',
      newNodeAdded: 'Rafiki mpya ameongezwa',
    },
  },
  ha: {
    canary: {
      savedCount: 'Mutane a wannan rukuni: {count}',
      peopleCount: 'Mutane: {count}',
      groupsCount: 'Rukuni: {count}',
      zeroAllowed: 'Rukuni na iya zama babu kowa',
      dragUngroup: 'Saki a nan don cirewa daga rukuni',
      newNodeAdded: 'An ƙara sabon aboki',
    },
  },
  el: {
    canary: {
      savedCount: 'Άτομα σε αυτή την ομάδα: {count}',
      peopleCount: 'Άτομα: {count}',
      groupsCount: 'Ομάδες: {count}',
      zeroAllowed: 'Η ομάδα μπορεί να μείνει κενή',
      dragUngroup: 'Άφησε εδώ για αφαίρεση από την ομάδα',
      joining: 'Μπαίνει στο δίκτυο',
      newFriendJoining: 'Ένας νέος φίλος μπαίνει στο δίκτυο…',
      newNodeAdded: 'Προστέθηκε νέος φίλος',
    },
  },
  cs: {
    canary: { savedCount:'Lidé v této skupině: {count}', peopleCount:'Lidé: {count}', groupsCount:'Skupiny: {count}', zeroAllowed:'Skupina může zůstat prázdná', dragUngroup:'Pusť sem pro odebrání ze skupiny', newNodeAdded:'Přidán nový přítel' },
  },
};

for (const [locale, patch] of Object.entries(NETWORK_NATURALNESS_PATCHES) as Array<
  [SupportedLocale, NetworkNaturalnessPatch]
>) {
  Object.assign(NETWORK_CANARY_UI_COPY[locale], patch.canary);
  if (patch.controls) Object.assign(NETWORK_CANVAS_CONTROL_COPY[locale], patch.controls);
  if (patch.experience) Object.assign(NETWORK_EXPERIENCE_COPY[locale], patch.experience);
  if (patch.explore) Object.assign(NETWORK_EXPLORE_COPY[locale], patch.explore);
  if (patch.network) Object.assign(NETWORK_COPY[locale], patch.network);
  if (patch.interaction) Object.assign(NETWORK_CANARY_INTERACTION_COPY[locale], patch.interaction);
}

type NetworkUserFacingCanaryPolish = Pick<
  NetworkCanaryUiCopy,
  'hintView' | 'allCanvas' | 'available' | 'removed'
>;

// A final user-facing terminology pass. These four labels are visible in the
// canvas but do not describe implementation details, so avoid developer terms
// such as node/canvas and make invite/group-removal status explicit.
const NETWORK_USER_FACING_CANARY_POLISH: Record<SupportedLocale, NetworkUserFacingCanaryPolish> = {
  en: {
    hintView: 'Hold a person to edit · drag the screen · pinch to zoom',
    allCanvas: 'All on one screen',
    available: 'Invite available',
    removed: 'Group deleted',
  },
  ko: {
    hintView: '사람을 길게 눌러 편집 · 화면을 끌어 이동 · 두 손가락으로 확대/축소',
    allCanvas: '한 화면에 모두 표시',
    available: '초대 가능',
    removed: '그룹 삭제됨',
  },
  zh: {
    hintView: '长按人物编辑 · 拖动画面 · 双指缩放',
    allCanvas: '全部显示在同一画面',
    available: '可邀请',
    removed: '分组已删除',
  },
  hi: {
    hintView: 'संपादन के लिए व्यक्ति को दबाकर रखें · स्क्रीन खींचें · पिंच से ज़ूम करें',
    allCanvas: 'सबको एक स्क्रीन पर दिखाएँ',
    available: 'आमंत्रण उपलब्ध',
    removed: 'समूह हटाया गया',
  },
  es: {
    hintView: 'Mantén pulsada una persona para editar · arrastra la pantalla · pellizca para ampliar',
    allCanvas: 'Todo en una sola pantalla',
    available: 'Invitación disponible',
    removed: 'Grupo eliminado',
  },
  ja: {
    hintView: '人を長押しして編集 · 画面をドラッグ · ピンチで拡大縮小',
    allCanvas: 'すべてを1画面に表示',
    available: '招待可能',
    removed: 'グループを削除しました',
  },
  it: {
    hintView: 'Tieni premuta una persona per modificare · trascina lo schermo · pizzica per zoomare',
    allCanvas: 'Tutto in una sola schermata',
    available: 'Invito disponibile',
    removed: 'Gruppo rimosso',
  },
  tr: {
    hintView: 'Düzenlemek için kişiyi basılı tut · ekranı sürükle · yakınlaştırmak için sıkıştır',
    allCanvas: 'Tümü tek ekranda',
    available: 'Davet edilebilir',
    removed: 'Grup kaldırıldı',
  },
  nl: {
    hintView: 'Houd een persoon vast om te bewerken · sleep het scherm · knijp om te zoomen',
    allCanvas: 'Alles op één scherm',
    available: 'Uitnodiging mogelijk',
    removed: 'Groep verwijderd',
  },
  de: {
    hintView: 'Person gedrückt halten zum Bearbeiten · Ansicht ziehen · mit zwei Fingern zoomen',
    allCanvas: 'Alles in einer Ansicht',
    available: 'Einladung möglich',
    removed: 'Gruppe entfernt',
  },
  fr: {
    hintView: 'Maintenez une personne pour modifier · faites glisser l’écran · pincez pour zoomer',
    allCanvas: 'Tout sur un seul écran',
    available: 'Invitation possible',
    removed: 'Groupe supprimé',
  },
  ar: {
    hintView: 'اضغط مطولًا على الشخص للتعديل · اسحب الشاشة · استخدم إصبعين للتكبير والتصغير',
    allCanvas: 'الكل في شاشة واحدة',
    available: 'متاح للدعوة',
    removed: 'تم حذف المجموعة',
  },
  bn: {
    hintView: 'সম্পাদনা করতে ব্যক্তিকে চেপে ধরুন · স্ক্রিন টানুন · জুম করতে পিঞ্চ করুন',
    allCanvas: 'সবকিছু এক স্ক্রিনে',
    available: 'আমন্ত্রণ করা যাবে',
    removed: 'গ্রুপ মুছে ফেলা হয়েছে',
  },
  pt: {
    hintView: 'Segure uma pessoa para editar · arraste a tela · use pinça para ampliar',
    allCanvas: 'Tudo em uma só tela',
    available: 'Convite disponível',
    removed: 'Grupo removido',
  },
  ru: {
    hintView: 'Удерживайте человека для редактирования · перетаскивайте экран · масштабируйте щипком',
    allCanvas: 'Всё на одном экране',
    available: 'Можно пригласить',
    removed: 'Группа удалена',
  },
  id: {
    hintView: 'Tahan orang untuk mengedit · seret layar · cubit untuk memperbesar',
    allCanvas: 'Semua di satu layar',
    available: 'Bisa diundang',
    removed: 'Grup dihapus',
  },
  vi: {
    hintView: 'Giữ một người để chỉnh sửa · kéo màn hình · chụm để thu phóng',
    allCanvas: 'Tất cả trên một màn hình',
    available: 'Có thể mời',
    removed: 'Đã xóa nhóm',
  },
  'zh-tw': {
    hintView: '長按人物編輯 · 拖動畫面 · 雙指縮放',
    allCanvas: '全部顯示在同一畫面',
    available: '可邀請',
    removed: '群組已刪除',
  },
  sv: {
    hintView: 'Håll en person för att redigera · dra skärmen · nyp för att zooma',
    allCanvas: 'Allt på en skärm',
    available: 'Kan bjudas in',
    removed: 'Grupp borttagen',
  },
  ro: {
    hintView: 'Ține apăsată o persoană pentru editare · trage ecranul · apropie sau depărtează cu două degete',
    allCanvas: 'Totul pe un singur ecran',
    available: 'Poate fi invitat',
    removed: 'Grup eliminat',
  },
  ur: {
    hintView: 'ترمیم کے لیے شخص کو دبائے رکھیں · اسکرین گھسیٹیں · زوم کے لیے پِنچ کریں',
    allCanvas: 'سب ایک اسکرین پر',
    available: 'دعوت دی جا سکتی ہے',
    removed: 'گروپ حذف کر دیا گیا',
  },
  pcm: {
    hintView: 'Hold person to edit · drag screen · pinch to zoom',
    allCanvas: 'Everything for one screen',
    available: 'You fit invite person',
    removed: 'Group don delete',
  },
  arz: {
    hintView: 'دوس مطول على الشخص للتعديل · اسحب الشاشة · قرّب بإصبعين',
    allCanvas: 'الكل في شاشة واحدة',
    available: 'ينفع تعزم حد',
    removed: 'المجموعة اتمسحت',
  },
  mr: {
    hintView: 'संपादनासाठी व्यक्तीला धरून ठेवा · स्क्रीन ओढा · पिंच करून झूम करा',
    allCanvas: 'सगळे एका स्क्रीनवर',
    available: 'आमंत्रित करता येईल',
    removed: 'गट हटवला',
  },
  te: {
    hintView: 'సవరించడానికి వ్యక్తిని నొక్కి పట్టుకోండి · స్క్రీన్‌ను లాగండి · జూమ్ చేయడానికి పించ్ చేయండి',
    allCanvas: 'అన్నీ ఒకే స్క్రీన్‌లో',
    available: 'ఆహ్వానించవచ్చు',
    removed: 'గ్రూపు తొలగించబడింది',
  },
  sw: {
    hintView: 'Shikilia mtu kuhariri · buruta skrini · bana vidole kukuza',
    allCanvas: 'Yote kwenye skrini moja',
    available: 'Anaweza kualikwa',
    removed: 'Kikundi kimeondolewa',
  },
  ha: {
    hintView: 'Riƙe mutum don gyara · ja allo · matse yatsu don zuƙowa',
    allCanvas: 'Duka a allo ɗaya',
    available: 'Za a iya gayyata',
    removed: 'An cire rukuni',
  },
  el: {
    hintView: 'Κράτησε πατημένο ένα άτομο για επεξεργασία · σύρε την οθόνη · τσίμπησε για ζουμ',
    allCanvas: 'Όλα σε μία οθόνη',
    available: 'Μπορεί να προσκληθεί',
    removed: 'Η ομάδα διαγράφηκε',
  },
  cs: { hintView:'Podrž člověka pro úpravy · táhni obrazovku · sevřením prstů měň přiblížení', allCanvas:'Vše na jedné obrazovce', available:'Lze pozvat', removed:'Skupina odstraněna' },
};

for (const [locale, patch] of Object.entries(NETWORK_USER_FACING_CANARY_POLISH) as Array<
  [SupportedLocale, NetworkUserFacingCanaryPolish]
>) {
  Object.assign(NETWORK_CANARY_UI_COPY[locale], patch);
}

Object.assign(NETWORK_EXPERIENCE_COPY.ko, {
  noSearchResults: '내 네트워크에 일치하는 지갑이 없어요.',
  noMatching: '조건에 맞는 직접 초대 분기가 없어요.',
});

Object.assign(NETWORK_EXPLORE_COPY.ko, {
  noPublicNetworks: '아직 둘러볼 수 있는 공개 네트워크가 없어요.',
  maintenance: '네트워크를 잠시 사용할 수 없어요.',
});
