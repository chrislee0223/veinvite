import type { SupportedLocale } from './locales';

type LanguagePickerCopy = {
  search: string;
  noResults: string;
};

export const LANGUAGE_PICKER_COPY: Record<SupportedLocale, LanguagePickerCopy> = {
  en: { search: 'Search languages', noResults: 'No languages found' },
  ko: { search: '언어 검색', noResults: '검색 결과가 없어요' },
  zh: { search: '搜索语言', noResults: '未找到语言' },
  hi: { search: 'भाषा खोजें', noResults: 'कोई भाषा नहीं मिली' },
  es: { search: 'Buscar idiomas', noResults: 'No se encontraron idiomas' },
  ja: { search: '言語を検索', noResults: '言語が見つかりません' },
  it: { search: 'Cerca lingue', noResults: 'Nessuna lingua trovata' },
  tr: { search: 'Dil ara', noResults: 'Dil bulunamadı' },
  nl: { search: 'Talen zoeken', noResults: 'Geen talen gevonden' },
  de: { search: 'Sprachen suchen', noResults: 'Keine Sprachen gefunden' },
  fr: { search: 'Rechercher une langue', noResults: 'Aucune langue trouvée' },
  ar: { search: 'البحث عن لغة', noResults: 'لم يتم العثور على لغات' },
  bn: { search: 'ভাষা খুঁজুন', noResults: 'কোনো ভাষা পাওয়া যায়নি' },
  pt: { search: 'Buscar idiomas', noResults: 'Nenhum idioma encontrado' },
  ru: { search: 'Поиск языков', noResults: 'Языки не найдены' },
  id: { search: 'Cari bahasa', noResults: 'Bahasa tidak ditemukan' },
  vi: { search: 'Tìm ngôn ngữ', noResults: 'Không tìm thấy ngôn ngữ' },
  'zh-tw': { search: '搜尋語言', noResults: '找不到語言' },
  sv: { search: 'Sök språk', noResults: 'Inga språk hittades' },
  ro: { search: 'Caută limbi', noResults: 'Nu s-au găsit limbi' },
  ur: { search: 'زبان تلاش کریں', noResults: 'کوئی زبان نہیں ملی' },
  pcm: { search: 'Search language', noResults: 'No language dey' },
  arz: { search: 'دوّر على لغة', noResults: 'مفيش لغات اتلاقت' },
  mr: { search: 'भाषा शोधा', noResults: 'कोणतीही भाषा सापडली नाही' },
  te: { search: 'భాషను వెతకండి', noResults: 'భాషలు కనబడలేదు' },
  sw: { search: 'Tafuta lugha', noResults: 'Hakuna lugha iliyopatikana' },
  ha: { search: 'Nemo harshe', noResults: 'Ba a sami harshe ba' },
  el: { search: 'Αναζήτηση γλώσσας', noResults: 'Δεν βρέθηκαν γλώσσες' },
};
