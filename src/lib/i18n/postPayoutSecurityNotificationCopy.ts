import type { SupportedLocale } from './locales';

export type PostPayoutSecurityNotificationCopy = {
  reviewTitle: string;
  reviewBody: string;
  clearedTitle: string;
  clearedBody: string;
};

export const POST_PAYOUT_SECURITY_NOTIFICATION_COPY: Record<
  SupportedLocale,
  PostPayoutSecurityNotificationCopy
> = {
  en: {
    reviewTitle: 'Post-reward review in progress',
    reviewBody: 'This referral was already paid, but later activity needs an additional security review. B3TR already paid will not change while the review is in progress.',
    clearedTitle: 'Additional review complete',
    clearedBody: 'The post-reward review is complete with no additional restriction. B3TR already paid and your VeInvite access remain unchanged.',
  },
  ko: {
    reviewTitle: '보상 지급 후 추가 확인 중',
    reviewBody: '이 초대는 보상 지급이 완료됐지만 이후 활동에 추가 확인이 필요해요. 검토 중에도 이미 지급된 B3TR은 변경되지 않아요.',
    clearedTitle: '추가 확인이 완료됐어요',
    clearedBody: '보상 지급 후 추가 확인이 완료됐고 별도 제한 없이 종료됐어요. 이미 지급된 B3TR과 VeInvite 이용 상태는 그대로 유지돼요.',
  },
  zh: {
    reviewTitle: '奖励发放后正在追加核验',
    reviewBody: '此邀请的奖励已发放，但后续活动需要额外安全核验。核验期间，已发放的 B3TR 不会改变。',
    clearedTitle: '追加核验已完成',
    clearedBody: '奖励发放后的追加核验已完成，没有新增限制。已发放的 B3TR 和你的 VeInvite 使用状态保持不变。',
  },
  hi: {
    reviewTitle: 'रिवॉर्ड के बाद अतिरिक्त जाँच जारी है',
    reviewBody: 'इस रेफ़रल का रिवॉर्ड पहले ही दिया जा चुका है, लेकिन बाद की गतिविधि के लिए अतिरिक्त सुरक्षा जाँच आवश्यक है। समीक्षा के दौरान पहले से दिया गया B3TR नहीं बदलेगा।',
    clearedTitle: 'अतिरिक्त जाँच पूरी हुई',
    clearedBody: 'रिवॉर्ड के बाद की अतिरिक्त जाँच बिना किसी नई पाबंदी के पूरी हो गई है। पहले से दिया गया B3TR और आपका VeInvite एक्सेस नहीं बदला है।',
  },
  es: {
    reviewTitle: 'Revisión posterior a la recompensa',
    reviewBody: 'Esta invitación ya fue pagada, pero la actividad posterior necesita una revisión de seguridad adicional. El B3TR ya pagado no cambiará durante la revisión.',
    clearedTitle: 'Revisión adicional completada',
    clearedBody: 'La revisión posterior a la recompensa terminó sin restricciones adicionales. El B3TR ya pagado y tu acceso a VeInvite no cambian.',
  },
  ja: {
    reviewTitle: '報酬支払い後の追加確認中',
    reviewBody: 'この招待の報酬はすでに支払われていますが、その後の活動について追加のセキュリティ確認が必要です。確認中も支払い済みの B3TR は変更されません。',
    clearedTitle: '追加確認が完了しました',
    clearedBody: '報酬支払い後の追加確認は、新たな制限なく完了しました。支払い済みの B3TR と VeInvite の利用状態は変わりません。',
  },
  it: {
    reviewTitle: 'Revisione dopo la ricompensa',
    reviewBody: 'Questo referral è già stato pagato, ma l’attività successiva richiede un ulteriore controllo di sicurezza. I B3TR già pagati non cambieranno durante la revisione.',
    clearedTitle: 'Revisione aggiuntiva completata',
    clearedBody: 'La revisione successiva al pagamento è terminata senza ulteriori restrizioni. I B3TR già pagati e il tuo accesso a VeInvite restano invariati.',
  },
  tr: {
    reviewTitle: 'Ödül sonrası ek inceleme',
    reviewBody: 'Bu davetin ödülü zaten ödendi, ancak sonraki etkinlik ek güvenlik incelemesi gerektiriyor. İnceleme sırasında ödenmiş B3TR değişmeyecek.',
    clearedTitle: 'Ek inceleme tamamlandı',
    clearedBody: 'Ödül sonrası ek inceleme yeni bir kısıtlama olmadan tamamlandı. Ödenmiş B3TR ve VeInvite erişimin değişmedi.',
  },
  nl: {
    reviewTitle: 'Extra controle na beloning',
    reviewBody: 'Deze referral is al uitbetaald, maar latere activiteit vereist een extra veiligheidscontrole. Reeds betaalde B3TR verandert niet tijdens de controle.',
    clearedTitle: 'Extra controle afgerond',
    clearedBody: 'De controle na de beloning is afgerond zonder extra beperking. Reeds betaalde B3TR en je VeInvite-toegang blijven ongewijzigd.',
  },
  de: {
    reviewTitle: 'Zusätzliche Prüfung nach der Belohnung',
    reviewBody: 'Diese Empfehlung wurde bereits ausgezahlt, spätere Aktivitäten erfordern jedoch eine zusätzliche Sicherheitsprüfung. Bereits ausgezahlte B3TR bleiben während der Prüfung unverändert.',
    clearedTitle: 'Zusätzliche Prüfung abgeschlossen',
    clearedBody: 'Die Prüfung nach der Belohnung wurde ohne zusätzliche Einschränkung abgeschlossen. Bereits ausgezahlte B3TR und dein VeInvite-Zugang bleiben unverändert.',
  },
  fr: {
    reviewTitle: 'Vérification après la récompense',
    reviewBody: 'Ce parrainage a déjà été payé, mais une activité ultérieure nécessite une vérification de sécurité supplémentaire. Les B3TR déjà versés ne changeront pas pendant la vérification.',
    clearedTitle: 'Vérification supplémentaire terminée',
    clearedBody: 'La vérification après récompense est terminée sans restriction supplémentaire. Les B3TR déjà versés et ton accès à VeInvite restent inchangés.',
  },
  ar: {
    reviewTitle: 'مراجعة إضافية بعد دفع المكافأة',
    reviewBody: 'تم دفع مكافأة هذه الإحالة بالفعل، لكن النشاط اللاحق يحتاج إلى مراجعة أمنية إضافية. لن تتغير مكافآت B3TR المدفوعة أثناء المراجعة.',
    clearedTitle: 'اكتملت المراجعة الإضافية',
    clearedBody: 'اكتملت المراجعة بعد دفع المكافأة دون أي قيود إضافية. تبقى مكافآت B3TR المدفوعة وحالة استخدام VeInvite دون تغيير.',
  },
  bn: {
    reviewTitle: 'পুরস্কার দেওয়ার পর অতিরিক্ত পর্যালোচনা',
    reviewBody: 'এই রেফারেলের পুরস্কার ইতিমধ্যে দেওয়া হয়েছে, তবে পরবর্তী কার্যক্রমে অতিরিক্ত নিরাপত্তা পর্যালোচনা প্রয়োজন। পর্যালোচনার সময় ইতিমধ্যে দেওয়া B3TR পরিবর্তন হবে না।',
    clearedTitle: 'অতিরিক্ত পর্যালোচনা সম্পন্ন',
    clearedBody: 'পুরস্কার দেওয়ার পরের পর্যালোচনা কোনো অতিরিক্ত সীমাবদ্ধতা ছাড়াই শেষ হয়েছে। ইতিমধ্যে দেওয়া B3TR ও আপনার VeInvite ব্যবহার অপরিবর্তিত থাকবে।',
  },
  pt: {
    reviewTitle: 'Revisão após a recompensa',
    reviewBody: 'Esta indicação já foi paga, mas a atividade posterior precisa de uma revisão de segurança adicional. O B3TR já pago não será alterado durante a revisão.',
    clearedTitle: 'Revisão adicional concluída',
    clearedBody: 'A revisão após a recompensa terminou sem restrições adicionais. O B3TR já pago e seu acesso ao VeInvite permanecem inalterados.',
  },
  ru: {
    reviewTitle: 'Дополнительная проверка после награды',
    reviewBody: 'Награда по этому рефералу уже выплачена, но последующая активность требует дополнительной проверки безопасности. Уже выплаченные B3TR не изменятся во время проверки.',
    clearedTitle: 'Дополнительная проверка завершена',
    clearedBody: 'Проверка после выплаты завершена без дополнительных ограничений. Уже выплаченные B3TR и доступ к VeInvite остаются без изменений.',
  },
  id: {
    reviewTitle: 'Peninjauan tambahan setelah reward',
    reviewBody: 'Referral ini sudah dibayar, tetapi aktivitas setelahnya memerlukan peninjauan keamanan tambahan. B3TR yang sudah dibayar tidak akan berubah selama peninjauan.',
    clearedTitle: 'Peninjauan tambahan selesai',
    clearedBody: 'Peninjauan setelah reward selesai tanpa pembatasan tambahan. B3TR yang sudah dibayar dan akses VeInvite Anda tetap tidak berubah.',
  },
  vi: {
    reviewTitle: 'Kiểm tra thêm sau khi trả thưởng',
    reviewBody: 'Lượt giới thiệu này đã được trả thưởng, nhưng hoạt động sau đó cần được kiểm tra bảo mật thêm. B3TR đã trả sẽ không thay đổi trong quá trình kiểm tra.',
    clearedTitle: 'Đã hoàn tất kiểm tra bổ sung',
    clearedBody: 'Việc kiểm tra sau khi trả thưởng đã hoàn tất mà không có hạn chế bổ sung. B3TR đã trả và quyền truy cập VeInvite của bạn vẫn giữ nguyên.',
  },
  'zh-tw': {
    reviewTitle: '獎勵發放後追加驗證中',
    reviewBody: '此邀請的獎勵已發放，但後續活動需要額外安全驗證。驗證期間，已發放的 B3TR 不會改變。',
    clearedTitle: '追加驗證已完成',
    clearedBody: '獎勵發放後的追加驗證已完成，沒有新增限制。已發放的 B3TR 與你的 VeInvite 使用狀態維持不變。',
  },
  sv: {
    reviewTitle: 'Extra granskning efter belöning',
    reviewBody: 'Den här referral-belöningen har redan betalats, men senare aktivitet behöver en extra säkerhetsgranskning. Redan utbetalda B3TR ändras inte under granskningen.',
    clearedTitle: 'Extra granskning klar',
    clearedBody: 'Granskningen efter belöningen är klar utan ytterligare begränsningar. Redan utbetalda B3TR och din VeInvite-åtkomst är oförändrade.',
  },
  ro: {
    reviewTitle: 'Verificare suplimentară după recompensă',
    reviewBody: 'Această recomandare a fost deja plătită, dar activitatea ulterioară necesită o verificare de securitate suplimentară. B3TR deja plătit nu se va modifica în timpul verificării.',
    clearedTitle: 'Verificarea suplimentară s-a încheiat',
    clearedBody: 'Verificarea de după recompensă s-a încheiat fără restricții suplimentare. B3TR deja plătit și accesul tău la VeInvite rămân neschimbate.',
  },
  ur: {
    reviewTitle: 'انعام کے بعد اضافی جائزہ',
    reviewBody: 'اس ریفرل کا انعام پہلے ہی ادا ہو چکا ہے، لیکن بعد کی سرگرمی کے لیے اضافی سیکیورٹی جائزہ درکار ہے۔ جائزے کے دوران پہلے سے ادا شدہ B3TR تبدیل نہیں ہوگا۔',
    clearedTitle: 'اضافی جائزہ مکمل',
    clearedBody: 'انعام کے بعد کا جائزہ کسی اضافی پابندی کے بغیر مکمل ہوگیا۔ پہلے سے ادا شدہ B3TR اور آپ کی VeInvite رسائی برقرار ہے۔',
  },
  pcm: {
    reviewTitle: 'Extra check after reward',
    reviewBody: 'This referral reward don already pay, but later activity need extra security check. B3TR wey don pay no go change while the review dey happen.',
    clearedTitle: 'Extra check don finish',
    clearedBody: 'The check after reward don finish without extra restriction. B3TR wey don pay and your VeInvite access no change.',
  },
  arz: {
    reviewTitle: 'مراجعة إضافية بعد دفع المكافأة',
    reviewBody: 'مكافأة الإحالة دي اتدفعت بالفعل، بس النشاط اللي حصل بعدها محتاج مراجعة أمان إضافية. الـ B3TR اللي اتدفع مش هيتغير أثناء المراجعة.',
    clearedTitle: 'المراجعة الإضافية خلصت',
    clearedBody: 'مراجعة ما بعد المكافأة خلصت من غير قيود إضافية. الـ B3TR اللي اتدفع وحالة استخدام VeInvite زي ما هما.',
  },
  mr: {
    reviewTitle: 'रिवॉर्डनंतर अतिरिक्त तपासणी',
    reviewBody: 'या रेफरलचे रिवॉर्ड आधीच दिले गेले आहे, पण नंतरच्या हालचालींसाठी अतिरिक्त सुरक्षा तपासणी आवश्यक आहे. तपासणीदरम्यान आधीच दिलेला B3TR बदलणार नाही.',
    clearedTitle: 'अतिरिक्त तपासणी पूर्ण',
    clearedBody: 'रिवॉर्डनंतरची तपासणी कोणत्याही अतिरिक्त निर्बंधाशिवाय पूर्ण झाली. आधीच दिलेला B3TR आणि तुमचा VeInvite प्रवेश बदललेला नाही.',
  },
  te: {
    reviewTitle: 'రివార్డ్ తర్వాత అదనపు సమీక్ష',
    reviewBody: 'ఈ రిఫరల్ రివార్డ్ ఇప్పటికే చెల్లించబడింది, కానీ తర్వాతి కార్యకలాపానికి అదనపు భద్రతా సమీక్ష అవసరం. సమీక్ష సమయంలో ఇప్పటికే చెల్లించిన B3TR మారదు.',
    clearedTitle: 'అదనపు సమీక్ష పూర్తైంది',
    clearedBody: 'రివార్డ్ తర్వాత సమీక్ష అదనపు పరిమితులు లేకుండా పూర్తైంది. ఇప్పటికే చెల్లించిన B3TR మరియు మీ VeInvite యాక్సెస్ మారలేదు.',
  },
  sw: {
    reviewTitle: 'Ukaguzi wa ziada baada ya zawadi',
    reviewBody: 'Rufaa hii tayari imelipwa, lakini shughuli ya baadaye inahitaji ukaguzi wa ziada wa usalama. B3TR iliyolipwa tayari haitabadilika wakati wa ukaguzi.',
    clearedTitle: 'Ukaguzi wa ziada umekamilika',
    clearedBody: 'Ukaguzi baada ya zawadi umekamilika bila kizuizi cha ziada. B3TR iliyolipwa tayari na ufikiaji wako wa VeInvite havijabadilika.',
  },
  ha: {
    reviewTitle: 'Ƙarin dubawa bayan lada',
    reviewBody: 'An riga an biya ladan wannan referral, amma ayyukan da suka biyo baya suna buƙatar ƙarin binciken tsaro. B3TR da aka riga aka biya ba zai canza yayin dubawa ba.',
    clearedTitle: 'An kammala ƙarin dubawa',
    clearedBody: 'An kammala dubawar bayan lada ba tare da ƙarin takurawa ba. B3TR da aka riga aka biya da damar VeInvite ɗinka ba su canza ba.',
  },
  el: {
    reviewTitle: 'Πρόσθετος έλεγχος μετά την ανταμοιβή',
    reviewBody: 'Η ανταμοιβή αυτής της παραπομπής έχει ήδη πληρωθεί, αλλά μεταγενέστερη δραστηριότητα χρειάζεται πρόσθετο έλεγχο ασφαλείας. Τα B3TR που έχουν ήδη πληρωθεί δεν θα αλλάξουν κατά τον έλεγχο.',
    clearedTitle: 'Ο πρόσθετος έλεγχος ολοκληρώθηκε',
    clearedBody: 'Ο έλεγχος μετά την ανταμοιβή ολοκληρώθηκε χωρίς πρόσθετο περιορισμό. Τα B3TR που έχουν ήδη πληρωθεί και η πρόσβασή σου στο VeInvite παραμένουν αμετάβλητα.',
  },
  cs: {
    reviewTitle: 'Dodatečná kontrola po odměně',
    reviewBody: 'Toto doporučení již bylo vyplaceno, ale pozdější aktivita vyžaduje dodatečnou bezpečnostní kontrolu. Již vyplacené B3TR se během kontroly nezmění.',
    clearedTitle: 'Dodatečná kontrola dokončena',
    clearedBody: 'Kontrola po odměně byla dokončena bez dalšího omezení. Již vyplacené B3TR i váš přístup k VeInvite zůstávají beze změny.',
  },
};
