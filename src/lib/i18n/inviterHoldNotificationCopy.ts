import type { SupportedLocale } from './locales';

export type InviterHoldNotificationCopy = {
  title: string;
  body: string;
};

export const INVITER_HOLD_NOTIFICATION_COPY: Record<
  SupportedLocale,
  InviterHoldNotificationCopy
> = {
  "en": {
    title: "Referral activity check",
    body: "Some recent referral activity needs additional verification. Your VeInvite access is not restricted, and you can continue normal invitations.",
  },
  "ko": {
    title: "초대 활동 확인 중",
    body: "최근 일부 초대 활동을 확인하고 있어요. 현재 이용 제한은 없고 평소처럼 계속 초대할 수 있어요.",
  },
  "zh": {
    title: "邀请活动额外核验",
    body: "近期部分邀请活动需要额外核验。目前你的 VeInvite 使用未受限制，可以继续正常邀请。",
  },
  "hi": {
    title: "रेफ़रल गतिविधि की अतिरिक्त जाँच",
    body: "हाल की कुछ रेफ़रल गतिविधि की अतिरिक्त जाँच आवश्यक है। अभी आपके VeInvite उपयोग पर कोई प्रतिबंध नहीं है और आप सामान्य आमंत्रण जारी रख सकते हैं।",
  },
  "es": {
    title: "Revisión adicional de invitaciones",
    body: "Parte de la actividad reciente de invitaciones necesita una verificación adicional. Tu acceso a VeInvite no está restringido y puedes seguir invitando normalmente.",
  },
  "ja": {
    title: "招待活動の追加確認",
    body: "最近の一部の招待活動について追加確認を行っています。現在 VeInvite の利用制限はなく、通常どおり招待を続けられます。",
  },
  "it": {
    title: "Verifica aggiuntiva degli inviti",
    body: "Alcune attività di invito recenti richiedono una verifica aggiuntiva. Il tuo accesso a VeInvite non è limitato e puoi continuare a invitare normalmente.",
  },
  "tr": {
    title: "Davet etkinliği ek kontrolü",
    body: "Yakın zamandaki bazı davet etkinlikleri ek doğrulama gerektiriyor. VeInvite erişimin şu anda kısıtlı değil ve normal davetlere devam edebilirsin.",
  },
  "nl": {
    title: "Extra controle van uitnodigingen",
    body: "Een deel van de recente uitnodigingsactiviteit heeft extra controle nodig. Je VeInvite-toegang is niet beperkt en je kunt normaal blijven uitnodigen.",
  },
  "de": {
    title: "Zusätzliche Prüfung der Einladungsaktivität",
    body: "Ein Teil der jüngsten Einladungsaktivität benötigt eine zusätzliche Prüfung. Dein VeInvite-Zugang ist derzeit nicht eingeschränkt und du kannst normal weiter einladen.",
  },
  "fr": {
    title: "Vérification supplémentaire des invitations",
    body: "Une partie de l’activité récente d’invitation nécessite une vérification supplémentaire. Votre accès à VeInvite n’est pas restreint et vous pouvez continuer à inviter normalement.",
  },
  "ar": {
    title: "تحقق إضافي من نشاط الدعوات",
    body: "بعض نشاط الدعوات الأخير يحتاج إلى تحقق إضافي. استخدامك لـ VeInvite غير مقيّد حاليًا ويمكنك متابعة الدعوات بشكل طبيعي.",
  },
  "bn": {
    title: "আমন্ত্রণ কার্যক্রমের অতিরিক্ত যাচাই",
    body: "সাম্প্রতিক কিছু আমন্ত্রণ কার্যক্রমের অতিরিক্ত যাচাই প্রয়োজন। বর্তমানে আপনার VeInvite ব্যবহারে কোনো সীমাবদ্ধতা নেই এবং স্বাভাবিকভাবে আমন্ত্রণ চালিয়ে যেতে পারেন।",
  },
  "pt": {
    title: "Verificação adicional das indicações",
    body: "Parte da atividade recente de convites precisa de verificação adicional. Seu acesso ao VeInvite não está restrito e você pode continuar convidando normalmente.",
  },
  "ru": {
    title: "Дополнительная проверка приглашений",
    body: "Некоторые недавние действия по приглашениям требуют дополнительной проверки. Доступ к VeInvite сейчас не ограничен, и вы можете продолжать обычные приглашения.",
  },
  "id": {
    title: "Pemeriksaan tambahan aktivitas undangan",
    body: "Sebagian aktivitas undangan terbaru memerlukan verifikasi tambahan. Akses VeInvite Anda tidak dibatasi dan Anda tetap dapat mengundang secara normal.",
  },
  "vi": {
    title: "Kiểm tra bổ sung hoạt động mời",
    body: "Một số hoạt động mời gần đây cần được xác minh thêm. Quyền truy cập VeInvite của bạn hiện không bị hạn chế và bạn vẫn có thể tiếp tục mời bình thường.",
  },
  "zh-tw": {
    title: "邀請活動額外驗證",
    body: "近期部分邀請活動需要額外驗證。目前你的 VeInvite 使用未受限制，可以繼續正常邀請。",
  },
  "sv": {
    title: "Extra kontroll av inbjudningsaktivitet",
    body: "Viss nylig inbjudningsaktivitet behöver extra verifiering. Din VeInvite-åtkomst är inte begränsad och du kan fortsätta bjuda in normalt.",
  },
  "ro": {
    title: "Verificare suplimentară a invitațiilor",
    body: "O parte din activitatea recentă de invitații necesită verificare suplimentară. Accesul tău la VeInvite nu este restricționat și poți continua invitațiile în mod normal.",
  },
  "ur": {
    title: "دعوتی سرگرمی کی اضافی جانچ",
    body: "حالیہ کچھ دعوتی سرگرمی کی اضافی تصدیق درکار ہے۔ فی الحال آپ کی VeInvite رسائی محدود نہیں ہے اور آپ معمول کے مطابق دعوتیں جاری رکھ سکتے ہیں۔",
  },
  "pcm": {
    title: "Extra check for invite activity",
    body: "Some recent invite activity need extra check. Your VeInvite access no restrict now, and you fit continue normal invitations.",
  },
  "arz": {
    title: "مراجعة إضافية لنشاط الدعوات",
    body: "في شوية نشاط دعوات حديث محتاج تحقق إضافي. استخدامك لـ VeInvite مش مقيّد دلوقتي وتقدر تكمل الدعوات بشكل طبيعي.",
  },
  "mr": {
    title: "आमंत्रण क्रियाकलापाची अतिरिक्त पडताळणी",
    body: "अलीकडील काही आमंत्रण क्रियाकलापांची अतिरिक्त पडताळणी आवश्यक आहे. सध्या तुमच्या VeInvite वापरावर मर्यादा नाही आणि तुम्ही नेहमीप्रमाणे आमंत्रणे देऊ शकता.",
  },
  "te": {
    title: "ఆహ్వాన కార్యకలాపానికి అదనపు తనిఖీ",
    body: "ఇటీవలి కొన్ని ఆహ్వాన కార్యకలాపాలకు అదనపు ధృవీకరణ అవసరం. ప్రస్తుతం మీ VeInvite వినియోగంపై పరిమితి లేదు మరియు సాధారణంగా ఆహ్వానాలు కొనసాగించవచ్చు.",
  },
  "sw": {
    title: "Ukaguzi wa ziada wa shughuli za mialiko",
    body: "Baadhi ya shughuli za hivi karibuni za mialiko zinahitaji uhakiki wa ziada. Ufikiaji wako wa VeInvite haujazuiwa na unaweza kuendelea kualika kawaida.",
  },
  "ha": {
    title: "Ƙarin duba ga ayyukan gayyata",
    body: "Wasu ayyukan gayyata na kwanan nan suna buƙatar ƙarin tantancewa. Ba a takaita amfani da VeInvite naka yanzu ba, kuma za ka iya ci gaba da gayyata yadda aka saba.",
  },
  "el": {
    title: "Πρόσθετος έλεγχος δραστηριότητας προσκλήσεων",
    body: "Μέρος της πρόσφατης δραστηριότητας προσκλήσεων χρειάζεται πρόσθετη επαλήθευση. Η πρόσβασή σας στο VeInvite δεν είναι περιορισμένη και μπορείτε να συνεχίσετε κανονικά τις προσκλήσεις.",
  },
  "cs": {
    title: "Dodatečná kontrola aktivity pozvánek",
    body: "Část nedávné aktivity pozvánek vyžaduje dodatečné ověření. Přístup k VeInvite není omezen a můžete dál normálně zvát.",
  },
};
