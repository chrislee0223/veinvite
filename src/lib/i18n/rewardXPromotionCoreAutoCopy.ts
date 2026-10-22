import type { RewardXPromotionCopy } from './rewardXPromotionCopy';

type AutoCopy = Pick<
  RewardXPromotionCopy,
  | 'connectX'
  | 'connectedX'
  | 'autoConnectBody'
  | 'autoOpenBody'
  | 'autoGraceBody'
  | 'autoConnectedX'
>;

export const REWARD_X_PROMOTION_CORE_AUTO_COPY: Record<
  | 'zh'
  | 'zh-tw'
  | 'ja'
  | 'es'
  | 'de'
  | 'fr'
  | 'it'
  | 'tr'
  | 'nl'
  | 'pt'
  | 'ru'
  | 'id'
  | 'vi',
  AutoCopy
> = {
  zh: {
    connectX: '连接 X 账号',
    connectedX: 'X 账号已连接。在自动验证完全启用前，你仍可提交帖子链接。',
    autoConnectBody: '请先连接你的公开 X 账号，然后在 24 小时内分享。无需另外提交帖子 URL。',
    autoOpenBody: '请在 24 小时内分享到 X。VeInvite 会自动查找并验证公开帖文。请至少保持公开 24 小时；验证通过后才会发放奖励。',
    autoGraceBody: '分享时间已结束。VeInvite 正在自动检查截止时间前发布的帖文。请保持帖文公开，直到 24 小时验证完成。',
    autoConnectedX: 'X 账号已连接。你的公开帖文会自动检查，无需提交 URL。',
  },
  'zh-tw': {
    connectX: '連接 X 帳號',
    connectedX: 'X 帳號已連接。在自動驗證完全啟用前，你仍可提交貼文連結。',
    autoConnectBody: '請先連接你的公開 X 帳號，然後在 24 小時內分享。無需另外提交貼文 URL。',
    autoOpenBody: '請在 24 小時內分享到 X。VeInvite 會自動尋找並驗證公開貼文。請至少保持公開 24 小時；驗證通過後才會發放獎勵。',
    autoGraceBody: '分享時間已結束。VeInvite 正在自動檢查截止時間前發布的貼文。請保持貼文公開，直到 24 小時驗證完成。',
    autoConnectedX: 'X 帳號已連接。你的公開貼文會自動檢查，無需提交 URL。',
  },
  ja: {
    connectX: 'Xアカウントを連携',
    connectedX: 'Xアカウントを連携しました。自動確認が完全に有効になるまでは投稿URLも提出できます。',
    autoConnectBody: 'まず公開Xアカウントを連携してください。その後24時間以内に共有すれば、投稿URLを別途提出する必要はありません。',
    autoOpenBody: '24時間以内にXへ共有してください。VeInviteが公開ポストを自動で探して確認します。24時間以上公開を維持し、確認後にボーナスが支払われます。',
    autoGraceBody: '共有期限は終了しました。VeInviteが期限内に公開されたポストを自動確認しています。24時間の確認が終わるまで公開を維持してください。',
    autoConnectedX: 'Xアカウントを連携しました。公開ポストは自動確認されるため、URLの提出は不要です。',
  },
  es: {
    connectX: 'Conectar cuenta de X',
    connectedX: 'Cuenta de X conectada. Aún puedes enviar el enlace hasta que la verificación automática esté completamente activa.',
    autoConnectBody: 'Conecta primero tu cuenta pública de X y comparte dentro de 24 horas. No tendrás que enviar la URL de la publicación.',
    autoOpenBody: 'Comparte en X dentro de 24 horas. VeInvite buscará y verificará automáticamente la publicación pública. Mantenla pública al menos 24 horas; el bono se paga solo después de la verificación.',
    autoGraceBody: 'El plazo para compartir terminó. VeInvite está comprobando automáticamente las publicaciones hechas antes de la fecha límite. Mantenla pública hasta que termine la verificación de 24 horas.',
    autoConnectedX: 'Cuenta de X conectada. Tu publicación pública se comprobará automáticamente; no hace falta enviar la URL.',
  },
  de: {
    connectX: 'X-Konto verbinden',
    connectedX: 'X-Konto verbunden. Bis die automatische Prüfung vollständig aktiv ist, kannst du den Post-Link weiterhin einreichen.',
    autoConnectBody: 'Verbinde zuerst dein öffentliches X-Konto und teile dann innerhalb von 24 Stunden. Eine separate Post-URL ist nicht nötig.',
    autoOpenBody: 'Teile innerhalb von 24 Stunden auf X. VeInvite findet und prüft den öffentlichen Post automatisch. Lass ihn mindestens 24 Stunden öffentlich; der Bonus wird erst nach der Prüfung ausgezahlt.',
    autoGraceBody: 'Das Zeitfenster ist abgelaufen. VeInvite prüft automatisch Posts, die vor Ablauf der Frist veröffentlicht wurden. Lass den Post öffentlich, bis die 24-Stunden-Prüfung abgeschlossen ist.',
    autoConnectedX: 'X-Konto verbunden. Dein öffentlicher Post wird automatisch geprüft; eine URL-Einreichung ist nicht nötig.',
  },
  fr: {
    connectX: 'Connecter le compte X',
    connectedX: 'Compte X connecté. Vous pouvez encore envoyer le lien du post jusqu’à l’activation complète de la vérification automatique.',
    autoConnectBody: 'Connectez d’abord votre compte X public, puis partagez dans les 24 heures. Vous n’aurez pas à envoyer l’URL du post.',
    autoOpenBody: 'Partagez sur X dans les 24 heures. VeInvite trouvera et vérifiera automatiquement le post public. Gardez-le public au moins 24 heures ; le bonus n’est versé qu’après vérification.',
    autoGraceBody: 'La période de partage est terminée. VeInvite vérifie automatiquement les posts publiés avant la date limite. Gardez le post public jusqu’à la fin du contrôle de 24 heures.',
    autoConnectedX: 'Compte X connecté. Votre post public sera vérifié automatiquement ; aucune URL n’est à envoyer.',
  },
  it: {
    connectX: 'Collega account X',
    connectedX: 'Account X collegato. Puoi ancora inviare il link del post finché la verifica automatica non è pienamente attiva.',
    autoConnectBody: 'Collega prima il tuo account X pubblico, poi condividi entro 24 ore. Non dovrai inviare separatamente l’URL del post.',
    autoOpenBody: 'Condividi su X entro 24 ore. VeInvite troverà e verificherà automaticamente il post pubblico. Mantienilo pubblico per almeno 24 ore; il bonus viene pagato solo dopo la verifica.',
    autoGraceBody: 'La finestra di condivisione è terminata. VeInvite sta controllando automaticamente i post pubblicati prima della scadenza. Mantieni il post pubblico fino al termine della verifica di 24 ore.',
    autoConnectedX: 'Account X collegato. Il tuo post pubblico verrà verificato automaticamente; non serve inviare l’URL.',
  },
  tr: {
    connectX: 'X hesabını bağla',
    connectedX: 'X hesabın bağlandı. Otomatik doğrulama tamamen etkinleşene kadar gönderi bağlantısını yine de iletebilirsin.',
    autoConnectBody: 'Önce herkese açık X hesabını bağla, ardından 24 saat içinde paylaş. Gönderi URL’sini ayrıca göndermen gerekmeyecek.',
    autoOpenBody: '24 saat içinde X’te paylaş. VeInvite herkese açık gönderiyi otomatik olarak bulup kontrol edecek. En az 24 saat açık tut; bonus yalnızca doğrulamadan sonra ödenir.',
    autoGraceBody: 'Paylaşım süresi bitti. VeInvite son tarihten önce yayınlanan gönderileri otomatik olarak kontrol ediyor. 24 saatlik doğrulama tamamlanana kadar gönderiyi açık tut.',
    autoConnectedX: 'X hesabın bağlandı. Herkese açık gönderin otomatik kontrol edilecek; URL göndermen gerekmiyor.',
  },
  nl: {
    connectX: 'X-account koppelen',
    connectedX: 'X-account gekoppeld. Je kunt de postlink nog indienen totdat automatische verificatie volledig actief is.',
    autoConnectBody: 'Koppel eerst je openbare X-account en deel daarna binnen 24 uur. Je hoeft de post-URL niet apart in te dienen.',
    autoOpenBody: 'Deel binnen 24 uur op X. VeInvite zoekt en controleert de openbare post automatisch. Houd hem minstens 24 uur openbaar; de bonus wordt pas na verificatie betaald.',
    autoGraceBody: 'De deelperiode is voorbij. VeInvite controleert automatisch posts die vóór de deadline zijn geplaatst. Houd de post openbaar tot de 24-uurscontrole is afgerond.',
    autoConnectedX: 'X-account gekoppeld. Je openbare post wordt automatisch gecontroleerd; je hoeft geen URL in te dienen.',
  },
  pt: {
    connectX: 'Conectar conta do X',
    connectedX: 'Conta do X conectada. Você ainda pode enviar o link da publicação até a verificação automática estar totalmente ativa.',
    autoConnectBody: 'Conecte primeiro sua conta pública do X e compartilhe em até 24 horas. Não será necessário enviar a URL da publicação.',
    autoOpenBody: 'Compartilhe no X em até 24 horas. O VeInvite encontrará e verificará automaticamente a publicação pública. Mantenha-a pública por pelo menos 24 horas; o bônus só é pago após a verificação.',
    autoGraceBody: 'O prazo de compartilhamento terminou. O VeInvite está verificando automaticamente publicações feitas antes do limite. Mantenha a publicação pública até concluir a verificação de 24 horas.',
    autoConnectedX: 'Conta do X conectada. Sua publicação pública será verificada automaticamente; não é necessário enviar a URL.',
  },
  ru: {
    connectX: 'Подключить аккаунт X',
    connectedX: 'Аккаунт X подключён. Пока автоматическая проверка не включена полностью, ссылку на пост всё ещё можно отправить.',
    autoConnectBody: 'Сначала подключите публичный аккаунт X, затем поделитесь постом в течение 24 часов. Отдельно отправлять URL поста не потребуется.',
    autoOpenBody: 'Поделитесь в X в течение 24 часов. VeInvite автоматически найдёт и проверит публичный пост. Оставьте его публичным минимум на 24 часа; бонус выплачивается только после проверки.',
    autoGraceBody: 'Срок публикации истёк. VeInvite автоматически проверяет посты, опубликованные до дедлайна. Оставьте пост публичным до завершения 24-часовой проверки.',
    autoConnectedX: 'Аккаунт X подключён. Публичный пост будет проверен автоматически; отправлять URL не нужно.',
  },
  id: {
    connectX: 'Hubungkan akun X',
    connectedX: 'Akun X terhubung. Kamu masih bisa mengirim tautan post sampai pemeriksaan otomatis aktif sepenuhnya.',
    autoConnectBody: 'Hubungkan akun X publik terlebih dahulu, lalu bagikan dalam 24 jam. Kamu tidak perlu mengirim URL post secara terpisah.',
    autoOpenBody: 'Bagikan di X dalam 24 jam. VeInvite akan mencari dan memeriksa post publik secara otomatis. Biarkan tetap publik setidaknya 24 jam; bonus dibayar setelah verifikasi.',
    autoGraceBody: 'Waktu berbagi telah berakhir. VeInvite sedang memeriksa otomatis post yang diterbitkan sebelum batas waktu. Biarkan post tetap publik sampai pemeriksaan 24 jam selesai.',
    autoConnectedX: 'Akun X terhubung. Post publikmu akan diperiksa otomatis; URL tidak perlu dikirim.',
  },
  vi: {
    connectX: 'Kết nối tài khoản X',
    connectedX: 'Tài khoản X đã kết nối. Bạn vẫn có thể gửi liên kết bài đăng cho đến khi xác minh tự động hoạt động đầy đủ.',
    autoConnectBody: 'Trước tiên hãy kết nối tài khoản X công khai, sau đó chia sẻ trong vòng 24 giờ. Bạn sẽ không cần gửi riêng URL bài đăng.',
    autoOpenBody: 'Chia sẻ lên X trong vòng 24 giờ. VeInvite sẽ tự động tìm và kiểm tra bài đăng công khai. Hãy giữ bài đăng công khai ít nhất 24 giờ; phần thưởng chỉ được trả sau khi xác minh.',
    autoGraceBody: 'Thời gian chia sẻ đã kết thúc. VeInvite đang tự động kiểm tra các bài đăng được đăng trước hạn. Hãy giữ bài đăng công khai cho đến khi hoàn tất xác minh 24 giờ.',
    autoConnectedX: 'Tài khoản X đã kết nối. Bài đăng công khai của bạn sẽ được kiểm tra tự động; không cần gửi URL.',
  },
};
