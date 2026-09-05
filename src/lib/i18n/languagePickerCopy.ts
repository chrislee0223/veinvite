import {
  isLocale,
  type Locale,
  type SupportedLocale,
} from './locales';

type LanguagePickerCopy = {
  searchPlaceholder: string;
  noResults: string;
};

const LANGUAGE_PICKER_COPY: Record<
  SupportedLocale,
  LanguagePickerCopy
> = {
  en: {
    searchPlaceholder: 'Search languages',
    noResults: 'No languages found',
  },
  ko: {
    searchPlaceholder: '언어 검색',
    noResults: '검색 결과가 없어요',
  },
  zh: {
    searchPlaceholder: '搜索语言',
    noResults: '未找到语言',
  },
  hi: {
    searchPlaceholder: 'भाषा खोजें',
    noResults: 'कोई भाषा नहीं मिली',
  },
  es: {
    searchPlaceholder: 'Buscar idiomas',
    noResults: 'No se encontraron idiomas',
  },
  ja: {
    searchPlaceholder: '言語を検索',
    noResults: '言語が見つかりません',
  },
  it: {
    searchPlaceholder: 'Cerca lingue',
    noResults: 'Nessuna lingua trovata',
  },
  tr: {
    searchPlaceholder: 'Dil ara',
    noResults: 'Dil bulunamadı',
  },
  nl: {
    searchPlaceholder: 'Talen zoeken',
    noResults: 'Geen talen gevonden',
  },
  de: {
    searchPlaceholder: 'Sprachen suchen',
    noResults: 'Keine Sprachen gefunden',
  },
  fr: {
    searchPlaceholder: 'Rechercher une langue',
    noResults: 'Aucune langue trouvée',
  },
  ar: {
    searchPlaceholder: 'ابحث عن لغة',
    noResults: 'لم يتم العثور على لغات',
  },
  bn: {
    searchPlaceholder: 'ভাষা খুঁজুন',
    noResults: 'কোনো ভাষা পাওয়া যায়নি',
  },
  pt: {
    searchPlaceholder: 'Buscar idiomas',
    noResults: 'Nenhum idioma encontrado',
  },
  ru: {
    searchPlaceholder: 'Поиск языков',
    noResults: 'Языки не найдены',
  },
  id: {
    searchPlaceholder: 'Cari bahasa',
    noResults: 'Bahasa tidak ditemukan',
  },
  vi: {
    searchPlaceholder: 'Tìm ngôn ngữ',
    noResults: 'Không tìm thấy ngôn ngữ',
  },
  'zh-tw': {
    searchPlaceholder: '搜尋語言',
    noResults: '找不到語言',
  },
  sv: {
    searchPlaceholder: 'Sök språk',
    noResults: 'Inga språk hittades',
  },
  ro: {
    searchPlaceholder: 'Caută limbi',
    noResults: 'Nu s-au găsit limbi',
  },
  ur: {
    searchPlaceholder: 'زبان تلاش کریں',
    noResults: 'کوئی زبان نہیں ملی',
  },
  pcm: {
    searchPlaceholder: 'Find language',
    noResults: 'No language match your search',
  },
  arz: {
    searchPlaceholder: 'دوّر على لغة',
    noResults: 'مفيش لغات مطابقة',
  },
  mr: {
    searchPlaceholder: 'भाषा शोधा',
    noResults: 'कोणतीही भाषा सापडली नाही',
  },
  te: {
    searchPlaceholder: 'భాషను వెతకండి',
    noResults: 'ఏ భాషా కనబడలేదు',
  },
  sw: {
    searchPlaceholder: 'Tafuta lugha',
    noResults: 'Hakuna lugha iliyopatikana',
  },
  ha: {
    searchPlaceholder: 'Nemo harshe',
    noResults: 'Ba a sami harshe ba',
  },
  el: {
    searchPlaceholder: 'Αναζήτηση γλώσσας',
    noResults: 'Δεν βρέθηκαν γλώσσες',
  },
};

export function getLanguagePickerCopy(
  locale: Locale,
): LanguagePickerCopy {
  return LANGUAGE_PICKER_COPY[
    isLocale(locale) ? locale : 'en'
  ];
}
