import type { SupportedLocale } from './locales';

export type NetworkCanvasControlCopy = {
  you: string;
  branch: string;
  networkBelow: string;
  expandBranch: string;
  collapseBranch: string;
  close: string;
  centerNetwork: string;
  zoomIn: string;
  zoomOut: string;
  previous: string;
  next: string;
};

export const NETWORK_CANVAS_CONTROL_COPY = {
  en: { you: 'YOU', branch: 'Branch', networkBelow: 'Network below', expandBranch: 'Expand branch', collapseBranch: 'Collapse branch', close: 'Close', centerNetwork: 'Center network', zoomIn: 'Zoom in', zoomOut: 'Zoom out', previous: 'Previous', next: 'Next' },
  ko: { you: '나', branch: '브랜치', networkBelow: '하위 네트워크', expandBranch: '브랜치 펼치기', collapseBranch: '브랜치 접기', close: '닫기', centerNetwork: '네트워크 가운데로', zoomIn: '확대', zoomOut: '축소', previous: '이전', next: '다음' },
  zh: { you: '你', branch: '分支', networkBelow: '下级网络', expandBranch: '展开分支', collapseBranch: '收起分支', close: '关闭', centerNetwork: '居中网络', zoomIn: '放大', zoomOut: '缩小', previous: '上一页', next: '下一页' },
  hi: { you: 'आप', branch: 'शाखा', networkBelow: 'नीचे का नेटवर्क', expandBranch: 'शाखा खोलें', collapseBranch: 'शाखा समेटें', close: 'बंद करें', centerNetwork: 'नेटवर्क केंद्रित करें', zoomIn: 'ज़ूम इन', zoomOut: 'ज़ूम आउट', previous: 'पिछला', next: 'अगला' },
  es: { you: 'TÚ', branch: 'Rama', networkBelow: 'Red inferior', expandBranch: 'Expandir rama', collapseBranch: 'Contraer rama', close: 'Cerrar', centerNetwork: 'Centrar red', zoomIn: 'Acercar', zoomOut: 'Alejar', previous: 'Anterior', next: 'Siguiente' },
  ja: { you: '自分', branch: 'ブランチ', networkBelow: '下位ネットワーク', expandBranch: 'ブランチを開く', collapseBranch: 'ブランチを閉じる', close: '閉じる', centerNetwork: 'ネットワークを中央へ', zoomIn: '拡大', zoomOut: '縮小', previous: '前へ', next: '次へ' },
  it: { you: 'TU', branch: 'Ramo', networkBelow: 'Rete sottostante', expandBranch: 'Espandi ramo', collapseBranch: 'Comprimi ramo', close: 'Chiudi', centerNetwork: 'Centra rete', zoomIn: 'Ingrandisci', zoomOut: 'Riduci', previous: 'Precedente', next: 'Successivo' },
  tr: { you: 'SEN', branch: 'Dal', networkBelow: 'Alt ağ', expandBranch: 'Dalı genişlet', collapseBranch: 'Dalı daralt', close: 'Kapat', centerNetwork: 'Ağı ortala', zoomIn: 'Yakınlaştır', zoomOut: 'Uzaklaştır', previous: 'Önceki', next: 'Sonraki' },
  nl: { you: 'JIJ', branch: 'Tak', networkBelow: 'Netwerk eronder', expandBranch: 'Tak uitklappen', collapseBranch: 'Tak inklappen', close: 'Sluiten', centerNetwork: 'Netwerk centreren', zoomIn: 'Inzoomen', zoomOut: 'Uitzoomen', previous: 'Vorige', next: 'Volgende' },
  de: { you: 'DU', branch: 'Zweig', networkBelow: 'Netzwerk darunter', expandBranch: 'Zweig öffnen', collapseBranch: 'Zweig schließen', close: 'Schließen', centerNetwork: 'Netzwerk zentrieren', zoomIn: 'Vergrößern', zoomOut: 'Verkleinern', previous: 'Zurück', next: 'Weiter' },
  fr: { you: 'VOUS', branch: 'Branche', networkBelow: 'Réseau en dessous', expandBranch: 'Développer la branche', collapseBranch: 'Réduire la branche', close: 'Fermer', centerNetwork: 'Centrer le réseau', zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière', previous: 'Précédent', next: 'Suivant' },
  ar: { you: 'أنت', branch: 'الفرع', networkBelow: 'الشبكة أدناه', expandBranch: 'توسيع الفرع', collapseBranch: 'طي الفرع', close: 'إغلاق', centerNetwork: 'توسيط الشبكة', zoomIn: 'تكبير', zoomOut: 'تصغير', previous: 'السابق', next: 'التالي' },
  bn: { you: 'আপনি', branch: 'শাখা', networkBelow: 'নিচের নেটওয়ার্ক', expandBranch: 'শাখা খুলুন', collapseBranch: 'শাখা গুটান', close: 'বন্ধ করুন', centerNetwork: 'নেটওয়ার্ক কেন্দ্রে আনুন', zoomIn: 'জুম ইন', zoomOut: 'জুম আউট', previous: 'আগের', next: 'পরের' },
  pt: { you: 'VOCÊ', branch: 'Ramo', networkBelow: 'Rede abaixo', expandBranch: 'Expandir ramo', collapseBranch: 'Recolher ramo', close: 'Fechar', centerNetwork: 'Centralizar rede', zoomIn: 'Aumentar zoom', zoomOut: 'Diminuir zoom', previous: 'Anterior', next: 'Próximo' },
  ru: { you: 'ВЫ', branch: 'Ветка', networkBelow: 'Сеть ниже', expandBranch: 'Развернуть ветку', collapseBranch: 'Свернуть ветку', close: 'Закрыть', centerNetwork: 'Центрировать сеть', zoomIn: 'Приблизить', zoomOut: 'Отдалить', previous: 'Назад', next: 'Далее' },
  id: { you: 'ANDA', branch: 'Cabang', networkBelow: 'Jaringan di bawah', expandBranch: 'Buka cabang', collapseBranch: 'Tutup cabang', close: 'Tutup', centerNetwork: 'Pusatkan jaringan', zoomIn: 'Perbesar', zoomOut: 'Perkecil', previous: 'Sebelumnya', next: 'Berikutnya' },
  vi: { you: 'BẠN', branch: 'Nhánh', networkBelow: 'Mạng phía dưới', expandBranch: 'Mở nhánh', collapseBranch: 'Thu gọn nhánh', close: 'Đóng', centerNetwork: 'Đưa mạng về giữa', zoomIn: 'Phóng to', zoomOut: 'Thu nhỏ', previous: 'Trước', next: 'Sau' },
  'zh-tw': { you: '你', branch: '分支', networkBelow: '下層網路', expandBranch: '展開分支', collapseBranch: '收合分支', close: '關閉', centerNetwork: '置中網路', zoomIn: '放大', zoomOut: '縮小', previous: '上一頁', next: '下一頁' },
  sv: { you: 'DU', branch: 'Gren', networkBelow: 'Nätverk nedanför', expandBranch: 'Expandera gren', collapseBranch: 'Fäll ihop gren', close: 'Stäng', centerNetwork: 'Centrera nätverk', zoomIn: 'Zooma in', zoomOut: 'Zooma ut', previous: 'Föregående', next: 'Nästa' },
  ro: { you: 'TU', branch: 'Ramură', networkBelow: 'Rețeaua de dedesubt', expandBranch: 'Extinde ramura', collapseBranch: 'Restrânge ramura', close: 'Închide', centerNetwork: 'Centrează rețeaua', zoomIn: 'Mărește', zoomOut: 'Micșorează', previous: 'Anterior', next: 'Următor' },
  ur: { you: 'آپ', branch: 'شاخ', networkBelow: 'نیچے کا نیٹ ورک', expandBranch: 'شاخ کھولیں', collapseBranch: 'شاخ سمیٹیں', close: 'بند کریں', centerNetwork: 'نیٹ ورک درمیان میں لائیں', zoomIn: 'زوم اِن', zoomOut: 'زوم آؤٹ', previous: 'پچھلا', next: 'اگلا' },
  pcm: { you: 'YOU', branch: 'Branch', networkBelow: 'Network wey dey under', expandBranch: 'Open branch', collapseBranch: 'Close branch', close: 'Close', centerNetwork: 'Put network for center', zoomIn: 'Zoom in', zoomOut: 'Zoom out', previous: 'Previous', next: 'Next' },
  arz: { you: 'إنت', branch: 'فرع', networkBelow: 'الشبكة اللي تحت', expandBranch: 'افتح الفرع', collapseBranch: 'اقفل الفرع', close: 'اقفل', centerNetwork: 'وسّط الشبكة', zoomIn: 'كبّر', zoomOut: 'صغّر', previous: 'اللي قبلها', next: 'اللي بعدها' },
  mr: { you: 'तुम्ही', branch: 'शाखा', networkBelow: 'खालील नेटवर्क', expandBranch: 'शाखा उघडा', collapseBranch: 'शाखा मिटवा', close: 'बंद करा', centerNetwork: 'नेटवर्क मध्यभागी आणा', zoomIn: 'झूम इन', zoomOut: 'झूम आउट', previous: 'मागील', next: 'पुढील' },
  te: { you: 'మీరు', branch: 'శాఖ', networkBelow: 'దిగువ నెట్‌వర్క్', expandBranch: 'శాఖను విస్తరించండి', collapseBranch: 'శాఖను ముడుచండి', close: 'మూసివేయండి', centerNetwork: 'నెట్‌వర్క్‌ను మధ్యకు తేవండి', zoomIn: 'జూమ్ ఇన్', zoomOut: 'జూమ్ అవుట్', previous: 'మునుపటి', next: 'తదుపరి' },
  sw: { you: 'WEWE', branch: 'Tawi', networkBelow: 'Mtandao wa chini', expandBranch: 'Panua tawi', collapseBranch: 'Kunja tawi', close: 'Funga', centerNetwork: 'Weka mtandao katikati', zoomIn: 'Kuza', zoomOut: 'Punguza', previous: 'Iliyotangulia', next: 'Inayofuata' },
  ha: { you: 'KAI', branch: 'Reshe', networkBelow: 'Cibiyar ƙasa', expandBranch: 'Buɗe reshe', collapseBranch: 'Naɗe reshe', close: 'Rufe', centerNetwork: 'Tsakaita cibiya', zoomIn: 'Kara girma', zoomOut: 'Rage girma', previous: 'Na baya', next: 'Na gaba' },
  el: { you: 'ΕΣΥ', branch: 'Κλάδος', networkBelow: 'Δίκτυο από κάτω', expandBranch: 'Ανάπτυξη κλάδου', collapseBranch: 'Σύμπτυξη κλάδου', close: 'Κλείσιμο', centerNetwork: 'Κεντράρισμα δικτύου', zoomIn: 'Μεγέθυνση', zoomOut: 'Σμίκρυνση', previous: 'Προηγούμενο', next: 'Επόμενο' },
} satisfies Record<SupportedLocale, NetworkCanvasControlCopy>;
