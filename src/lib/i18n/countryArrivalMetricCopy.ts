import type { SupportedLocale } from './locales';

export type CountryArrivalMetricCopy = {
  newUsers: string;
  returningUsers: string;
  totalUsers: string;
};

export const COUNTRY_ARRIVAL_METRIC_COPY: Record<
  SupportedLocale,
  CountryArrivalMetricCopy
> = {
  en: { newUsers: 'New', returningUsers: 'Return', totalUsers: 'Total' },
  ko: { newUsers: '신규', returningUsers: '복귀', totalUsers: '총 유입' },
  zh: { newUsers: '新增', returningUsers: '回归', totalUsers: '总计' },
  hi: { newUsers: 'नए', returningUsers: 'वापसी', totalUsers: 'कुल' },
  es: { newUsers: 'Nuevos', returningUsers: 'Regreso', totalUsers: 'Total' },
  ja: { newUsers: '新規', returningUsers: '復帰', totalUsers: '合計' },
  it: { newUsers: 'Nuovi', returningUsers: 'Rientro', totalUsers: 'Totale' },
  tr: { newUsers: 'Yeni', returningUsers: 'Dönüş', totalUsers: 'Toplam' },
  nl: { newUsers: 'Nieuw', returningUsers: 'Terug', totalUsers: 'Totaal' },
  de: { newUsers: 'Neu', returningUsers: 'Zurück', totalUsers: 'Gesamt' },
  fr: { newUsers: 'Nouveaux', returningUsers: 'Retour', totalUsers: 'Total' },
  ar: { newUsers: 'جدد', returningUsers: 'عائدون', totalUsers: 'الإجمالي' },
  bn: { newUsers: 'নতুন', returningUsers: 'ফেরত', totalUsers: 'মোট' },
  pt: { newUsers: 'Novos', returningUsers: 'Retorno', totalUsers: 'Total' },
  ru: { newUsers: 'Новые', returningUsers: 'Возврат', totalUsers: 'Всего' },
  id: { newUsers: 'Baru', returningUsers: 'Kembali', totalUsers: 'Total' },
  vi: { newUsers: 'Mới', returningUsers: 'Trở lại', totalUsers: 'Tổng' },
  'zh-tw': { newUsers: '新增', returningUsers: '回歸', totalUsers: '總計' },
  sv: { newUsers: 'Nya', returningUsers: 'Åter', totalUsers: 'Totalt' },
  ro: { newUsers: 'Noi', returningUsers: 'Reveniri', totalUsers: 'Total' },
  ur: { newUsers: 'نئے', returningUsers: 'واپسی', totalUsers: 'کل' },
  pcm: { newUsers: 'New', returningUsers: 'Back', totalUsers: 'Total' },
  arz: { newUsers: 'جديد', returningUsers: 'راجعين', totalUsers: 'الإجمالي' },
  mr: { newUsers: 'नवीन', returningUsers: 'परत', totalUsers: 'एकूण' },
  te: { newUsers: 'కొత్త', returningUsers: 'తిరిగి', totalUsers: 'మొత్తం' },
  sw: { newUsers: 'Wapya', returningUsers: 'Rudi', totalUsers: 'Jumla' },
  ha: { newUsers: 'Sabbi', returningUsers: 'Dawowa', totalUsers: 'Jimilla' },
  el: { newUsers: 'Νέοι', returningUsers: 'Επιστρ.', totalUsers: 'Σύνολο' },
};
