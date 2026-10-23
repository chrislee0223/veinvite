import type { SupportedLocale } from './locales';
import { REWARD_X_PROMOTION_EXPANDED_AUTO_COPY } from './rewardXPromotionExpandedAutoCopy';

export type RewardXPromotionAutoCopy = {
  connectX: string;
  connectedX: string;
  autoConnectBody: string;
  autoOpenBody: string;
  autoGraceBody: string;
  autoConnectedX: string;
  autoShareFollowupBody: string;
};

const REWARD_X_PROMOTION_PRIMARY_AUTO_COPY = {
  en: {
    connectX: 'Connect X account',
    connectedX: 'X account connected. You can still submit the post link while automatic checks are being tested.',
    autoConnectBody: 'Connect your public X account first. Then share the post within 24 hours. No post URL is needed.',
    autoOpenBody: 'Share to X within 24 hours. VeInvite will look for the post automatically. Keep it public for at least 24 hours; the bonus is paid only after verification.',
    autoGraceBody: 'The sharing window has ended. VeInvite is checking posts shared before the deadline automatically. Keep your post public until the 24-hour verification finishes.',
    autoConnectedX: 'X account connected. Your public post will be checked automatically; no link submission is needed.',
    autoShareFollowupBody: 'Your X post will be checked automatically. No URL submission is needed. Keep the post public until the 24-hour verification finishes.',
  },
  ko: {
    connectX: 'X 계정 연결',
    connectedX: 'X 계정이 연결됐어요. 자동 검증이 준비되는 동안에는 게시물 링크를 직접 제출할 수도 있어요.',
    autoConnectBody: '먼저 공개 X 계정을 연결해 주세요. 그런 다음 24시간 안에 공유하면 게시물 URL을 따로 제출할 필요가 없어요.',
    autoOpenBody: '24시간 안에 X에 공유해 주세요. VeInvite가 공개 게시물을 자동으로 찾아요. 24시간 이상 공개 상태를 유지하면 검증 후 추가 보상이 지급돼요.',
    autoGraceBody: '공유 가능 시간이 끝났어요. VeInvite가 기한 안에 게시된 글을 자동 확인 중이에요. 24시간 검증이 끝날 때까지 게시물을 공개 상태로 유지해 주세요.',
    autoConnectedX: 'X 계정이 연결됐어요. 공개 게시물은 자동 확인되므로 링크를 제출하지 않아도 돼요.',
    autoShareFollowupBody: 'VeInvite가 X 게시물을 자동으로 확인해요. URL을 따로 제출할 필요는 없어요. 24시간 검증이 끝날 때까지 게시물을 공개 상태로 유지해 주세요.',
  },
  zh: {
    connectX: '连接 X 账号',
    connectedX: 'X 账号已连接。自动验证测试期间仍可手动提交帖文链接。',
    autoConnectBody: '请先连接你的公开 X 账号，然后在 24 小时内分享。无需提交帖文 URL。',
    autoOpenBody: '请在 24 小时内分享到 X。VeInvite 会自动查找公开帖文。请至少保持公开 24 小时，验证通过后才会发放奖励。',
    autoGraceBody: '分享时间已结束。VeInvite 正在自动检查截止时间前发布的帖文。请保持帖文公开，直到 24 小时验证完成。',
    autoConnectedX: 'X 账号已连接。公开帖文会自动检查，无需提交链接。',
    autoShareFollowupBody: 'VeInvite 会自动检查你的 X 帖文，无需提交 URL。请保持帖文公开，直到 24 小时验证完成。',
  },
  hi: {
    connectX: 'X अकाउंट कनेक्ट करें',
    connectedX: 'X अकाउंट कनेक्ट है। ऑटोमैटिक जाँच के परीक्षण के दौरान आप पोस्ट लिंक अभी भी जमा कर सकते हैं।',
    autoConnectBody: 'पहले अपना सार्वजनिक X अकाउंट कनेक्ट करें। फिर 24 घंटे के भीतर पोस्ट शेयर करें। पोस्ट URL जमा करने की जरूरत नहीं है।',
    autoOpenBody: '24 घंटे के भीतर X पर शेयर करें। VeInvite सार्वजनिक पोस्ट अपने आप ढूँढेगा। पोस्ट को कम से कम 24 घंटे सार्वजनिक रखें; सत्यापन के बाद ही बोनस मिलेगा।',
    autoGraceBody: 'शेयर करने की समय-सीमा खत्म हो गई है। VeInvite समय-सीमा से पहले की पोस्ट अपने आप जाँच रहा है। 24 घंटे की जाँच पूरी होने तक पोस्ट सार्वजनिक रखें।',
    autoConnectedX: 'X अकाउंट कनेक्ट है। आपकी सार्वजनिक पोस्ट अपने आप जाँची जाएगी; लिंक जमा करने की जरूरत नहीं है।',
    autoShareFollowupBody: 'VeInvite आपकी X पोस्ट अपने आप जाँचेगा। URL जमा करने की जरूरत नहीं है। 24 घंटे की जाँच पूरी होने तक पोस्ट सार्वजनिक रखें।',
  },
  es: {
    connectX: 'Conectar cuenta de X',
    connectedX: 'Cuenta de X conectada. Mientras se prueba la verificación automática, aún puedes enviar el enlace de la publicación.',
    autoConnectBody: 'Primero conecta tu cuenta pública de X. Después comparte dentro de 24 horas. No hace falta enviar la URL de la publicación.',
    autoOpenBody: 'Comparte en X dentro de 24 horas. VeInvite buscará la publicación automáticamente. Mantenla pública al menos 24 horas; el bono se paga solo tras la verificación.',
    autoGraceBody: 'La ventana para compartir terminó. VeInvite está comprobando automáticamente las publicaciones hechas antes del límite. Mantén tu publicación pública hasta terminar la verificación de 24 horas.',
    autoConnectedX: 'Cuenta de X conectada. Tu publicación pública se comprobará automáticamente; no hace falta enviar el enlace.',
    autoShareFollowupBody: 'VeInvite comprobará tu publicación de X automáticamente. No hace falta enviar la URL. Mantenla pública hasta terminar la verificación de 24 horas.',
  },
  ja: {
    connectX: 'Xアカウントを連携',
    connectedX: 'Xアカウントを連携しました。自動確認のテスト中は投稿リンクを手動で送信することもできます。',
    autoConnectBody: '最初に公開Xアカウントを連携してください。その後24時間以内に共有してください。投稿URLの送信は不要です。',
    autoOpenBody: '24時間以内にXへ共有してください。VeInviteが公開ポストを自動で探します。24時間以上公開状態を保ち、確認後にボーナスが支払われます。',
    autoGraceBody: '共有期限は終了しました。VeInviteが期限内に公開されたポストを自動確認しています。24時間の確認が終わるまで公開状態を維持してください。',
    autoConnectedX: 'Xアカウントを連携しました。公開ポストは自動確認されるため、リンク送信は不要です。',
    autoShareFollowupBody: 'VeInviteがXの公開ポストを自動確認します。URLの送信は不要です。24時間の確認が終わるまで公開状態を維持してください。',
  },
  it: {
    connectX: 'Collega account X',
    connectedX: 'Account X collegato. Durante i test dei controlli automatici puoi ancora inviare manualmente il link del post.',
    autoConnectBody: 'Collega prima il tuo account X pubblico, poi condividi entro 24 ore. Non serve inviare l’URL del post.',
    autoOpenBody: 'Condividi su X entro 24 ore. VeInvite cercherà automaticamente il post pubblico. Mantienilo pubblico per almeno 24 ore; il bonus viene pagato solo dopo la verifica.',
    autoGraceBody: 'La finestra di condivisione è terminata. VeInvite sta controllando automaticamente i post pubblicati prima della scadenza. Mantieni il post pubblico fino al termine della verifica di 24 ore.',
    autoConnectedX: 'Account X collegato. Il post pubblico verrà controllato automaticamente; non serve inviare il link.',
    autoShareFollowupBody: 'VeInvite controllerà automaticamente il tuo post X. Non serve inviare l’URL. Mantieni il post pubblico fino al termine della verifica di 24 ore.',
  },
  tr: {
    connectX: 'X hesabını bağla',
    connectedX: 'X hesabı bağlandı. Otomatik kontroller test edilirken gönderi bağlantısını yine de elle gönderebilirsin.',
    autoConnectBody: 'Önce herkese açık X hesabını bağla. Ardından 24 saat içinde paylaş. Gönderi URL’si göndermene gerek yok.',
    autoOpenBody: '24 saat içinde X’te paylaş. VeInvite gönderiyi otomatik olarak bulacak. En az 24 saat herkese açık tut; bonus yalnızca doğrulamadan sonra ödenir.',
    autoGraceBody: 'Paylaşım süresi sona erdi. VeInvite son tarihten önce paylaşılan gönderileri otomatik olarak kontrol ediyor. 24 saatlik doğrulama bitene kadar gönderini herkese açık tut.',
    autoConnectedX: 'X hesabı bağlandı. Herkese açık gönderin otomatik kontrol edilecek; bağlantı göndermene gerek yok.',
    autoShareFollowupBody: 'VeInvite X gönderini otomatik kontrol edecek. URL göndermene gerek yok. 24 saatlik doğrulama bitene kadar gönderiyi herkese açık tut.',
  },
  nl: {
    connectX: 'X-account koppelen',
    connectedX: 'X-account gekoppeld. Tijdens de test van automatische controles kun je de postlink nog handmatig indienen.',
    autoConnectBody: 'Koppel eerst je openbare X-account. Deel daarna binnen 24 uur. Je hoeft geen post-URL in te dienen.',
    autoOpenBody: 'Deel binnen 24 uur op X. VeInvite zoekt de openbare post automatisch. Houd hem minstens 24 uur openbaar; de bonus wordt pas na verificatie betaald.',
    autoGraceBody: 'De deelperiode is voorbij. VeInvite controleert automatisch posts die vóór de deadline zijn geplaatst. Houd je post openbaar tot de 24-uurscontrole klaar is.',
    autoConnectedX: 'X-account gekoppeld. Je openbare post wordt automatisch gecontroleerd; je hoeft geen link in te dienen.',
    autoShareFollowupBody: 'VeInvite controleert je X-post automatisch. Je hoeft geen URL in te dienen. Houd de post openbaar tot de 24-uurscontrole klaar is.',
  },
  de: {
    connectX: 'X-Konto verbinden',
    connectedX: 'X-Konto verbunden. Während die automatische Prüfung getestet wird, kannst du den Post-Link weiterhin manuell einreichen.',
    autoConnectBody: 'Verbinde zuerst dein öffentliches X-Konto. Teile den Post dann innerhalb von 24 Stunden. Eine Post-URL musst du nicht einreichen.',
    autoOpenBody: 'Teile innerhalb von 24 Stunden auf X. VeInvite sucht den öffentlichen Post automatisch. Lass ihn mindestens 24 Stunden öffentlich; der Bonus wird erst nach der Prüfung ausgezahlt.',
    autoGraceBody: 'Das Zeitfenster ist abgelaufen. VeInvite prüft automatisch Posts, die vor der Frist veröffentlicht wurden. Lass deinen Post bis zum Abschluss der 24-Stunden-Prüfung öffentlich.',
    autoConnectedX: 'X-Konto verbunden. Dein öffentlicher Post wird automatisch geprüft; du musst keinen Link einreichen.',
    autoShareFollowupBody: 'VeInvite prüft deinen X-Post automatisch. Du musst keine URL einreichen. Lass den Post bis zum Abschluss der 24-Stunden-Prüfung öffentlich.',
  },
  fr: {
    connectX: 'Connecter le compte X',
    connectedX: 'Compte X connecté. Pendant les tests de vérification automatique, vous pouvez encore envoyer manuellement le lien du post.',
    autoConnectBody: 'Connectez d’abord votre compte X public, puis partagez dans les 24 heures. Il n’est pas nécessaire d’envoyer l’URL du post.',
    autoOpenBody: 'Partagez sur X dans les 24 heures. VeInvite recherchera automatiquement le post public. Gardez-le public au moins 24 heures ; le bonus n’est payé qu’après vérification.',
    autoGraceBody: 'La période de partage est terminée. VeInvite vérifie automatiquement les posts publiés avant la limite. Gardez votre post public jusqu’à la fin du contrôle des 24 heures.',
    autoConnectedX: 'Compte X connecté. Votre post public sera vérifié automatiquement ; aucun lien n’est à envoyer.',
    autoShareFollowupBody: 'VeInvite vérifiera automatiquement votre post X. Aucune URL n’est à envoyer. Gardez le post public jusqu’à la fin du contrôle des 24 heures.',
  },
  ar: {
    connectX: 'ربط حساب X',
    connectedX: 'تم ربط حساب X. أثناء اختبار الفحص التلقائي يمكنك أيضًا إرسال رابط المنشور يدويًا.',
    autoConnectBody: 'اربط حساب X العام أولًا، ثم شارك خلال 24 ساعة. لا حاجة إلى إرسال رابط المنشور.',
    autoOpenBody: 'شارك على X خلال 24 ساعة. سيبحث VeInvite عن المنشور العام تلقائيًا. أبقه عامًا لمدة 24 ساعة على الأقل؛ ولا تُدفع المكافأة إلا بعد التحقق.',
    autoGraceBody: 'انتهت مهلة المشاركة. يتحقق VeInvite تلقائيًا من المنشورات التي نُشرت قبل الموعد النهائي. أبقِ منشورك عامًا حتى يكتمل فحص 24 ساعة.',
    autoConnectedX: 'تم ربط حساب X. سيُفحص منشورك العام تلقائيًا؛ ولا حاجة إلى إرسال الرابط.',
    autoShareFollowupBody: 'سيتحقق VeInvite من منشور X تلقائيًا. لا حاجة إلى إرسال URL. أبقِ المنشور عامًا حتى يكتمل فحص 24 ساعة.',
  },
  bn: {
    connectX: 'X অ্যাকাউন্ট সংযুক্ত করুন',
    connectedX: 'X অ্যাকাউন্ট সংযুক্ত হয়েছে। স্বয়ংক্রিয় যাচাই পরীক্ষাধীন থাকলে আপনি পোস্টের লিংক হাতে জমা দিতে পারবেন।',
    autoConnectBody: 'প্রথমে আপনার পাবলিক X অ্যাকাউন্ট সংযুক্ত করুন। তারপর ২৪ ঘণ্টার মধ্যে শেয়ার করুন। পোস্টের URL জমা দিতে হবে না।',
    autoOpenBody: '২৪ ঘণ্টার মধ্যে X-এ শেয়ার করুন। VeInvite পাবলিক পোস্টটি স্বয়ংক্রিয়ভাবে খুঁজবে। অন্তত ২৪ ঘণ্টা পোস্টটি পাবলিক রাখুন; যাচাইয়ের পরেই বোনাস দেওয়া হবে।',
    autoGraceBody: 'শেয়ারের সময়সীমা শেষ হয়েছে। VeInvite সময়সীমার আগে প্রকাশিত পোস্টগুলো স্বয়ংক্রিয়ভাবে যাচাই করছে। ২৪ ঘণ্টার যাচাই শেষ না হওয়া পর্যন্ত পোস্টটি পাবলিক রাখুন।',
    autoConnectedX: 'X অ্যাকাউন্ট সংযুক্ত হয়েছে। আপনার পাবলিক পোস্ট স্বয়ংক্রিয়ভাবে যাচাই হবে; লিংক জমা দিতে হবে না।',
    autoShareFollowupBody: 'VeInvite আপনার X পোস্ট স্বয়ংক্রিয়ভাবে যাচাই করবে। URL জমা দিতে হবে না। ২৪ ঘণ্টার যাচাই শেষ না হওয়া পর্যন্ত পোস্টটি পাবলিক রাখুন।',
  },
  pt: {
    connectX: 'Conectar conta do X',
    connectedX: 'Conta do X conectada. Enquanto a verificação automática está em teste, você ainda pode enviar manualmente o link do post.',
    autoConnectBody: 'Conecte primeiro sua conta pública do X. Depois compartilhe em até 24 horas. Não é preciso enviar a URL do post.',
    autoOpenBody: 'Compartilhe no X em até 24 horas. O VeInvite procurará o post público automaticamente. Mantenha-o público por pelo menos 24 horas; o bônus só é pago após a verificação.',
    autoGraceBody: 'O prazo de compartilhamento terminou. O VeInvite está verificando automaticamente os posts publicados antes do limite. Mantenha seu post público até a verificação de 24 horas terminar.',
    autoConnectedX: 'Conta do X conectada. Seu post público será verificado automaticamente; não é preciso enviar o link.',
    autoShareFollowupBody: 'O VeInvite verificará seu post no X automaticamente. Não é preciso enviar a URL. Mantenha o post público até a verificação de 24 horas terminar.',
  },
  ru: {
    connectX: 'Подключить аккаунт X',
    connectedX: 'Аккаунт X подключен. Пока автоматическая проверка тестируется, ссылку на пост можно отправить вручную.',
    autoConnectBody: 'Сначала подключите публичный аккаунт X, затем поделитесь постом в течение 24 часов. URL поста отправлять не нужно.',
    autoOpenBody: 'Поделитесь в X в течение 24 часов. VeInvite автоматически найдёт публичный пост. Оставьте его публичным минимум на 24 часа; бонус выплачивается только после проверки.',
    autoGraceBody: 'Время публикации закончилось. VeInvite автоматически проверяет посты, опубликованные до срока. Оставьте пост публичным до завершения 24-часовой проверки.',
    autoConnectedX: 'Аккаунт X подключен. Публичный пост будет проверен автоматически; ссылку отправлять не нужно.',
    autoShareFollowupBody: 'VeInvite автоматически проверит ваш пост в X. URL отправлять не нужно. Оставьте пост публичным до завершения 24-часовой проверки.',
  },
} satisfies Record<
  | 'en'
  | 'ko'
  | 'zh'
  | 'hi'
  | 'es'
  | 'ja'
  | 'it'
  | 'tr'
  | 'nl'
  | 'de'
  | 'fr'
  | 'ar'
  | 'bn'
  | 'pt'
  | 'ru',
  RewardXPromotionAutoCopy
>;

export const REWARD_X_PROMOTION_AUTO_COPY: Record<
  SupportedLocale,
  RewardXPromotionAutoCopy
> = {
  ...REWARD_X_PROMOTION_PRIMARY_AUTO_COPY,
  ...REWARD_X_PROMOTION_EXPANDED_AUTO_COPY,
};
