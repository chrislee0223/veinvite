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
      'This wallet’s future VeInvite participation has been restricted after review. Any reward already paid remains unchanged.',
  },
  ko: {
    reviewTitle: '추가 확인 중',
    reviewBody:
      '이 초대는 보상 확정 전에 추가 확인이 필요해요. 검토가 끝나면 알려드릴게요.',
    restrictionTitle: 'VeInvite 참여 제한',
    restrictionBody:
      '검토 결과 이 지갑의 향후 VeInvite 참여가 제한됐어요. 이미 지급된 보상은 그대로 유지돼요.',
  },
  zh: {
    reviewTitle: '正在进行额外核验',
    reviewBody:
      '此邀请在奖励确认前需要额外核验。审核完成后我们会通知你。',
    restrictionTitle: 'VeInvite 参与受限',
    restrictionBody:
      '审核后，该钱包今后参与 VeInvite 的资格已被限制。已发放的奖励不会变更。',
  },
  hi: {
    reviewTitle: 'अतिरिक्त जाँच जारी है',
    reviewBody:
      'इनाम को अंतिम रूप देने से पहले इस रेफ़रल की अतिरिक्त जाँच आवश्यक है। समीक्षा पूरी होने पर आपको सूचित किया जाएगा।',
    restrictionTitle: 'VeInvite भागीदारी सीमित',
    restrictionBody:
      'समीक्षा के बाद इस वॉलेट की भविष्य की VeInvite भागीदारी सीमित कर दी गई है। पहले से दिए गए इनाम में कोई बदलाव नहीं होगा।',
  },
  es: {
    reviewTitle: 'Verificación adicional',
    reviewBody:
      'Esta invitación necesita una verificación adicional antes de confirmar la recompensa. Te avisaremos cuando termine la revisión.',
    restrictionTitle: 'Participación en VeInvite restringida',
    restrictionBody:
      'Tras la revisión, se restringió la participación futura de esta cartera en VeInvite. Las recompensas ya pagadas no cambian.',
  },
  ja: {
    reviewTitle: '追加確認中',
    reviewBody:
      'この招待は報酬確定前に追加確認が必要です。確認が完了したらお知らせします。',
    restrictionTitle: 'VeInvite 参加制限',
    restrictionBody:
      '確認の結果、このウォレットの今後の VeInvite 参加が制限されました。すでに支払われた報酬は変更されません。',
  },
  it: {
    reviewTitle: 'Verifica aggiuntiva',
    reviewBody:
      'Questo invito richiede una verifica aggiuntiva prima di confermare la ricompensa. Ti avviseremo al termine della revisione.',
    restrictionTitle: 'Partecipazione a VeInvite limitata',
    restrictionBody:
      'Dopo la revisione, la partecipazione futura di questo wallet a VeInvite è stata limitata. Le ricompense già pagate non cambiano.',
  },
  tr: {
    reviewTitle: 'Ek doğrulama yapılıyor',
    reviewBody:
      'Bu davet için ödül kesinleşmeden önce ek doğrulama gerekiyor. İnceleme tamamlandığında sana bildireceğiz.',
    restrictionTitle: 'VeInvite katılımı kısıtlandı',
    restrictionBody:
      'İnceleme sonucunda bu cüzdanın gelecekteki VeInvite katılımı kısıtlandı. Daha önce ödenen ödüller değişmez.',
  },
  nl: {
    reviewTitle: 'Extra controle',
    reviewBody:
      'Deze uitnodiging heeft een extra controle nodig voordat de beloning definitief wordt. We laten het weten zodra de controle klaar is.',
    restrictionTitle: 'Deelname aan VeInvite beperkt',
    restrictionBody:
      'Na controle is toekomstige deelname van deze wallet aan VeInvite beperkt. Reeds uitbetaalde beloningen blijven ongewijzigd.',
  },
  de: {
    reviewTitle: 'Zusätzliche Prüfung',
    reviewBody:
      'Diese Einladung benötigt eine zusätzliche Prüfung, bevor die Belohnung endgültig bestätigt werden kann. Wir informieren dich nach Abschluss.',
    restrictionTitle: 'VeInvite-Teilnahme eingeschränkt',
    restrictionBody:
      'Nach der Prüfung wurde die zukünftige VeInvite-Teilnahme dieses Wallets eingeschränkt. Bereits ausgezahlte Belohnungen bleiben unverändert.',
  },
  fr: {
    reviewTitle: 'Vérification supplémentaire',
    reviewBody:
      'Cette invitation nécessite une vérification supplémentaire avant la validation de la récompense. Nous vous informerons à la fin de l’examen.',
    restrictionTitle: 'Participation à VeInvite restreinte',
    restrictionBody:
      'Après examen, la participation future de ce portefeuille à VeInvite a été restreinte. Les récompenses déjà versées restent inchangées.',
  },
  ar: {
    reviewTitle: 'جارٍ إجراء تحقق إضافي',
    reviewBody:
      'تحتاج هذه الإحالة إلى تحقق إضافي قبل اعتماد المكافأة. سنبلغك عند انتهاء المراجعة.',
    restrictionTitle: 'تم تقييد المشاركة في VeInvite',
    restrictionBody:
      'بعد المراجعة، تم تقييد مشاركة هذه المحفظة مستقبلاً في VeInvite. المكافآت التي دُفعت سابقاً لن تتغير.',
  },
  bn: {
    reviewTitle: 'অতিরিক্ত যাচাই চলছে',
    reviewBody:
      'পুরস্কার চূড়ান্ত করার আগে এই রেফারেলের অতিরিক্ত যাচাই প্রয়োজন। পর্যালোচনা শেষ হলে জানানো হবে।',
    restrictionTitle: 'VeInvite অংশগ্রহণ সীমিত',
    restrictionBody:
      'পর্যালোচনার পর এই ওয়ালেটের ভবিষ্যৎ VeInvite অংশগ্রহণ সীমিত করা হয়েছে। ইতিমধ্যে দেওয়া পুরস্কার অপরিবর্তিত থাকবে।',
  },
  pt: {
    reviewTitle: 'Verificação adicional',
    reviewBody:
      'Este convite precisa de uma verificação adicional antes da confirmação da recompensa. Avisaremos quando a análise terminar.',
    restrictionTitle: 'Participação no VeInvite restrita',
    restrictionBody:
      'Após a análise, a participação futura desta carteira no VeInvite foi restringida. Recompensas já pagas não serão alteradas.',
  },
  ru: {
    reviewTitle: 'Дополнительная проверка',
    reviewBody:
      'Для этого приглашения нужна дополнительная проверка до окончательного подтверждения награды. Мы сообщим о результате.',
    restrictionTitle: 'Участие в VeInvite ограничено',
    restrictionBody:
      'После проверки будущая активность этого кошелька в VeInvite ограничена. Уже выплаченные награды не изменяются.',
  },
  id: {
    reviewTitle: 'Verifikasi tambahan',
    reviewBody:
      'Referral ini memerlukan verifikasi tambahan sebelum hadiah ditetapkan. Kami akan memberi tahu setelah peninjauan selesai.',
    restrictionTitle: 'Partisipasi VeInvite dibatasi',
    restrictionBody:
      'Setelah peninjauan, partisipasi VeInvite di masa mendatang untuk dompet ini dibatasi. Hadiah yang sudah dibayar tidak berubah.',
  },
  vi: {
    reviewTitle: 'Đang xác minh thêm',
    reviewBody:
      'Lời mời này cần được xác minh thêm trước khi phần thưởng được xác nhận. Chúng tôi sẽ thông báo khi hoàn tất.',
    restrictionTitle: 'Quyền tham gia VeInvite bị hạn chế',
    restrictionBody:
      'Sau khi xem xét, ví này bị hạn chế tham gia VeInvite trong tương lai. Phần thưởng đã thanh toán sẽ không thay đổi.',
  },
  'zh-tw': {
    reviewTitle: '正在進行額外驗證',
    reviewBody:
      '此邀請在獎勵確認前需要額外驗證。審查完成後我們會通知你。',
    restrictionTitle: 'VeInvite 參與受限',
    restrictionBody:
      '審查後，此錢包未來參與 VeInvite 的資格已受限制。已發放的獎勵不會變更。',
  },
  sv: {
    reviewTitle: 'Ytterligare verifiering',
    reviewBody:
      'Den här inbjudan behöver en extra verifiering innan belöningen kan fastställas. Vi meddelar dig när granskningen är klar.',
    restrictionTitle: 'VeInvite-deltagande begränsat',
    restrictionBody:
      'Efter granskning har den här plånbokens framtida deltagande i VeInvite begränsats. Redan utbetalda belöningar ändras inte.',
  },
  ro: {
    reviewTitle: 'Verificare suplimentară',
    reviewBody:
      'Această invitație necesită o verificare suplimentară înainte ca recompensa să fie confirmată. Te vom anunța după finalizarea analizei.',
    restrictionTitle: 'Participarea la VeInvite a fost restricționată',
    restrictionBody:
      'După analiză, participarea viitoare a acestui portofel la VeInvite a fost restricționată. Recompensele deja plătite rămân neschimbate.',
  },
  ur: {
    reviewTitle: 'اضافی تصدیق جاری ہے',
    reviewBody:
      'انعام کو حتمی بنانے سے پہلے اس ریفرل کی اضافی تصدیق ضروری ہے۔ جائزہ مکمل ہونے پر آپ کو اطلاع دی جائے گی۔',
    restrictionTitle: 'VeInvite میں شرکت محدود',
    restrictionBody:
      'جائزے کے بعد اس والیٹ کی آئندہ VeInvite شرکت محدود کر دی گئی ہے۔ پہلے سے ادا شدہ انعامات تبدیل نہیں ہوں گے۔',
  },
  pcm: {
    reviewTitle: 'Extra check dey happen',
    reviewBody:
      'Dis referral need extra check before reward fit final. We go tell you when review finish.',
    restrictionTitle: 'VeInvite participation don restrict',
    restrictionBody:
      'After review, dis wallet future VeInvite participation don restrict. Reward wey don pay before no go change.',
  },
  arz: {
    reviewTitle: 'في مراجعة إضافية',
    reviewBody:
      'الدعوة دي محتاجة تحقق إضافي قبل ما المكافأة تتأكد. هنبلغك لما المراجعة تخلص.',
    restrictionTitle: 'المشاركة في VeInvite اتقيّدت',
    restrictionBody:
      'بعد المراجعة، مشاركة المحفظة دي في VeInvite قدّام اتقيّدت. أي مكافأة اتدفعت قبل كده مش هتتغير.',
  },
  mr: {
    reviewTitle: 'अतिरिक्त पडताळणी सुरू आहे',
    reviewBody:
      'बक्षीस अंतिम करण्यापूर्वी या रेफरलची अतिरिक्त पडताळणी आवश्यक आहे. तपासणी पूर्ण झाल्यावर कळवले जाईल.',
    restrictionTitle: 'VeInvite सहभाग मर्यादित',
    restrictionBody:
      'तपासणीनंतर या वॉलेटचा भविष्यातील VeInvite सहभाग मर्यादित करण्यात आला आहे. आधीच दिलेली बक्षिसे बदलणार नाहीत.',
  },
  te: {
    reviewTitle: 'అదనపు ధృవీకరణ జరుగుతోంది',
    reviewBody:
      'రివార్డు ఖరారు చేయడానికి ముందు ఈ రిఫరల్‌కు అదనపు ధృవీకరణ అవసరం. సమీక్ష పూర్తయ్యాక తెలియజేస్తాము.',
    restrictionTitle: 'VeInvite పాల్గొనడం పరిమితం',
    restrictionBody:
      'సమీక్ష అనంతరం ఈ వాలెట్ భవిష్యత్ VeInvite పాల్గొనడం పరిమితం చేయబడింది. ఇప్పటికే చెల్లించిన రివార్డులు మారవు.',
  },
  sw: {
    reviewTitle: 'Uhakiki wa ziada unaendelea',
    reviewBody:
      'Rufaa hii inahitaji uhakiki wa ziada kabla ya zawadi kuthibitishwa. Tutakujulisha ukaguzi ukikamilika.',
    restrictionTitle: 'Ushiriki wa VeInvite umewekewa kikomo',
    restrictionBody:
      'Baada ya ukaguzi, ushiriki wa baadaye wa pochi hii kwenye VeInvite umewekewa kikomo. Zawadi zilizolipwa tayari hazitabadilika.',
  },
  ha: {
    reviewTitle: 'Ana ƙarin tantancewa',
    reviewBody:
      'Wannan gayyatar tana buƙatar ƙarin tantancewa kafin a tabbatar da lada. Za mu sanar da kai bayan an gama bita.',
    restrictionTitle: 'An takaita shiga VeInvite',
    restrictionBody:
      'Bayan bita, an takaita shiga VeInvite na wannan walat a nan gaba. Ladan da aka riga aka biya ba zai canza ba.',
  },
  el: {
    reviewTitle: 'Πρόσθετος έλεγχος',
    reviewBody:
      'Αυτή η πρόσκληση χρειάζεται πρόσθετο έλεγχο πριν οριστικοποιηθεί η ανταμοιβή. Θα ενημερωθείς όταν ολοκληρωθεί.',
    restrictionTitle: 'Περιορισμός συμμετοχής στο VeInvite',
    restrictionBody:
      'Μετά τον έλεγχο, περιορίστηκε η μελλοντική συμμετοχή αυτού του πορτοφολιού στο VeInvite. Οι ήδη καταβληθείσες ανταμοιβές δεν αλλάζουν.',
  },
  cs: {
    reviewTitle: 'Probíhá dodatečné ověření',
    reviewBody:
      'Toto pozvání vyžaduje dodatečné ověření před konečným potvrzením odměny. Po dokončení kontroly tě budeme informovat.',
    restrictionTitle: 'Účast ve VeInvite omezena',
    restrictionBody:
      'Po kontrole byla budoucí účast této peněženky ve VeInvite omezena. Již vyplacené odměny zůstávají beze změny.',
  },
};
