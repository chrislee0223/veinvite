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
const NETWORK_NATURALNESS_PATCHES: Record<SupportedLocale, NetworkNaturalnessPatch> = {
  en: {
    canary: {
      savedCount: '{count} people in this group',
      zeroAllowed: 'This group can stay empty',
      dragUngroup: 'Drop here to remove from the group',
    },
  },
  ko: {
    canary: {
      savedCount: '이 그룹에 {count}명',
      dropPersonOrTap: '사람을 여기로 끌거나 눌러 그룹 만들기',
      releaseAdd: '놓으면 추가',
      optional: '사람을 선택하지 않아도 돼요',
      zeroAllowed: '빈 그룹으로 저장할 수 있어요',
      save: '변경사항 저장',
      removeFromGroup: '그룹에서 제거',
      dragUngroup: '그룹에서만 빼려면 여기에 놓기',
      hintEdit: '자유롭게 이동 · 배경을 눌러 편집 종료',
    },
    controls: {
      branch: '분기',
      expandBranch: '분기 펼치기',
      collapseBranch: '분기 접기',
      centerNetwork: '네트워크 중앙 맞춤',
    },
    experience: {
      directNetwork: '직접 초대 네트워크',
      recentGrowth: '최근 증가',
      emptyTitle: '내 네트워크는 여기서 시작돼요',
      invitedBy: '초대한 사람',
      noMatching: '일치하는 직접 초대 분기가 없어요.',
    },
    explore: {
      exploreDescription: '같은 네트워크 화면에서 공개된 VeInvite 네트워크를 둘러보세요. 비공개 분기는 표시되지 않아요.',
      publicEnabled: '공개 접근 허용',
      discoverable: '둘러보기에 표시',
      discoverableNote: '내 네트워크가 둘러보기 목록에 표시되게 합니다.',
      privateBranchesHidden: '비공개 분기는 숨겨져 있어요',
    },
    interaction: {
      confirmMoveError: '그룹 이동이 완료됐는지 확인하지 못했어요.',
    },
  },
  zh: {
    canary: {
      savedCount: '此分组有 {count} 人',
      zeroAllowed: '分组可以留空',
      dragUngroup: '拖到这里即可移出分组',
    },
  },
  hi: {
    canary: {
      savedCount: 'इस समूह में {count} लोग',
      zeroAllowed: 'समूह खाली भी रह सकता है',
      dragUngroup: 'समूह से हटाने के लिए यहाँ छोड़ें',
    },
    experience: {
      invitedBy: 'आमंत्रणकर्ता',
    },
  },
  es: {
    canary: {
      savedCount: '{count} personas en este grupo',
      zeroAllowed: 'El grupo puede quedar vacío',
      dragUngroup: 'Suelta aquí para quitar del grupo',
      hintView: 'Mantén un nodo para editar · arrastra el lienzo · pellizca para hacer zoom',
    },
  },
  ja: {
    canary: {
      savedCount: 'このグループに{count}人',
      zeroAllowed: '空のグループでも保存できます',
      dragUngroup: 'グループから外すならここにドロップ',
    },
  },
  it: {
    canary: {
      savedCount: '{count} persone in questo gruppo',
      zeroAllowed: 'Il gruppo può restare vuoto',
      dragUngroup: 'Rilascia qui per rimuovere dal gruppo',
      joining: 'Sta entrando nella rete',
      verifiedAdding: 'Verificato · aggiunta alla rete in corso',
    },
    explore: {
      maintenance: 'La rete è temporaneamente non disponibile.',
    },
  },
  tr: {
    canary: {
      savedCount: 'Bu grupta {count} kişi',
      zeroAllowed: 'Grup boş kalabilir',
      dragUngroup: 'Gruptan çıkarmak için buraya bırak',
      available: 'Davet edilebilir',
    },
    network: {
      title: 'Ağın çok yakında hazır',
    },
  },
  nl: {
    canary: {
      savedCount: '{count} personen in deze groep',
      zeroAllowed: 'De groep mag leeg blijven',
      dragUngroup: 'Laat hier los om uit de groep te halen',
    },
  },
  de: {
    canary: {
      savedCount: '{count} Personen in dieser Gruppe',
      zeroAllowed: 'Die Gruppe kann leer bleiben',
      dragUngroup: 'Hier loslassen, um aus der Gruppe zu entfernen',
      fit: 'Ansicht anpassen',
      hintView: 'Knoten halten zum Bearbeiten · Fläche ziehen · mit zwei Fingern zoomen',
    },
    explore: {
      viewing: 'Erkunden',
    },
  },
  fr: {
    canary: {
      savedCount: '{count} personnes dans ce groupe',
      zeroAllowed: 'Le groupe peut rester vide',
      dragUngroup: 'Relâchez ici pour retirer du groupe',
      joining: 'Rejoint le réseau',
    },
  },
  ar: {
    canary: {
      savedCount: '{count} أشخاص في هذه المجموعة',
      zeroAllowed: 'يمكن أن تبقى المجموعة فارغة',
      dragUngroup: 'أفلت هنا للإزالة من المجموعة',
      hintView: 'اضغط مطولًا على العقدة للتعديل · اسحب اللوحة · استخدم إصبعين للتكبير والتصغير',
    },
  },
  bn: {
    canary: {
      savedCount: 'এই গ্রুপে {count} জন',
      zeroAllowed: 'গ্রুপ খালি রাখা যায়',
      dragUngroup: 'গ্রুপ থেকে সরাতে এখানে ছেড়ে দিন',
    },
  },
  pt: {
    canary: {
      savedCount: '{count} pessoas neste grupo',
      zeroAllowed: 'O grupo pode ficar vazio',
      dragUngroup: 'Solte aqui para remover do grupo',
      hintView: 'Segure um nó para editar · arraste a tela · faça pinça para dar zoom',
    },
  },
  ru: {
    canary: {
      savedCount: 'В этой группе: {count}',
      zeroAllowed: 'Группа может оставаться пустой',
      dragUngroup: 'Отпустите здесь, чтобы убрать из группы',
    },
  },
  id: {
    canary: {
      savedCount: '{count} orang di grup ini',
      zeroAllowed: 'Grup boleh tetap kosong',
      dragUngroup: 'Lepaskan di sini untuk mengeluarkan dari grup',
      hintView: 'Tahan node untuk mengedit · seret kanvas · cubit untuk memperbesar atau memperkecil',
    },
  },
  vi: {
    canary: {
      savedCount: 'Nhóm này có {count} người',
      zeroAllowed: 'Nhóm có thể để trống',
      dragUngroup: 'Thả vào đây để đưa ra khỏi nhóm',
      hintView: 'Giữ một nút mạng để chỉnh sửa · kéo màn hình · chụm để thu phóng',
    },
    network: {
      title: 'Mạng lưới của bạn sắp sẵn sàng',
    },
  },
  'zh-tw': {
    canary: {
      savedCount: '此群組有 {count} 人',
      zeroAllowed: '群組可以留空',
      dragUngroup: '拖到這裡即可移出群組',
      dragOrTap: '從網路拖入或點按選擇',
      verifiedAdding: '已驗證 · 正在加入此網路',
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
      savedCount: '{count} personer i den här gruppen',
      zeroAllowed: 'Gruppen kan vara tom',
      dragUngroup: 'Släpp här för att ta bort från gruppen',
      joining: 'Går med',
      newFriendJoining: 'En ny vän går med…',
    },
  },
  ro: {
    canary: {
      savedCount: '{count} persoane în acest grup',
      zeroAllowed: 'Grupul poate rămâne gol',
      dragUngroup: 'Eliberează aici pentru a scoate din grup',
    },
  },
  ur: {
    canary: {
      savedCount: 'اس گروپ میں {count} افراد',
      zeroAllowed: 'گروپ خالی بھی رہ سکتا ہے',
      dragUngroup: 'گروپ سے نکالنے کے لیے یہاں چھوڑیں',
    },
  },
  pcm: {
    canary: {
      savedCount: '{count} people dey this group',
      zeroAllowed: 'Group fit remain empty',
      dragUngroup: 'Drop am here to comot am from group',
      hintEdit: 'Drag am anywhere · tap background to finish',
    },
  },
  arz: {
    canary: {
      savedCount: 'في المجموعة دي {count} أشخاص',
      zeroAllowed: 'المجموعة ينفع تفضل فاضية',
      dragUngroup: 'سيبه هنا عشان تشيله من المجموعة',
    },
  },
  mr: {
    canary: {
      savedCount: 'या गटात {count} जण',
      zeroAllowed: 'गट रिकामा ठेवू शकता',
      dragUngroup: 'गटातून काढण्यासाठी इथे सोडा',
      collapsed: 'आकुंचित',
      expanded: 'विस्तारित',
    },
    controls: {
      collapseBranch: 'शाखा दुमडा',
    },
  },
  te: {
    canary: {
      savedCount: 'ఈ గ్రూపులో {count} మంది',
      zeroAllowed: 'గ్రూపును ఖాళీగా ఉంచవచ్చు',
      dragUngroup: 'గ్రూపు నుంచి తీసివేయడానికి ఇక్కడ వదలండి',
    },
  },
  sw: {
    canary: {
      savedCount: 'Watu {count} katika kikundi hiki',
      zeroAllowed: 'Kikundi kinaweza kubaki tupu',
      dragUngroup: 'Achia hapa ili kuondoa kwenye kikundi',
    },
  },
  ha: {
    canary: {
      savedCount: 'Mutane {count} a wannan rukuni',
      zeroAllowed: 'Rukuni na iya zama babu kowa',
      dragUngroup: 'Saki a nan don cirewa daga rukuni',
    },
  },
  el: {
    canary: {
      savedCount: '{count} άτομα σε αυτή την ομάδα',
      zeroAllowed: 'Η ομάδα μπορεί να μείνει κενή',
      dragUngroup: 'Άφησε εδώ για αφαίρεση από την ομάδα',
      joining: 'Μπαίνει στο δίκτυο',
      newFriendJoining: 'Ένας νέος φίλος μπαίνει στο δίκτυο…',
    },
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
