import type { SupportedLocale } from './locales';

export type NetworkWorkspaceCopy = {
  editLayout: string;
  save: string;
  cancel: string;
  newGroup: string;
  group: string;
  groupName: string;
  dropHere: string;
  members: string;
  createGroup: string;
  ungroup: string;
  layoutSaved: string;
  needTwo: string;
};

export const NETWORK_WORKSPACE_COPY: Record<SupportedLocale, NetworkWorkspaceCopy> = {
  en: { editLayout: 'Edit layout', save: 'Save', cancel: 'Cancel', newGroup: 'New group', group: 'Group', groupName: 'Group name', dropHere: 'Drag members here', members: 'members', createGroup: 'Create group', ungroup: 'Ungroup', layoutSaved: 'Layout saved', needTwo: 'Add at least 2 members' },
  ko: { editLayout: '배치 편집', save: '저장', cancel: '취소', newGroup: '새 그룹', group: '그룹', groupName: '그룹 이름', dropHere: '멤버를 여기로 드래그', members: '명', createGroup: '그룹 만들기', ungroup: '그룹 해제', layoutSaved: '배치가 저장됐어요', needTwo: '멤버를 2명 이상 추가하세요' },
  zh: { editLayout: '编辑布局', save: '保存', cancel: '取消', newGroup: '新建分组', group: '分组', groupName: '分组名称', dropHere: '将成员拖到这里', members: '名成员', createGroup: '创建分组', ungroup: '取消分组', layoutSaved: '布局已保存', needTwo: '请至少添加 2 名成员' },
  hi: { editLayout: 'लेआउट संपादित करें', save: 'सहेजें', cancel: 'रद्द करें', newGroup: 'नया समूह', group: 'समूह', groupName: 'समूह का नाम', dropHere: 'सदस्यों को यहाँ खींचें', members: 'सदस्य', createGroup: 'समूह बनाएँ', ungroup: 'समूह हटाएँ', layoutSaved: 'लेआउट सहेजा गया', needTwo: 'कम से कम 2 सदस्य जोड़ें' },
  es: { editLayout: 'Editar diseño', save: 'Guardar', cancel: 'Cancelar', newGroup: 'Nuevo grupo', group: 'Grupo', groupName: 'Nombre del grupo', dropHere: 'Arrastra miembros aquí', members: 'miembros', createGroup: 'Crear grupo', ungroup: 'Desagrupar', layoutSaved: 'Diseño guardado', needTwo: 'Añade al menos 2 miembros' },
  ja: { editLayout: '配置を編集', save: '保存', cancel: 'キャンセル', newGroup: '新しいグループ', group: 'グループ', groupName: 'グループ名', dropHere: 'メンバーをここにドラッグ', members: '人', createGroup: 'グループを作成', ungroup: 'グループ解除', layoutSaved: '配置を保存しました', needTwo: '2人以上追加してください' },
  it: { editLayout: 'Modifica layout', save: 'Salva', cancel: 'Annulla', newGroup: 'Nuovo gruppo', group: 'Gruppo', groupName: 'Nome gruppo', dropHere: 'Trascina qui i membri', members: 'membri', createGroup: 'Crea gruppo', ungroup: 'Separa gruppo', layoutSaved: 'Layout salvato', needTwo: 'Aggiungi almeno 2 membri' },
  tr: { editLayout: 'Düzeni düzenle', save: 'Kaydet', cancel: 'İptal', newGroup: 'Yeni grup', group: 'Grup', groupName: 'Grup adı', dropHere: 'Üyeleri buraya sürükle', members: 'üye', createGroup: 'Grup oluştur', ungroup: 'Grubu çöz', layoutSaved: 'Düzen kaydedildi', needTwo: 'En az 2 üye ekleyin' },
  nl: { editLayout: 'Indeling bewerken', save: 'Opslaan', cancel: 'Annuleren', newGroup: 'Nieuwe groep', group: 'Groep', groupName: 'Groepsnaam', dropHere: 'Sleep leden hierheen', members: 'leden', createGroup: 'Groep maken', ungroup: 'Groep opheffen', layoutSaved: 'Indeling opgeslagen', needTwo: 'Voeg minimaal 2 leden toe' },
  de: { editLayout: 'Layout bearbeiten', save: 'Speichern', cancel: 'Abbrechen', newGroup: 'Neue Gruppe', group: 'Gruppe', groupName: 'Gruppenname', dropHere: 'Mitglieder hierher ziehen', members: 'Mitglieder', createGroup: 'Gruppe erstellen', ungroup: 'Gruppierung aufheben', layoutSaved: 'Layout gespeichert', needTwo: 'Mindestens 2 Mitglieder hinzufügen' },
  fr: { editLayout: 'Modifier la disposition', save: 'Enregistrer', cancel: 'Annuler', newGroup: 'Nouveau groupe', group: 'Groupe', groupName: 'Nom du groupe', dropHere: 'Glissez les membres ici', members: 'membres', createGroup: 'Créer le groupe', ungroup: 'Dégrouper', layoutSaved: 'Disposition enregistrée', needTwo: 'Ajoutez au moins 2 membres' },
  ar: { editLayout: 'تعديل التخطيط', save: 'حفظ', cancel: 'إلغاء', newGroup: 'مجموعة جديدة', group: 'مجموعة', groupName: 'اسم المجموعة', dropHere: 'اسحب الأعضاء إلى هنا', members: 'أعضاء', createGroup: 'إنشاء مجموعة', ungroup: 'فك المجموعة', layoutSaved: 'تم حفظ التخطيط', needTwo: 'أضف عضوين على الأقل' },
  bn: { editLayout: 'লেআউট সম্পাদনা', save: 'সংরক্ষণ', cancel: 'বাতিল', newGroup: 'নতুন গ্রুপ', group: 'গ্রুপ', groupName: 'গ্রুপের নাম', dropHere: 'সদস্যদের এখানে টানুন', members: 'সদস্য', createGroup: 'গ্রুপ তৈরি করুন', ungroup: 'গ্রুপ খুলুন', layoutSaved: 'লেআউট সংরক্ষিত', needTwo: 'কমপক্ষে ২ জন সদস্য যোগ করুন' },
  pt: { editLayout: 'Editar layout', save: 'Salvar', cancel: 'Cancelar', newGroup: 'Novo grupo', group: 'Grupo', groupName: 'Nome do grupo', dropHere: 'Arraste membros aqui', members: 'membros', createGroup: 'Criar grupo', ungroup: 'Desagrupar', layoutSaved: 'Layout salvo', needTwo: 'Adicione pelo menos 2 membros' },
  ru: { editLayout: 'Изменить схему', save: 'Сохранить', cancel: 'Отмена', newGroup: 'Новая группа', group: 'Группа', groupName: 'Название группы', dropHere: 'Перетащите участников сюда', members: 'участников', createGroup: 'Создать группу', ungroup: 'Разгруппировать', layoutSaved: 'Схема сохранена', needTwo: 'Добавьте минимум 2 участников' },
  id: { editLayout: 'Edit tata letak', save: 'Simpan', cancel: 'Batal', newGroup: 'Grup baru', group: 'Grup', groupName: 'Nama grup', dropHere: 'Seret anggota ke sini', members: 'anggota', createGroup: 'Buat grup', ungroup: 'Lepas grup', layoutSaved: 'Tata letak tersimpan', needTwo: 'Tambahkan minimal 2 anggota' },
  vi: { editLayout: 'Chỉnh bố cục', save: 'Lưu', cancel: 'Hủy', newGroup: 'Nhóm mới', group: 'Nhóm', groupName: 'Tên nhóm', dropHere: 'Kéo thành viên vào đây', members: 'thành viên', createGroup: 'Tạo nhóm', ungroup: 'Bỏ nhóm', layoutSaved: 'Đã lưu bố cục', needTwo: 'Thêm ít nhất 2 thành viên' },
  'zh-tw': { editLayout: '編輯版面', save: '儲存', cancel: '取消', newGroup: '新增群組', group: '群組', groupName: '群組名稱', dropHere: '將成員拖到這裡', members: '名成員', createGroup: '建立群組', ungroup: '取消群組', layoutSaved: '版面已儲存', needTwo: '請至少加入 2 名成員' },
  sv: { editLayout: 'Redigera layout', save: 'Spara', cancel: 'Avbryt', newGroup: 'Ny grupp', group: 'Grupp', groupName: 'Gruppnamn', dropHere: 'Dra medlemmar hit', members: 'medlemmar', createGroup: 'Skapa grupp', ungroup: 'Lös upp grupp', layoutSaved: 'Layout sparad', needTwo: 'Lägg till minst 2 medlemmar' },
  ro: { editLayout: 'Editează aspectul', save: 'Salvează', cancel: 'Anulează', newGroup: 'Grup nou', group: 'Grup', groupName: 'Numele grupului', dropHere: 'Trage membrii aici', members: 'membri', createGroup: 'Creează grup', ungroup: 'Degrupează', layoutSaved: 'Aspect salvat', needTwo: 'Adaugă cel puțin 2 membri' },
  ur: { editLayout: 'لے آؤٹ میں ترمیم', save: 'محفوظ کریں', cancel: 'منسوخ', newGroup: 'نیا گروپ', group: 'گروپ', groupName: 'گروپ کا نام', dropHere: 'اراکین کو یہاں کھینچیں', members: 'اراکین', createGroup: 'گروپ بنائیں', ungroup: 'گروپ ختم کریں', layoutSaved: 'لے آؤٹ محفوظ ہوگیا', needTwo: 'کم از کم 2 اراکین شامل کریں' },
  pcm: { editLayout: 'Edit layout', save: 'Save', cancel: 'Cancel', newGroup: 'New group', group: 'Group', groupName: 'Group name', dropHere: 'Drag members come here', members: 'members', createGroup: 'Create group', ungroup: 'Scatter group', layoutSaved: 'Layout don save', needTwo: 'Add at least 2 members' },
  arz: { editLayout: 'عدّل الترتيب', save: 'احفظ', cancel: 'إلغاء', newGroup: 'جروب جديد', group: 'جروب', groupName: 'اسم الجروب', dropHere: 'اسحب الأعضاء هنا', members: 'أعضاء', createGroup: 'اعمل جروب', ungroup: 'فك الجروب', layoutSaved: 'الترتيب اتحفظ', needTwo: 'ضيف عضوين على الأقل' },
  mr: { editLayout: 'मांडणी संपादित करा', save: 'जतन करा', cancel: 'रद्द करा', newGroup: 'नवा गट', group: 'गट', groupName: 'गटाचे नाव', dropHere: 'सदस्यांना येथे ड्रॅग करा', members: 'सदस्य', createGroup: 'गट तयार करा', ungroup: 'गट काढा', layoutSaved: 'मांडणी जतन झाली', needTwo: 'किमान 2 सदस्य जोडा' },
  te: { editLayout: 'లేఅవుట్ మార్చండి', save: 'సేవ్', cancel: 'రద్దు', newGroup: 'కొత్త గ్రూప్', group: 'గ్రూప్', groupName: 'గ్రూప్ పేరు', dropHere: 'సభ్యులను ఇక్కడికి లాగండి', members: 'సభ్యులు', createGroup: 'గ్రూప్ సృష్టించండి', ungroup: 'గ్రూప్ తొలగించండి', layoutSaved: 'లేఅవుట్ సేవ్ అయింది', needTwo: 'కనీసం 2 సభ్యులను జోడించండి' },
  sw: { editLayout: 'Hariri mpangilio', save: 'Hifadhi', cancel: 'Ghairi', newGroup: 'Kundi jipya', group: 'Kundi', groupName: 'Jina la kundi', dropHere: 'Buruta wanachama hapa', members: 'wanachama', createGroup: 'Unda kundi', ungroup: 'Vunja kundi', layoutSaved: 'Mpangilio umehifadhiwa', needTwo: 'Ongeza angalau wanachama 2' },
  ha: { editLayout: 'Gyara tsari', save: 'Ajiye', cancel: 'Soke', newGroup: 'Sabon rukuni', group: 'Rukuni', groupName: 'Sunan rukuni', dropHere: 'Ja mambobi nan', members: 'mambobi', createGroup: 'Ƙirƙiri rukuni', ungroup: 'Warware rukuni', layoutSaved: 'An ajiye tsari', needTwo: 'Ƙara aƙalla mambobi 2' },
  el: { editLayout: 'Επεξεργασία διάταξης', save: 'Αποθήκευση', cancel: 'Ακύρωση', newGroup: 'Νέα ομάδα', group: 'Ομάδα', groupName: 'Όνομα ομάδας', dropHere: 'Σύρετε μέλη εδώ', members: 'μέλη', createGroup: 'Δημιουργία ομάδας', ungroup: 'Κατάργηση ομάδας', layoutSaved: 'Η διάταξη αποθηκεύτηκε', needTwo: 'Προσθέστε τουλάχιστον 2 μέλη' },
  cs: { editLayout: 'Upravit rozložení', save: 'Uložit', cancel: 'Zrušit', newGroup: 'Nová skupina', group: 'Skupina', groupName: 'Název skupiny', dropHere: 'Přetáhněte členy sem', members: 'členů', createGroup: 'Vytvořit skupinu', ungroup: 'Zrušit skupinu', layoutSaved: 'Rozložení uloženo', needTwo: 'Přidejte alespoň 2 členy' },
};
