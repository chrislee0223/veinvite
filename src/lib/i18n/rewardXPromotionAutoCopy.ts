import type { RewardXPromotionCopy } from './rewardXPromotionCopy';

type AutoCopy = Required<
  Pick<
    RewardXPromotionCopy,
    | 'connectX'
    | 'connectedX'
    | 'autoConnectBody'
    | 'autoOpenBody'
    | 'autoShareFollowupBody'
    | 'autoGraceBody'
    | 'autoConnectedX'
  >
>;

export const REWARD_X_PROMOTION_AUTO_COPY = {
  zh: {
    connectX: '连接 X 账号',
    connectedX: 'X 账号已连接。自动验证完全启用前仍可提交帖子链接。',
    autoConnectBody: '请先连接你的公开 X 账号，然后在 24 小时内分享帖子。无需另行提交帖子 URL。',
    autoOpenBody: '请在 24 小时内分享到 X。VeInvite 会自动查找帖子。请至少保持公开 24 小时；只有验证通过后才会发放奖励。',
    autoShareFollowupBody: '发布到 X 后无需提交 URL。请至少保持帖子公开 24 小时；VeInvite 会自动检查并在验证通过后发放奖励。',
    autoGraceBody: '分享时间已结束。VeInvite 正在自动检查截止时间前发布的帖子。请保持帖子公开，直到 24 小时验证完成。',
    autoConnectedX: 'X 账号已连接。公开帖子会自动检查，无需提交链接。',
  },
  es: {
    connectX: 'Conectar cuenta de X',
    connectedX: 'Cuenta de X conectada. Aún puedes enviar el enlace mientras se activa por completo la verificación automática.',
    autoConnectBody: 'Conecta primero tu cuenta pública de X y comparte la publicación en un plazo de 24 horas. No tendrás que enviar la URL.',
    autoOpenBody: 'Comparte en X en un plazo de 24 horas. VeInvite buscará la publicación automáticamente. Mantenla pública al menos 24 horas; el bono solo se paga tras la verificación.',
    autoShareFollowupBody: 'Después de publicar en X no necesitas enviar la URL. Mantén la publicación pública al menos 24 horas; VeInvite la comprobará automáticamente y pagará el bono tras verificarla.',
    autoGraceBody: 'El plazo para compartir terminó. VeInvite está comprobando automáticamente las publicaciones hechas antes de la fecha límite. Mantén la publicación pública hasta finalizar la verificación de 24 horas.',
    autoConnectedX: 'Cuenta de X conectada. Tu publicación pública se comprobará automáticamente; no necesitas enviar el enlace.',
  },
  ja: {
    connectX: 'Xアカウントを連携',
    connectedX: 'Xアカウントを連携しました。自動確認が完全に有効になるまでは投稿リンクも提出できます。',
    autoConnectBody: 'まず公開Xアカウントを連携し、24時間以内に投稿を共有してください。投稿URLを別途提出する必要はありません。',
    autoOpenBody: '24時間以内にXへ共有してください。VeInviteが投稿を自動で探します。少なくとも24時間公開状態を維持し、確認後にのみボーナスが支払われます。',
    autoShareFollowupBody: 'Xへ投稿した後はURL提出は不要です。少なくとも24時間公開状態を維持すると、VeInviteが自動確認し、検証後にボーナスを支払います。',
    autoGraceBody: '共有時間は終了しました。VeInviteが期限内に共有された投稿を自動確認しています。24時間の確認が終わるまで公開状態を維持してください。',
    autoConnectedX: 'Xアカウントを連携しました。公開投稿は自動確認されるため、リンク提出は不要です。',
  },
  it: {
    connectX: 'Collega account X',
    connectedX: 'Account X collegato. Puoi ancora inviare il link del post mentre la verifica automatica viene attivata.',
    autoConnectBody: 'Collega prima il tuo account X pubblico, poi condividi il post entro 24 ore. Non dovrai inviare l’URL del post.',
    autoOpenBody: 'Condividi su X entro 24 ore. VeInvite cercherà automaticamente il post. Mantienilo pubblico per almeno 24 ore; il bonus viene pagato solo dopo la verifica.',
    autoShareFollowupBody: 'Dopo aver pubblicato su X non serve inviare l’URL. Mantieni il post pubblico per almeno 24 ore; VeInvite lo controllerà automaticamente e pagherà il bonus dopo la verifica.',
    autoGraceBody: 'Il periodo di condivisione è terminato. VeInvite controlla automaticamente i post pubblicati prima della scadenza. Mantieni il post pubblico fino al termine della verifica di 24 ore.',
    autoConnectedX: 'Account X collegato. Il tuo post pubblico verrà controllato automaticamente; non serve inviare il link.',
  },
  tr: {
    connectX: 'X hesabını bağla',
    connectedX: 'X hesabın bağlandı. Otomatik kontrol tamamen etkinleşene kadar gönderi bağlantısını da iletebilirsin.',
    autoConnectBody: 'Önce herkese açık X hesabını bağla, ardından gönderiyi 24 saat içinde paylaş. Gönderi URL’sini ayrıca göndermen gerekmeyecek.',
    autoOpenBody: '24 saat içinde X’te paylaş. VeInvite gönderiyi otomatik bulacak. En az 24 saat herkese açık tut; bonus yalnızca doğrulamadan sonra ödenir.',
    autoShareFollowupBody: 'X’te paylaşım yaptıktan sonra URL göndermene gerek yok. Gönderiyi en az 24 saat herkese açık tut; VeInvite otomatik kontrol edip doğrulamadan sonra bonusu öder.',
    autoGraceBody: 'Paylaşım süresi sona erdi. VeInvite son tarihten önce paylaşılan gönderileri otomatik kontrol ediyor. 24 saatlik doğrulama bitene kadar gönderiyi herkese açık tut.',
    autoConnectedX: 'X hesabın bağlandı. Herkese açık gönderin otomatik kontrol edilir; bağlantı göndermene gerek yok.',
  },
  nl: {
    connectX: 'X-account koppelen',
    connectedX: 'X-account gekoppeld. Je kunt de postlink nog indienen terwijl automatische controle volledig wordt ingeschakeld.',
    autoConnectBody: 'Koppel eerst je openbare X-account en deel daarna de post binnen 24 uur. Je hoeft de post-URL niet apart in te dienen.',
    autoOpenBody: 'Deel binnen 24 uur op X. VeInvite zoekt de post automatisch. Houd hem minstens 24 uur openbaar; de bonus wordt pas na verificatie betaald.',
    autoShareFollowupBody: 'Na het plaatsen op X hoef je geen URL in te dienen. Houd de post minstens 24 uur openbaar; VeInvite controleert hem automatisch en betaalt de bonus na verificatie.',
    autoGraceBody: 'De deelperiode is voorbij. VeInvite controleert automatisch posts die vóór de deadline zijn gedeeld. Houd je post openbaar tot de 24-uurscontrole klaar is.',
    autoConnectedX: 'X-account gekoppeld. Je openbare post wordt automatisch gecontroleerd; je hoeft geen link in te dienen.',
  },
  de: {
    connectX: 'X-Konto verbinden',
    connectedX: 'X-Konto verbunden. Du kannst den Post-Link weiterhin einreichen, bis die automatische Prüfung vollständig aktiv ist.',
    autoConnectBody: 'Verbinde zuerst dein öffentliches X-Konto und teile den Post dann innerhalb von 24 Stunden. Du musst keine Post-URL separat einreichen.',
    autoOpenBody: 'Teile innerhalb von 24 Stunden auf X. VeInvite sucht den Post automatisch. Lass ihn mindestens 24 Stunden öffentlich; der Bonus wird erst nach der Prüfung ausgezahlt.',
    autoShareFollowupBody: 'Nach dem Posten auf X musst du keine URL einreichen. Lass den Post mindestens 24 Stunden öffentlich; VeInvite prüft ihn automatisch und zahlt den Bonus nach der Verifizierung aus.',
    autoGraceBody: 'Das Zeitfenster ist abgelaufen. VeInvite prüft automatisch Posts, die vor der Frist geteilt wurden. Lass deinen Post bis zum Abschluss der 24-Stunden-Prüfung öffentlich.',
    autoConnectedX: 'X-Konto verbunden. Dein öffentlicher Post wird automatisch geprüft; du musst keinen Link einreichen.',
  },
  fr: {
    connectX: 'Connecter le compte X',
    connectedX: 'Compte X connecté. Vous pouvez encore envoyer le lien du post pendant l’activation complète de la vérification automatique.',
    autoConnectBody: 'Connectez d’abord votre compte X public, puis partagez le post dans les 24 heures. Vous n’aurez pas à envoyer l’URL du post.',
    autoOpenBody: 'Partagez sur X dans les 24 heures. VeInvite recherchera automatiquement le post. Gardez-le public au moins 24 heures ; le bonus n’est versé qu’après vérification.',
    autoShareFollowupBody: 'Après publication sur X, vous n’avez pas besoin d’envoyer l’URL. Gardez le post public au moins 24 heures ; VeInvite le vérifiera automatiquement et versera le bonus après validation.',
    autoGraceBody: 'La période de partage est terminée. VeInvite vérifie automatiquement les posts publiés avant la date limite. Gardez votre post public jusqu’à la fin du contrôle de 24 heures.',
    autoConnectedX: 'Compte X connecté. Votre post public sera vérifié automatiquement ; aucun lien à envoyer.',
  },
  pt: {
    connectX: 'Conectar conta do X',
    connectedX: 'Conta do X conectada. Você ainda pode enviar o link do post enquanto a verificação automática é ativada por completo.',
    autoConnectBody: 'Conecte primeiro sua conta pública do X e compartilhe o post em até 24 horas. Não será necessário enviar o URL do post.',
    autoOpenBody: 'Compartilhe no X em até 24 horas. O VeInvite localizará o post automaticamente. Mantenha-o público por pelo menos 24 horas; o bônus só é pago após a verificação.',
    autoShareFollowupBody: 'Depois de publicar no X, não é preciso enviar o URL. Mantenha o post público por pelo menos 24 horas; o VeInvite fará a verificação automática e pagará o bônus após a confirmação.',
    autoGraceBody: 'O prazo de compartilhamento terminou. O VeInvite verifica automaticamente os posts publicados antes do prazo. Mantenha seu post público até a conclusão da verificação de 24 horas.',
    autoConnectedX: 'Conta do X conectada. Seu post público será verificado automaticamente; não é preciso enviar o link.',
  },
  ru: {
    connectX: 'Подключить аккаунт X',
    connectedX: 'Аккаунт X подключён. Пока автоматическая проверка полностью не включена, вы всё ещё можете отправить ссылку на пост.',
    autoConnectBody: 'Сначала подключите публичный аккаунт X, затем поделитесь постом в течение 24 часов. Отдельно отправлять URL поста не потребуется.',
    autoOpenBody: 'Поделитесь в X в течение 24 часов. VeInvite автоматически найдёт пост. Оставьте его публичным минимум на 24 часа; бонус выплачивается только после проверки.',
    autoShareFollowupBody: 'После публикации в X не нужно отправлять URL. Оставьте пост публичным минимум на 24 часа; VeInvite автоматически проверит его и выплатит бонус после подтверждения.',
    autoGraceBody: 'Время для публикации закончилось. VeInvite автоматически проверяет посты, опубликованные до срока. Оставьте пост публичным до завершения 24-часовой проверки.',
    autoConnectedX: 'Аккаунт X подключён. Ваш публичный пост будет проверен автоматически; ссылку отправлять не нужно.',
  },
  id: {
    connectX: 'Hubungkan akun X',
    connectedX: 'Akun X terhubung. Kamu masih dapat mengirim tautan posting sampai pemeriksaan otomatis aktif sepenuhnya.',
    autoConnectBody: 'Hubungkan dulu akun X publikmu, lalu bagikan posting dalam 24 jam. Kamu tidak perlu mengirim URL posting secara terpisah.',
    autoOpenBody: 'Bagikan di X dalam 24 jam. VeInvite akan mencari posting secara otomatis. Biarkan publik setidaknya 24 jam; bonus hanya dibayar setelah verifikasi.',
    autoShareFollowupBody: 'Setelah memposting di X, kamu tidak perlu mengirim URL. Biarkan posting publik setidaknya 24 jam; VeInvite akan memeriksanya otomatis dan membayar bonus setelah verifikasi.',
    autoGraceBody: 'Waktu berbagi sudah berakhir. VeInvite otomatis memeriksa posting yang dibagikan sebelum batas waktu. Biarkan posting tetap publik sampai pemeriksaan 24 jam selesai.',
    autoConnectedX: 'Akun X terhubung. Posting publikmu akan diperiksa otomatis; tidak perlu mengirim tautan.',
  },
  vi: {
    connectX: 'Kết nối tài khoản X',
    connectedX: 'Tài khoản X đã kết nối. Bạn vẫn có thể gửi liên kết bài đăng cho đến khi kiểm tra tự động được bật hoàn toàn.',
    autoConnectBody: 'Hãy kết nối tài khoản X công khai trước, sau đó chia sẻ bài đăng trong vòng 24 giờ. Bạn sẽ không cần gửi URL bài đăng.',
    autoOpenBody: 'Hãy chia sẻ lên X trong vòng 24 giờ. VeInvite sẽ tự động tìm bài đăng. Giữ bài đăng công khai ít nhất 24 giờ; chỉ trả thưởng sau khi xác minh.',
    autoShareFollowupBody: 'Sau khi đăng lên X, bạn không cần gửi URL. Giữ bài đăng công khai ít nhất 24 giờ; VeInvite sẽ tự động kiểm tra và trả thưởng sau khi xác minh.',
    autoGraceBody: 'Thời gian chia sẻ đã hết. VeInvite đang tự động kiểm tra các bài đăng được chia sẻ trước hạn. Giữ bài đăng công khai cho đến khi hoàn tất kiểm tra 24 giờ.',
    autoConnectedX: 'Tài khoản X đã kết nối. Bài đăng công khai sẽ được kiểm tra tự động; không cần gửi liên kết.',
  },
  'zh-tw': {
    connectX: '連接 X 帳號',
    connectedX: 'X 帳號已連接。自動驗證完全啟用前，仍可提交貼文連結。',
    autoConnectBody: '請先連接你的公開 X 帳號，然後在 24 小時內分享貼文。不需要另外提交貼文 URL。',
    autoOpenBody: '請在 24 小時內分享到 X。VeInvite 會自動尋找貼文。請至少保持公開 24 小時；只有驗證通過後才會發放獎勵。',
    autoShareFollowupBody: '發布到 X 後不需要提交 URL。請至少保持貼文公開 24 小時；VeInvite 會自動檢查並在驗證後發放獎勵。',
    autoGraceBody: '分享時間已結束。VeInvite 正在自動檢查截止時間前發布的貼文。請保持貼文公開，直到 24 小時驗證完成。',
    autoConnectedX: 'X 帳號已連接。公開貼文會自動檢查，不需要提交連結。',
  },
} satisfies Record<
  | 'zh'
  | 'es'
  | 'ja'
  | 'it'
  | 'tr'
  | 'nl'
  | 'de'
  | 'fr'
  | 'pt'
  | 'ru'
  | 'id'
  | 'vi'
  | 'zh-tw',
  AutoCopy
>;
