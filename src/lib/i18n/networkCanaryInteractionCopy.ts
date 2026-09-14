import { isLocale, type SupportedLocale } from './locales';

type NetworkCanaryInteractionCopy = {
  alreadyIn: string;
  releaseMove: string;
  releaseAdd: string;
  moved: string;
  added: string;
  saveError: string;
  confirmMoveError: string;
};

export const NETWORK_CANARY_INTERACTION_COPY: Record<
  SupportedLocale,
  NetworkCanaryInteractionCopy
> = {
  en: {
    alreadyIn: 'Already in {group}',
    releaseMove: 'Release to move to {group}',
    releaseAdd: 'Release to add to {group}',
    moved: '✓ Moved',
    added: '✓ Added',
    saveError: 'Couldn’t save this position.',
    confirmMoveError: 'Couldn’t confirm the group move.',
  },
  ko: {
    alreadyIn: '이미 {group} 그룹에 있어요',
    releaseMove: '{group} 그룹으로 이동하려면 놓으세요',
    releaseAdd: '{group} 그룹에 추가하려면 놓으세요',
    moved: '✓ 이동 완료',
    added: '✓ 추가 완료',
    saveError: '이 위치를 저장하지 못했어요.',
    confirmMoveError: '그룹 이동을 확인하지 못했어요.',
  },
  zh: {
    alreadyIn: '已在 {group} 中',
    releaseMove: '松手移动到 {group}',
    releaseAdd: '松手添加到 {group}',
    moved: '✓ 已移动',
    added: '✓ 已添加',
    saveError: '无法保存此位置。',
    confirmMoveError: '无法确认分组移动。',
  },
  hi: {
    alreadyIn: 'पहले से {group} में है',
    releaseMove: '{group} में ले जाने के लिए छोड़ें',
    releaseAdd: '{group} में जोड़ने के लिए छोड़ें',
    moved: '✓ स्थानांतरित',
    added: '✓ जोड़ा गया',
    saveError: 'यह स्थान सहेजा नहीं जा सका।',
    confirmMoveError: 'समूह में स्थानांतरण की पुष्टि नहीं हो सकी।',
  },
  es: {
    alreadyIn: 'Ya está en {group}',
    releaseMove: 'Suelta para mover a {group}',
    releaseAdd: 'Suelta para añadir a {group}',
    moved: '✓ Movido',
    added: '✓ Añadido',
    saveError: 'No se pudo guardar esta posición.',
    confirmMoveError: 'No se pudo confirmar el cambio de grupo.',
  },
  ja: {
    alreadyIn: 'すでに{group}に入っています',
    releaseMove: '{group}へ移動するには離してください',
    releaseAdd: '{group}に追加するには離してください',
    moved: '✓ 移動しました',
    added: '✓ 追加しました',
    saveError: 'この位置を保存できませんでした。',
    confirmMoveError: 'グループ移動を確認できませんでした。',
  },
  it: {
    alreadyIn: 'È già in {group}',
    releaseMove: 'Rilascia per spostare in {group}',
    releaseAdd: 'Rilascia per aggiungere a {group}',
    moved: '✓ Spostato',
    added: '✓ Aggiunto',
    saveError: 'Impossibile salvare questa posizione.',
    confirmMoveError: 'Impossibile confermare lo spostamento nel gruppo.',
  },
  tr: {
    alreadyIn: 'Zaten {group} grubunda',
    releaseMove: '{group} grubuna taşımak için bırak',
    releaseAdd: '{group} grubuna eklemek için bırak',
    moved: '✓ Taşındı',
    added: '✓ Eklendi',
    saveError: 'Bu konum kaydedilemedi.',
    confirmMoveError: 'Grup taşıma işlemi doğrulanamadı.',
  },
  nl: {
    alreadyIn: 'Staat al in {group}',
    releaseMove: 'Laat los om naar {group} te verplaatsen',
    releaseAdd: 'Laat los om aan {group} toe te voegen',
    moved: '✓ Verplaatst',
    added: '✓ Toegevoegd',
    saveError: 'Deze positie kon niet worden opgeslagen.',
    confirmMoveError: 'De verplaatsing naar de groep kon niet worden bevestigd.',
  },
  de: {
    alreadyIn: 'Bereits in {group}',
    releaseMove: 'Loslassen, um nach {group} zu verschieben',
    releaseAdd: 'Loslassen, um zu {group} hinzuzufügen',
    moved: '✓ Verschoben',
    added: '✓ Hinzugefügt',
    saveError: 'Diese Position konnte nicht gespeichert werden.',
    confirmMoveError: 'Die Gruppenverschiebung konnte nicht bestätigt werden.',
  },
  fr: {
    alreadyIn: 'Déjà dans {group}',
    releaseMove: 'Relâchez pour déplacer vers {group}',
    releaseAdd: 'Relâchez pour ajouter à {group}',
    moved: '✓ Déplacé',
    added: '✓ Ajouté',
    saveError: 'Impossible d’enregistrer cette position.',
    confirmMoveError: 'Impossible de confirmer le changement de groupe.',
  },
  ar: {
    alreadyIn: 'موجود بالفعل في {group}',
    releaseMove: 'أفلِت للنقل إلى {group}',
    releaseAdd: 'أفلِت للإضافة إلى {group}',
    moved: '✓ تم النقل',
    added: '✓ تمت الإضافة',
    saveError: 'تعذر حفظ هذا الموضع.',
    confirmMoveError: 'تعذر تأكيد النقل إلى المجموعة.',
  },
  bn: {
    alreadyIn: 'ইতিমধ্যে {group}-এ আছে',
    releaseMove: '{group}-এ নিতে ছেড়ে দিন',
    releaseAdd: '{group}-এ যোগ করতে ছেড়ে দিন',
    moved: '✓ সরানো হয়েছে',
    added: '✓ যোগ হয়েছে',
    saveError: 'এই অবস্থানটি সংরক্ষণ করা যায়নি।',
    confirmMoveError: 'গ্রুপ পরিবর্তন নিশ্চিত করা যায়নি।',
  },
  pt: {
    alreadyIn: 'Já está em {group}',
    releaseMove: 'Solte para mover para {group}',
    releaseAdd: 'Solte para adicionar a {group}',
    moved: '✓ Movido',
    added: '✓ Adicionado',
    saveError: 'Não foi possível salvar esta posição.',
    confirmMoveError: 'Não foi possível confirmar a mudança de grupo.',
  },
  ru: {
    alreadyIn: 'Уже в группе {group}',
    releaseMove: 'Отпустите, чтобы переместить в {group}',
    releaseAdd: 'Отпустите, чтобы добавить в {group}',
    moved: '✓ Перемещено',
    added: '✓ Добавлено',
    saveError: 'Не удалось сохранить эту позицию.',
    confirmMoveError: 'Не удалось подтвердить перемещение в группу.',
  },
  id: {
    alreadyIn: 'Sudah ada di {group}',
    releaseMove: 'Lepaskan untuk memindahkan ke {group}',
    releaseAdd: 'Lepaskan untuk menambahkan ke {group}',
    moved: '✓ Dipindahkan',
    added: '✓ Ditambahkan',
    saveError: 'Posisi ini tidak dapat disimpan.',
    confirmMoveError: 'Perpindahan grup tidak dapat dikonfirmasi.',
  },
  vi: {
    alreadyIn: 'Đã ở trong {group}',
    releaseMove: 'Thả để chuyển sang {group}',
    releaseAdd: 'Thả để thêm vào {group}',
    moved: '✓ Đã chuyển',
    added: '✓ Đã thêm',
    saveError: 'Không thể lưu vị trí này.',
    confirmMoveError: 'Không thể xác nhận việc chuyển nhóm.',
  },
  'zh-tw': {
    alreadyIn: '已在 {group} 中',
    releaseMove: '放開以移動到 {group}',
    releaseAdd: '放開以加入 {group}',
    moved: '✓ 已移動',
    added: '✓ 已加入',
    saveError: '無法儲存此位置。',
    confirmMoveError: '無法確認群組移動。',
  },
  sv: {
    alreadyIn: 'Finns redan i {group}',
    releaseMove: 'Släpp för att flytta till {group}',
    releaseAdd: 'Släpp för att lägga till i {group}',
    moved: '✓ Flyttad',
    added: '✓ Tillagd',
    saveError: 'Det gick inte att spara den här positionen.',
    confirmMoveError: 'Det gick inte att bekräfta gruppflytten.',
  },
  ro: {
    alreadyIn: 'Este deja în {group}',
    releaseMove: 'Eliberează pentru a muta în {group}',
    releaseAdd: 'Eliberează pentru a adăuga în {group}',
    moved: '✓ Mutat',
    added: '✓ Adăugat',
    saveError: 'Această poziție nu a putut fi salvată.',
    confirmMoveError: 'Mutarea în grup nu a putut fi confirmată.',
  },
  ur: {
    alreadyIn: 'پہلے ہی {group} میں ہے',
    releaseMove: '{group} میں منتقل کرنے کے لیے چھوڑ دیں',
    releaseAdd: '{group} میں شامل کرنے کے لیے چھوڑ دیں',
    moved: '✓ منتقل ہو گیا',
    added: '✓ شامل ہو گیا',
    saveError: 'یہ جگہ محفوظ نہیں ہو سکی۔',
    confirmMoveError: 'گروپ میں منتقلی کی تصدیق نہیں ہو سکی۔',
  },
  pcm: {
    alreadyIn: 'E don dey inside {group}',
    releaseMove: 'Leave am to move am go {group}',
    releaseAdd: 'Leave am to add am join {group}',
    moved: '✓ E don move',
    added: '✓ E don join',
    saveError: 'We no fit save this position.',
    confirmMoveError: 'We no fit confirm the group move.',
  },
  arz: {
    alreadyIn: 'موجود بالفعل في {group}',
    releaseMove: 'سيبه عشان تنقله لـ {group}',
    releaseAdd: 'سيبه عشان تضيفه لـ {group}',
    moved: '✓ اتنقل',
    added: '✓ اتضاف',
    saveError: 'ماقدرناش نحفظ المكان ده.',
    confirmMoveError: 'ماقدرناش نأكد النقل للمجموعة.',
  },
  mr: {
    alreadyIn: 'आधीच {group} मध्ये आहे',
    releaseMove: '{group} मध्ये हलवण्यासाठी सोडा',
    releaseAdd: '{group} मध्ये जोडण्यासाठी सोडा',
    moved: '✓ हलवले',
    added: '✓ जोडले',
    saveError: 'ही जागा जतन करता आली नाही.',
    confirmMoveError: 'गटातील बदलाची पुष्टी करता आली नाही.',
  },
  te: {
    alreadyIn: 'ఇప్పటికే {group} లో ఉంది',
    releaseMove: '{group} లోకి తరలించడానికి వదలండి',
    releaseAdd: '{group} లోకి జోడించడానికి వదలండి',
    moved: '✓ తరలించబడింది',
    added: '✓ జోడించబడింది',
    saveError: 'ఈ స్థానాన్ని సేవ్ చేయలేకపోయాం.',
    confirmMoveError: 'గ్రూప్ మార్పును నిర్ధారించలేకపోయాం.',
  },
  sw: {
    alreadyIn: 'Tayari yuko kwenye {group}',
    releaseMove: 'Achia ili uhamishe kwenda {group}',
    releaseAdd: 'Achia ili uongeze kwenye {group}',
    moved: '✓ Imehamishwa',
    added: '✓ Imeongezwa',
    saveError: 'Nafasi hii haikuweza kuhifadhiwa.',
    confirmMoveError: 'Uhamisho wa kikundi haukuweza kuthibitishwa.',
  },
  ha: {
    alreadyIn: 'Ya riga yana cikin {group}',
    releaseMove: 'Saki don matsarwa zuwa {group}',
    releaseAdd: 'Saki don ƙarawa zuwa {group}',
    moved: '✓ An matsar',
    added: '✓ An ƙara',
    saveError: 'Ba a iya ajiye wannan matsayi ba.',
    confirmMoveError: 'Ba a iya tabbatar da matsarwar rukuni ba.',
  },
  el: {
    alreadyIn: 'Βρίσκεται ήδη στην ομάδα {group}',
    releaseMove: 'Αφήστε για μετακίνηση στην ομάδα {group}',
    releaseAdd: 'Αφήστε για προσθήκη στην ομάδα {group}',
    moved: '✓ Μετακινήθηκε',
    added: '✓ Προστέθηκε',
    saveError: 'Δεν ήταν δυνατή η αποθήκευση αυτής της θέσης.',
    confirmMoveError: 'Δεν ήταν δυνατή η επιβεβαίωση της αλλαγής ομάδας.',
  },
};

const isolate = (value: string) => `\u2068${value}\u2069`;

function withGroup(template: string, groupName: string): string {
  return template.replace('{group}', isolate(groupName));
}

export function getNetworkCanaryInteractionCopy(locale: string) {
  const resolved = isLocale(locale) ? locale : 'en';
  const copy = NETWORK_CANARY_INTERACTION_COPY[resolved];

  return {
    alreadyIn: (groupName: string) => withGroup(copy.alreadyIn, groupName),
    releaseMove: (groupName: string) => withGroup(copy.releaseMove, groupName),
    releaseAdd: (groupName: string) => withGroup(copy.releaseAdd, groupName),
    moved: copy.moved,
    added: copy.added,
    saveError: copy.saveError,
    confirmMoveError: copy.confirmMoveError,
  };
}
