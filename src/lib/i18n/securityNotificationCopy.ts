import type { SupportedLocale } from './locales';

export type SecurityNotificationCopy = {
  reviewTitle: string;
  reviewBody: string;
  restrictionTitle: string;
  restrictionBody: string;
};

export const SECURITY_NOTIFICATION_COPY: Record<
  SupportedLocale,
  SecurityNotificationCopy
> = {
  en: {
    reviewTitle: 'Additional verification',
    reviewBody:
      'This referral needs an additional verification before the reward can be finalized. We’ll update you after the review.',
    restrictionTitle: 'VeInvite participation restricted',
    restrictionBody:
      'Following a security review, participation has been restricted. If you disagree, submit an appeal.',
  },
  ko: {
    reviewTitle: '추가 확인 중',
    reviewBody:
      '이 초대는 보상 확정 전에 추가 확인이 필요해요. 검토가 끝나면 알려드릴게요.',
    restrictionTitle: 'VeInvite 참여 제한',
    restrictionBody:
      '보안 검토 결과 참여가 제한됐습니다. 이의가 있다면 이의신청을 제출해 주세요.',
  },
  zh: {
    reviewTitle: '正在进行额外核验',
    reviewBody:
      '此邀请在奖励确认前需要额外核验。审核完成后我们会通知你。',
    restrictionTitle: 'VeInvite 参与受限',
    restrictionBody:
      '经安全审核，参与资格已受限。如有异议，请提交申诉。',
  },
  hi: {
    reviewTitle: 'अतिरिक्त जाँच जारी है',
    reviewBody:
      'इनाम को अंतिम रूप देने से पहले इस रेफ़रल की अतिरिक्त जाँच आवश्यक है। समीक्षा पूरी होने पर आपको सूचित किया जाएगा।',
    restrictionTitle: 'VeInvite भागीदारी सीमित',
    restrictionBody:
      'सुरक्षा समीक्षा के बाद भागीदारी सीमित कर दी गई है। असहमति होने पर अपील करें।',
  },
  es: {
    reviewTitle: 'Verificación adicional',
    reviewBody:
      'Esta invitación necesita una verificación adicional antes de confirmar la recompensa. Te avisaremos cuando termine la revisión.',
    restrictionTitle: 'Participación en VeInvite restringida',
    restrictionBody:
      'Tras una revisión de seguridad, se restringió la participación. Si no estás de acuerdo, presenta una apelación.',
  },
  ja: {
    reviewTitle: '追加確認中',
    reviewBody:
      'この招待は報酬確定前に追加確認が必要です。確認が完了したらお知らせします。',
    restrictionTitle: 'VeInvite 参加制限',
    restrictionBody:
      'セキュリティ審査の結果、参加が制限されました。異議がある場合は申し立ててください。',
  },
  it: {
    reviewTitle: 'Verifica aggiuntiva',
    reviewBody:
      'Questo invito richiede una verifica aggiuntiva prima di confermare la ricompensa. Ti avviseremo al termine della revisione.',
    restrictionTitle: 'Partecipazione a VeInvite limitata',
    restrictionBody:
      'Dopo una verifica di sicurezza, la partecipazione è stata limitata. Se non sei d’accordo, presenta ricorso.',
  },
  tr: {
    reviewTitle: 'Ek doğrulama yapılıyor',
    reviewBody:
      'Bu davet için ödül kesinleşmeden önce ek doğrulama gerekiyor. İnceleme tamamlandığında sana bildireceğiz.',
    restrictionTitle: 'VeInvite katılımı kısıtlandı',
    restrictionBody:
      'Güvenlik incelemesi sonucunda katılım kısıtlandı. İtirazınız varsa itiraz başvurusu yapın.',
  },
  nl: {
    reviewTitle: 'Extra controle',
    reviewBody:
      'Deze uitnodiging heeft een extra controle nodig voordat de beloning definitief wordt. We laten het weten zodra de controle klaar is.',
    restrictionTitle: 'Deelname aan VeInvite beperkt',
    restrictionBody:
      'Na een veiligheidscontrole is deelname beperkt. Ben je het er niet mee eens? Dien bezwaar in.',
  },
  de: {
    reviewTitle: 'Zusätzliche Prüfung',
    reviewBody:
      'Diese Einladung benötigt eine zusätzliche Prüfung, bevor die Belohnung endgültig bestätigt werden kann. Wir informieren dich nach Abschluss.',
    restrictionTitle: 'VeInvite-Teilnahme eingeschränkt',
    restrictionBody:
      'Nach einer Sicherheitsprüfung wurde die Teilnahme eingeschränkt. Wenn du nicht einverstanden bist, lege Einspruch ein.',
  },
  fr: {
    reviewTitle: 'Vérification supplémentaire',
    reviewBody:
      'Cette invitation nécessite une vérification supplémentaire avant la validation de la récompense. Nous vous informerons à la fin de l’examen.',
    restrictionTitle: 'Participation à VeInvite restreinte',
    restrictionBody:
      'Après vérification de sécurité, la participation a été restreinte. Si vous contestez cette décision, faites appel.',
  },
  ar: {
    reviewTitle: 'جارٍ إجراء تحقق إضافي',
    reviewBody:
      'تحتاج هذه الإحالة إلى تحقق إضافي قبل اعتماد المكافأة. سنبلغك عند انتهاء المراجعة.',
    restrictionTitle: 'تم تقييد المشاركة في VeInvite',
    restrictionBody:
      'بعد المراجعة الأمنية، تم تقييد المشاركة. إذا كنت تعترض، يُرجى تقديم طلب استئناف.',
  },
  bn: {
    reviewTitle: 'অতিরিক্ত যাচাই চলছে',
    reviewBody:
      'পুরস্কার চূড়ান্ত করার আগে এই রেফারেলের অতিরিক্ত যাচাই প্রয়োজন। পর্যালোচনা শেষ হলে জানানো হবে।',
    restrictionTitle: 'VeInvite অংশগ্রহণ সীমিত',
    restrictionBody:
      'নিরাপত্তা পর্যালোচনার পর অংশগ্রহণ সীমিত করা হয়েছে। আপত্তি থাকলে আপিল জমা দিন।',
  },
  pt: {
    reviewTitle: 'Verificação adicional',
    reviewBody:
      'Este convite precisa de uma verificação adicional antes da confirmação da recompensa. Avisaremos quando a análise terminar.',
    restrictionTitle: 'Participação no VeInvite restrita',
    restrictionBody:
      'Após uma análise de segurança, a participação foi restringida. Se discordar, envie um recurso.',
  },
  ru: {
    reviewTitle: 'Дополнительная проверка',
    reviewBody:
      'Для этого приглашения нужна дополнительная проверка до окончательного подтверждения награды. Мы сообщим о результате.',
    restrictionTitle: 'Участие в VeInvite ограничено',
    restrictionBody:
      'По итогам проверки безопасности участие ограничено. Если вы не согласны, подайте апелляцию.',
  },
  id: {
    reviewTitle: 'Verifikasi tambahan',
    reviewBody:
      'Referral ini memerlukan verifikasi tambahan sebelum hadiah ditetapkan. Kami akan memberi tahu setelah peninjauan selesai.',
    restrictionTitle: 'Partisipasi VeInvite dibatasi',
    restrictionBody:
      'Setelah peninjauan keamanan, partisipasi dibatasi. Jika Anda tidak setuju, ajukan banding.',
  },
  vi: {
    reviewTitle: 'Đang xác minh thêm',
    reviewBody:
      'Lời mời này cần được xác minh thêm trước khi phần thưởng được xác nhận. Chúng tôi sẽ thông báo khi hoàn tất.',
    restrictionTitle: 'Quyền tham gia VeInvite bị hạn chế',
    restrictionBody:
      'Sau khi kiểm tra bảo mật, quyền tham gia đã bị hạn chế. Nếu không đồng ý, hãy gửi đơn khiếu nại.',
  },
  'zh-tw': {
    reviewTitle: '正在進行額外驗證',
    reviewBody:
      '此邀請在獎勵確認前需要額外驗證。審查完成後我們會通知你。',
    restrictionTitle: 'VeInvite 參與受限',
    restrictionBody:
      '經安全審查，參與資格已受限。如有異議，請提出申訴。',
  },
  sv: {
    reviewTitle: 'Ytterligare verifiering',
    reviewBody:
      'Den här inbjudan behöver en extra verifiering innan belöningen kan fastställas. Vi meddelar dig när granskningen är klar.',
    restrictionTitle: 'VeInvite-deltagande begränsat',
    restrictionBody:
      'Efter en säkerhetsgranskning har deltagandet begränsats. Om du inte håller med, överklaga beslutet.',
  },
  ro: {
    reviewTitle: 'Verificare suplimentară',
    reviewBody:
      'Această invitație necesită o verificare suplimentară înainte ca recompensa să fie confirmată. Te vom anunța după finalizarea analizei.',
    restrictionTitle: 'Participarea la VeInvite a fost restricționată',
    restrictionBody:
      'În urma verificării de securitate, participarea a fost restricționată. Dacă nu ești de acord, depune o contestație.',
  },
  ur: {
    reviewTitle: 'اضافی تصدیق جاری ہے',
    reviewBody:
      'انعام کو حتمی بنانے سے پہلے اس ریفرل کی اضافی تصدیق ضروری ہے۔ جائزہ مکمل ہونے پر آپ کو اطلاع دی جائے گی۔',
    restrictionTitle: 'VeInvite میں شرکت محدود',
    restrictionBody:
      'سیکیورٹی جائزے کے بعد شرکت محدود کر دی گئی ہے۔ اگر آپ کو اعتراض ہے تو اپیل جمع کرائیں۔',
  },
  pcm: {
    reviewTitle: 'Extra check dey happen',
    reviewBody:
      'Dis referral need extra check before reward fit final. We go tell you when review finish.',
    restrictionTitle: 'VeInvite participation don restrict',
    restrictionBody:
      'After security check, dem don restrict participation. If you no agree, submit appeal.',
  },
  arz: {
    reviewTitle: 'في مراجعة إضافية',
    reviewBody:
      'الدعوة دي محتاجة تحقق إضافي قبل ما المكافأة تتأكد. هنبلغك لما المراجعة تخلص.',
    restrictionTitle: 'المشاركة في VeInvite اتقيّدت',
    restrictionBody:
      'بعد مراجعة الأمان، المشاركة اتقيّدت. لو عندك اعتراض، قدّم تظلّم.',
  },
  mr: {
    reviewTitle: 'अतिरिक्त पडताळणी सुरू आहे',
    reviewBody:
      'बक्षीस अंतिम करण्यापूर्वी या रेफरलची अतिरिक्त पडताळणी आवश्यक आहे. तपासणी पूर्ण झाल्यावर कळवले जाईल.',
    restrictionTitle: 'VeInvite सहभाग मर्यादित',
    restrictionBody:
      'सुरक्षा तपासणीनंतर सहभाग मर्यादित करण्यात आला आहे. आक्षेप असल्यास अपील सादर करा.',
  },
  te: {
    reviewTitle: 'అదనపు ధృవీకరణ జరుగుతోంది',
    reviewBody:
      'రివార్డు ఖరారు చేయడానికి ముందు ఈ రిఫరల్‌కు అదనపు ధృవీకరణ అవసరం. సమీక్ష పూర్తయ్యాక తెలియజేస్తాము.',
    restrictionTitle: 'VeInvite పాల్గొనడం పరిమితం',
    restrictionBody:
      'భద్రతా సమీక్ష అనంతరం పాల్గొనడం పరిమితం చేయబడింది. అభ్యంతరం ఉంటే అప్పీల్ సమర్పించండి.',
  },
  sw: {
    reviewTitle: 'Uhakiki wa ziada unaendelea',
    reviewBody:
      'Rufaa hii inahitaji uhakiki wa ziada kabla ya zawadi kuthibitishwa. Tutakujulisha ukaguzi ukikamilika.',
    restrictionTitle: 'Ushiriki wa VeInvite umewekewa kikomo',
    restrictionBody:
      'Baada ya ukaguzi wa usalama, ushiriki umewekewa kikomo. Ikiwa hukubaliani, wasilisha rufaa.',
  },
  ha: {
    reviewTitle: 'Ana ƙarin tantancewa',
    reviewBody:
      'Wannan gayyatar tana buƙatar ƙarin tantancewa kafin a tabbatar da lada. Za mu sanar da kai bayan an gama bita.',
    restrictionTitle: 'An takaita shiga VeInvite',
    restrictionBody:
      'Bayan binciken tsaro, an takaita shiga. Idan ba ka yarda ba, ka ɗaukaka ƙara.',
  },
  el: {
    reviewTitle: 'Πρόσθετος έλεγχος',
    reviewBody:
      'Αυτή η πρόσκληση χρειάζεται πρόσθετο έλεγχο πριν οριστικοποιηθεί η ανταμοιβή. Θα ενημερωθείς όταν ολοκληρωθεί.',
    restrictionTitle: 'Περιορισμός συμμετοχής στο VeInvite',
    restrictionBody:
      'Μετά από έλεγχο ασφαλείας, η συμμετοχή περιορίστηκε. Αν διαφωνείς, υπέβαλε ένσταση.',
  },
  cs: {
    reviewTitle: 'Probíhá dodatečné ověření',
    reviewBody:
      'Toto pozvání vyžaduje dodatečné ověření před konečným potvrzením odměny. Po dokončení kontroly tě budeme informovat.',
    restrictionTitle: 'Účast ve VeInvite omezena',
    restrictionBody:
      'Po bezpečnostní kontrole byla účast omezena. Pokud nesouhlasíš, podej odvolání.',
  },
};
