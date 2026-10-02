import type { SupportedLocale } from './locales';

export type SecurityReviewClearedCopy = {
  title: string;
  body: string;
};

export const SECURITY_REVIEW_CLEARED_COPY: Record<
  SupportedLocale,
  SecurityReviewClearedCopy
> = {
  en: {
    title: 'Additional verification complete',
    body: 'The additional verification is complete. This referral can continue normally.',
  },
  ko: {
    title: '추가 확인이 완료됐어요',
    body: '추가 확인이 완료됐어요. 이 초대는 정상적으로 인정되어 계속 진행할 수 있어요.',
  },
  zh: {
    title: '额外核验已完成',
    body: '额外核验已完成。此邀请已正常通过，可以继续进行。',
  },
  hi: {
    title: 'अतिरिक्त जाँच पूरी हुई',
    body: 'अतिरिक्त जाँच पूरी हो गई है। यह रेफ़रल सामान्य रूप से आगे बढ़ सकता है।',
  },
  es: {
    title: 'Verificación adicional completada',
    body: 'La verificación adicional ha terminado. Esta invitación puede continuar con normalidad.',
  },
  ja: {
    title: '追加確認が完了しました',
    body: '追加確認が完了しました。この招待は正常に認められ、引き続き進められます。',
  },
  it: {
    title: 'Verifica aggiuntiva completata',
    body: 'La verifica aggiuntiva è terminata. Questo invito può proseguire normalmente.',
  },
  tr: {
    title: 'Ek doğrulama tamamlandı',
    body: 'Ek doğrulama tamamlandı. Bu davet normal şekilde devam edebilir.',
  },
  nl: {
    title: 'Extra controle afgerond',
    body: 'De extra controle is afgerond. Deze uitnodiging kan normaal doorgaan.',
  },
  de: {
    title: 'Zusätzliche Prüfung abgeschlossen',
    body: 'Die zusätzliche Prüfung ist abgeschlossen. Diese Einladung kann normal fortgesetzt werden.',
  },
  fr: {
    title: 'Vérification supplémentaire terminée',
    body: 'La vérification supplémentaire est terminée. Cette invitation peut continuer normalement.',
  },
  ar: {
    title: 'اكتمل التحقق الإضافي',
    body: 'اكتمل التحقق الإضافي. يمكن متابعة هذه الدعوة بشكل طبيعي.',
  },
  bn: {
    title: 'অতিরিক্ত যাচাই সম্পন্ন',
    body: 'অতিরিক্ত যাচাই সম্পন্ন হয়েছে। এই রেফারেল স্বাভাবিকভাবে চালিয়ে নেওয়া যাবে।',
  },
  pt: {
    title: 'Verificação adicional concluída',
    body: 'A verificação adicional foi concluída. Este convite pode continuar normalmente.',
  },
  ru: {
    title: 'Дополнительная проверка завершена',
    body: 'Дополнительная проверка завершена. Это приглашение может продолжаться в обычном режиме.',
  },
  id: {
    title: 'Verifikasi tambahan selesai',
    body: 'Verifikasi tambahan telah selesai. Referral ini dapat dilanjutkan secara normal.',
  },
  vi: {
    title: 'Đã hoàn tất xác minh bổ sung',
    body: 'Quá trình xác minh bổ sung đã hoàn tất. Lời mời này có thể tiếp tục bình thường.',
  },
  'zh-tw': {
    title: '額外驗證已完成',
    body: '額外驗證已完成。此邀請已正常通過，可以繼續進行。',
  },
  sv: {
    title: 'Extra verifiering slutförd',
    body: 'Den extra verifieringen är klar. Den här inbjudan kan fortsätta som vanligt.',
  },
  ro: {
    title: 'Verificarea suplimentară s-a încheiat',
    body: 'Verificarea suplimentară este finalizată. Această invitație poate continua în mod normal.',
  },
  ur: {
    title: 'اضافی تصدیق مکمل ہو گئی',
    body: 'اضافی تصدیق مکمل ہو گئی ہے۔ یہ ریفرل معمول کے مطابق جاری رہ سکتا ہے۔',
  },
  pcm: {
    title: 'Extra check don finish',
    body: 'Extra check don finish. Dis referral fit continue normally.',
  },
  arz: {
    title: 'المراجعة الإضافية خلصت',
    body: 'المراجعة الإضافية خلصت. الدعوة دي تقدر تكمل بشكل طبيعي.',
  },
  mr: {
    title: 'अतिरिक्त पडताळणी पूर्ण झाली',
    body: 'अतिरिक्त पडताळणी पूर्ण झाली आहे. हे रेफरल नेहमीप्रमाणे पुढे जाऊ शकते.',
  },
  te: {
    title: 'అదనపు ధృవీకరణ పూర్తైంది',
    body: 'అదనపు ధృవీకరణ పూర్తైంది. ఈ రిఫరల్ సాధారణంగా కొనసాగవచ్చు.',
  },
  sw: {
    title: 'Uhakiki wa ziada umekamilika',
    body: 'Uhakiki wa ziada umekamilika. Rufaa hii inaweza kuendelea kawaida.',
  },
  ha: {
    title: 'An kammala ƙarin tantancewa',
    body: 'An kammala ƙarin tantancewa. Wannan gayyatar za ta iya ci gaba yadda aka saba.',
  },
  el: {
    title: 'Ο πρόσθετος έλεγχος ολοκληρώθηκε',
    body: 'Ο πρόσθετος έλεγχος ολοκληρώθηκε. Αυτή η πρόσκληση μπορεί να συνεχιστεί κανονικά.',
  },
  cs: {
    title: 'Dodatečné ověření dokončeno',
    body: 'Dodatečné ověření je dokončeno. Tato pozvánka může pokračovat běžným způsobem.',
  },
};
