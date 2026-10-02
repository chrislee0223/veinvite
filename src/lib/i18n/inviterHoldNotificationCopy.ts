import type { SupportedLocale } from './locales';

export type InviterHoldNotificationCopy = {
  title: string;
  body: string;
};

export const INVITER_HOLD_NOTIFICATION_COPY: Record<
  SupportedLocale,
  InviterHoldNotificationCopy
> = {
  en: {
    title: 'Referral activity under review',
    body: 'Some recent referral activity needs additional verification. VeInvite access is temporarily limited while the review is pending.',
  },
  ko: {
    title: '초대 활동 확인 중',
    body: '최근 일부 초대 활동을 추가 확인하고 있어요. 검토가 끝날 때까지 VeInvite 이용이 일시적으로 제한돼요.',
  },
  zh: {
    title: '邀请活动审核中',
    body: '近期部分邀请活动需要额外核验。审核期间，VeInvite 使用会暂时受到限制。',
  },
  hi: {
    title: 'रेफ़रल गतिविधि की समीक्षा जारी है',
    body: 'हाल की कुछ रेफ़रल गतिविधि की अतिरिक्त जाँच आवश्यक है। समीक्षा लंबित रहने तक VeInvite का उपयोग अस्थायी रूप से सीमित रहेगा।',
  },
  es: {
    title: 'Actividad de invitaciones en revisión',
    body: 'Parte de la actividad reciente necesita una verificación adicional. El acceso a VeInvite estará limitado temporalmente mientras dure la revisión.',
  },
  ja: {
    title: '招待活動を確認中',
    body: '最近の一部の招待活動について追加確認が必要です。確認が終わるまで VeInvite の利用は一時的に制限されます。',
  },
  it: {
    title: 'Attività degli inviti in revisione',
    body: 'Alcune attività recenti richiedono una verifica aggiuntiva. L’accesso a VeInvite è temporaneamente limitato durante la revisione.',
  },
  tr: {
    title: 'Davet etkinliği inceleniyor',
    body: 'Yakın zamandaki bazı davet etkinlikleri ek doğrulama gerektiriyor. İnceleme sonuçlanana kadar VeInvite erişimi geçici olarak sınırlıdır.',
  },
  nl: {
    title: 'Uitnodigingsactiviteit wordt beoordeeld',
    body: 'Een deel van de recente activiteit heeft extra controle nodig. VeInvite-toegang is tijdelijk beperkt zolang de beoordeling loopt.',
  },
  de: {
    title: 'Einladungsaktivität wird geprüft',
    body: 'Ein Teil der jüngsten Einladungsaktivität benötigt eine zusätzliche Prüfung. Währenddessen ist der VeInvite-Zugang vorübergehend eingeschränkt.',
  },
  fr: {
    title: 'Activité d’invitation en cours d’examen',
    body: 'Une partie de l’activité récente nécessite une vérification supplémentaire. L’accès à VeInvite est temporairement limité pendant l’examen.',
  },
  ar: {
    title: 'تتم مراجعة نشاط الدعوات',
    body: 'تحتاج بعض أنشطة الدعوات الأخيرة إلى تحقق إضافي. سيتم تقييد الوصول إلى VeInvite مؤقتاً أثناء المراجعة.',
  },
  bn: {
    title: 'রেফারেল কার্যক্রম পর্যালোচনাধীন',
    body: 'সাম্প্রতিক কিছু রেফারেল কার্যক্রমে অতিরিক্ত যাচাই প্রয়োজন। পর্যালোচনা চলাকালে VeInvite ব্যবহার সাময়িকভাবে সীমিত থাকবে।',
  },
  pt: {
    title: 'Atividade de convites em análise',
    body: 'Parte da atividade recente precisa de verificação adicional. O acesso ao VeInvite fica temporariamente limitado durante a análise.',
  },
  ru: {
    title: 'Активность приглашений проверяется',
    body: 'Некоторая недавняя активность приглашений требует дополнительной проверки. На время проверки доступ к VeInvite временно ограничен.',
  },
  id: {
    title: 'Aktivitas referral sedang ditinjau',
    body: 'Sebagian aktivitas referral terbaru memerlukan verifikasi tambahan. Akses VeInvite sementara dibatasi selama peninjauan.',
  },
  vi: {
    title: 'Đang xem xét hoạt động giới thiệu',
    body: 'Một số hoạt động giới thiệu gần đây cần được xác minh thêm. Quyền truy cập VeInvite tạm thời bị hạn chế trong thời gian xem xét.',
  },
  'zh-tw': {
    title: '正在審查邀請活動',
    body: '近期部分邀請活動需要額外驗證。審查期間，VeInvite 使用會暫時受到限制。',
  },
  sv: {
    title: 'Inbjudningsaktivitet granskas',
    body: 'Viss nylig inbjudningsaktivitet behöver extra verifiering. VeInvite-åtkomsten är tillfälligt begränsad medan granskningen pågår.',
  },
  ro: {
    title: 'Activitatea invitațiilor este în curs de verificare',
    body: 'O parte din activitatea recentă necesită verificare suplimentară. Accesul la VeInvite este temporar limitat cât timp analiza este în desfășurare.',
  },
  ur: {
    title: 'ریفرل سرگرمی زیرِ جائزہ ہے',
    body: 'حالیہ کچھ ریفرل سرگرمی کو اضافی تصدیق درکار ہے۔ جائزہ مکمل ہونے تک VeInvite تک رسائی عارضی طور پر محدود رہے گی۔',
  },
  pcm: {
    title: 'Referral activity dey under review',
    body: 'Some recent referral activity need extra check. VeInvite access go limit small until review finish.',
  },
  arz: {
    title: 'نشاط الدعوات تحت المراجعة',
    body: 'بعض نشاط الدعوات الأخير محتاج مراجعة إضافية. استخدام VeInvite هيبقى محدود مؤقتاً لحد ما المراجعة تخلص.',
  },
  mr: {
    title: 'रेफरल क्रियाकलाप तपासणीमध्ये आहे',
    body: 'अलीकडील काही रेफरल क्रियाकलापांची अतिरिक्त पडताळणी आवश्यक आहे. तपासणी पूर्ण होईपर्यंत VeInvite वापर तात्पुरता मर्यादित राहील.',
  },
  te: {
    title: 'రిఫరల్ కార్యకలాపం సమీక్షలో ఉంది',
    body: 'ఇటీవలి కొన్ని రిఫరల్ కార్యకలాపాలకు అదనపు ధృవీకరణ అవసరం. సమీక్ష పూర్తయ్యే వరకు VeInvite యాక్సెస్ తాత్కాలికంగా పరిమితం అవుతుంది.',
  },
  sw: {
    title: 'Shughuli za rufaa zinakaguliwa',
    body: 'Baadhi ya shughuli za hivi karibuni zinahitaji uhakiki wa ziada. Ufikiaji wa VeInvite umewekewa kikomo kwa muda wakati ukaguzi unaendelea.',
  },
  ha: {
    title: 'Ana duba ayyukan referral',
    body: 'Wasu ayyukan referral na baya-bayan nan suna bukatar ƙarin tantancewa. Za a takaita amfani da VeInvite na ɗan lokaci har sai an kammala bita.',
  },
  el: {
    title: 'Η δραστηριότητα προσκλήσεων ελέγχεται',
    body: 'Μέρος της πρόσφατης δραστηριότητας χρειάζεται πρόσθετο έλεγχο. Η πρόσβαση στο VeInvite περιορίζεται προσωρινά όσο διαρκεί ο έλεγχος.',
  },
  cs: {
    title: 'Aktivita pozvánek se kontroluje',
    body: 'Část nedávné aktivity vyžaduje dodatečné ověření. Přístup k VeInvite je po dobu kontroly dočasně omezen.',
  },
};
