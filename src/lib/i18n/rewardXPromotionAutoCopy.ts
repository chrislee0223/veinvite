import type { SupportedLocale } from './locales';
import { REWARD_X_PROMOTION_AUTO_EXPANDED_COPY } from './rewardXPromotionAutoExpandedCopy';

export type RewardXPromotionAutoCopy = {
  connectX: string;
  connectedX: string;
  autoConnectBody: string;
  autoOpenBody: string;
  autoGraceBody: string;
  autoConnectedX: string;
};

export const REWARD_X_PROMOTION_AUTO_COPY: Record<
  SupportedLocale,
  RewardXPromotionAutoCopy
> = {
  en: {
    connectX: 'Connect X account',
    connectedX: 'X account connected. You can still submit the post link while automatic checks are being tested.',
    autoConnectBody: 'Connect your public X account first. Then share the post within 24 hours. No post URL is needed.',
    autoOpenBody: 'Share on X within 24 hours. VeInvite will find the post automatically. Keep it public for at least 24 hours; the bonus is paid only after verification.',
    autoGraceBody: 'The sharing window has ended. VeInvite is automatically checking posts shared before the deadline. Keep your post public until the 24-hour verification finishes.',
    autoConnectedX: 'X account connected. Your public post will be checked automatically; no link submission is needed.',
  },
  ko: {
    connectX: 'X 계정 연결',
    connectedX: 'X 계정이 연결됐어요. 자동 확인 기능을 시험하는 동안에도 게시물 링크를 직접 제출할 수 있어요.',
    autoConnectBody: '먼저 공개 X 계정을 연결해 주세요. 그다음 24시간 안에 게시물을 공유하면 돼요. 게시물 링크를 따로 제출할 필요는 없어요.',
    autoOpenBody: '24시간 안에 X에 공유해 주세요. VeInvite가 게시물을 자동으로 찾아요. 최소 24시간 동안 공개 상태를 유지해야 하며, 확인이 끝난 뒤에만 추가 보상이 지급돼요.',
    autoGraceBody: '공유 가능 시간이 끝났어요. VeInvite가 마감 전에 공유된 게시물을 자동으로 확인하고 있어요. 24시간 확인이 끝날 때까지 게시물을 공개 상태로 유지해 주세요.',
    autoConnectedX: 'X 계정이 연결됐어요. 공개 게시물은 자동으로 확인되므로 링크를 따로 제출할 필요가 없어요.',
  },
  zh: {
    connectX: '连接 X 账号',
    connectedX: 'X 账号已连接。在自动检查功能测试期间，你仍可手动提交帖子链接。',
    autoConnectBody: '请先连接你的公开 X 账号，然后在 24 小时内分享帖子。无需另外提交帖子链接。',
    autoOpenBody: '请在 24 小时内分享到 X。VeInvite 会自动查找帖子。请至少保持公开 24 小时，验证完成后才会发放奖励。',
    autoGraceBody: '分享期限已结束。VeInvite 正在自动检查截止时间前发布的帖子。请保持帖子公开，直到 24 小时验证完成。',
    autoConnectedX: 'X 账号已连接。公开帖子会自动检查，无需提交链接。',
  },
  'zh-tw': {
    connectX: '連接 X 帳號',
    connectedX: 'X 帳號已連接。自動檢查功能測試期間，你仍可手動提交貼文連結。',
    autoConnectBody: '請先連接你的公開 X 帳號，再於 24 小時內分享貼文。無需另外提交貼文連結。',
    autoOpenBody: '請在 24 小時內分享到 X。VeInvite 會自動找到貼文。請至少維持公開 24 小時，驗證完成後才會發放獎勵。',
    autoGraceBody: '分享期限已結束。VeInvite 正在自動檢查截止前發佈的貼文。請保持貼文公開，直到 24 小時驗證完成。',
    autoConnectedX: 'X 帳號已連接。公開貼文會自動檢查，不需要提交連結。',
  },
  ja: {
    connectX: 'Xアカウントを連携',
    connectedX: 'Xアカウントを連携しました。自動確認のテスト中でも、投稿リンクを手動で送信できます。',
    autoConnectBody: 'まず公開Xアカウントを連携してください。その後24時間以内に投稿をシェアしてください。投稿URLの送信は不要です。',
    autoOpenBody: '24時間以内にXへシェアしてください。VeInviteが投稿を自動で探します。少なくとも24時間は公開状態を保ち、確認完了後にのみ追加報酬が支払われます。',
    autoGraceBody: 'シェア期限は終了しました。VeInviteが期限前に公開された投稿を自動確認しています。24時間の確認が終わるまで公開状態を維持してください。',
    autoConnectedX: 'Xアカウントを連携しました。公開投稿は自動で確認されるため、リンク送信は不要です。',
  },
  es: {
    connectX: 'Conectar cuenta de X',
    connectedX: 'Cuenta de X conectada. Mientras se prueba la verificación automática, aún puedes enviar el enlace del post manualmente.',
    autoConnectBody: 'Conecta primero tu cuenta pública de X. Después comparte el post dentro de 24 horas. No necesitas enviar la URL del post.',
    autoOpenBody: 'Comparte en X dentro de 24 horas. VeInvite buscará el post automáticamente. Mantenlo público al menos 24 horas; el bono se paga solo después de la verificación.',
    autoGraceBody: 'El plazo para compartir terminó. VeInvite está revisando automáticamente los posts publicados antes de la fecha límite. Mantén tu post público hasta terminar la verificación de 24 horas.',
    autoConnectedX: 'Cuenta de X conectada. Tu post público se revisará automáticamente; no necesitas enviar el enlace.',
  },
  de: {
    connectX: 'X-Konto verbinden',
    connectedX: 'X-Konto verbunden. Während die automatische Prüfung getestet wird, kannst du den Post-Link weiterhin manuell senden.',
    autoConnectBody: 'Verbinde zuerst dein öffentliches X-Konto. Teile den Post danach innerhalb von 24 Stunden. Eine Post-URL musst du nicht senden.',
    autoOpenBody: 'Teile innerhalb von 24 Stunden auf X. VeInvite sucht den Post automatisch. Lass ihn mindestens 24 Stunden öffentlich; der Bonus wird erst nach der Prüfung ausgezahlt.',
    autoGraceBody: 'Das Zeitfenster ist abgelaufen. VeInvite prüft automatisch Posts, die vor der Frist geteilt wurden. Lass deinen Post bis zum Ende der 24-Stunden-Prüfung öffentlich.',
    autoConnectedX: 'X-Konto verbunden. Dein öffentlicher Post wird automatisch geprüft; du musst keinen Link senden.',
  },
  fr: {
    connectX: 'Connecter le compte X',
    connectedX: 'Compte X connecté. Pendant le test de la vérification automatique, vous pouvez toujours envoyer manuellement le lien du post.',
    autoConnectBody: 'Connectez d’abord votre compte X public, puis partagez le post dans les 24 heures. Vous n’avez pas besoin d’envoyer l’URL du post.',
    autoOpenBody: 'Partagez sur X dans les 24 heures. VeInvite trouvera automatiquement le post. Gardez-le public au moins 24 heures ; le bonus est versé uniquement après vérification.',
    autoGraceBody: 'La période de partage est terminée. VeInvite vérifie automatiquement les posts publiés avant la date limite. Gardez votre post public jusqu’à la fin du contrôle de 24 heures.',
    autoConnectedX: 'Compte X connecté. Votre post public sera vérifié automatiquement ; aucun lien n’est à envoyer.',
  },
  it: {
    connectX: 'Collega account X',
    connectedX: 'Account X collegato. Durante i test del controllo automatico puoi ancora inviare manualmente il link del post.',
    autoConnectBody: 'Collega prima il tuo account X pubblico, poi condividi il post entro 24 ore. Non serve inviare l’URL del post.',
    autoOpenBody: 'Condividi su X entro 24 ore. VeInvite troverà automaticamente il post. Mantienilo pubblico per almeno 24 ore; il bonus viene pagato solo dopo la verifica.',
    autoGraceBody: 'Il periodo di condivisione è terminato. VeInvite sta controllando automaticamente i post pubblicati prima della scadenza. Mantieni il post pubblico fino alla fine della verifica di 24 ore.',
    autoConnectedX: 'Account X collegato. Il tuo post pubblico verrà controllato automaticamente; non serve inviare il link.',
  },
  tr: {
    connectX: 'X hesabını bağla',
    connectedX: 'X hesabın bağlandı. Otomatik kontrol test edilirken gönderi bağlantısını yine de elle gönderebilirsin.',
    autoConnectBody: 'Önce herkese açık X hesabını bağla. Ardından gönderiyi 24 saat içinde paylaş. Gönderi URL’sini ayrıca göndermene gerek yok.',
    autoOpenBody: '24 saat içinde X’te paylaş. VeInvite gönderiyi otomatik olarak bulacak. En az 24 saat herkese açık tut; bonus yalnızca doğrulama tamamlandıktan sonra ödenir.',
    autoGraceBody: 'Paylaşım süresi sona erdi. VeInvite son tarihten önce paylaşılan gönderileri otomatik olarak kontrol ediyor. 24 saatlik doğrulama bitene kadar gönderini herkese açık tut.',
    autoConnectedX: 'X hesabın bağlandı. Herkese açık gönderin otomatik kontrol edilecek; bağlantı göndermene gerek yok.',
  },
  nl: {
    connectX: 'X-account koppelen',
    connectedX: 'X-account gekoppeld. Terwijl de automatische controle wordt getest, kun je de postlink nog steeds handmatig indienen.',
    autoConnectBody: 'Koppel eerst je openbare X-account. Deel daarna de post binnen 24 uur. Je hoeft geen post-URL in te dienen.',
    autoOpenBody: 'Deel binnen 24 uur op X. VeInvite zoekt de post automatisch. Houd hem minstens 24 uur openbaar; de bonus wordt pas na verificatie uitbetaald.',
    autoGraceBody: 'De deelperiode is voorbij. VeInvite controleert automatisch posts die vóór de deadline zijn geplaatst. Houd je post openbaar tot de controle na 24 uur klaar is.',
    autoConnectedX: 'X-account gekoppeld. Je openbare post wordt automatisch gecontroleerd; je hoeft geen link in te dienen.',
  },
  pt: {
    connectX: 'Conectar conta do X',
    connectedX: 'Conta do X conectada. Enquanto a verificação automática está em teste, você ainda pode enviar o link do post manualmente.',
    autoConnectBody: 'Conecte primeiro sua conta pública do X. Depois compartilhe o post em até 24 horas. Não é necessário enviar a URL do post.',
    autoOpenBody: 'Compartilhe no X em até 24 horas. O VeInvite localizará o post automaticamente. Mantenha-o público por pelo menos 24 horas; o bônus só é pago após a verificação.',
    autoGraceBody: 'O prazo para compartilhar terminou. O VeInvite está verificando automaticamente os posts publicados antes do limite. Mantenha o post público até terminar a verificação de 24 horas.',
    autoConnectedX: 'Conta do X conectada. Seu post público será verificado automaticamente; não é necessário enviar o link.',
  },
  ru: {
    connectX: 'Подключить аккаунт X',
    connectedX: 'Аккаунт X подключён. Пока автоматическая проверка тестируется, ссылку на пост всё ещё можно отправить вручную.',
    autoConnectBody: 'Сначала подключите публичный аккаунт X, затем поделитесь постом в течение 24 часов. Отправлять URL поста не нужно.',
    autoOpenBody: 'Поделитесь в X в течение 24 часов. VeInvite автоматически найдёт пост. Оставьте его публичным минимум на 24 часа; бонус выплачивается только после проверки.',
    autoGraceBody: 'Срок публикации закончился. VeInvite автоматически проверяет посты, опубликованные до дедлайна. Оставьте пост публичным до завершения 24-часовой проверки.',
    autoConnectedX: 'Аккаунт X подключён. Публичный пост будет проверен автоматически; ссылку отправлять не нужно.',
  },
  id: {
    connectX: 'Hubungkan akun X',
    connectedX: 'Akun X sudah terhubung. Selama pemeriksaan otomatis masih diuji, kamu tetap bisa mengirim tautan post secara manual.',
    autoConnectBody: 'Hubungkan dulu akun X publikmu. Setelah itu bagikan post dalam 24 jam. Kamu tidak perlu mengirim URL post.',
    autoOpenBody: 'Bagikan di X dalam 24 jam. VeInvite akan menemukan post secara otomatis. Biarkan tetap publik setidaknya 24 jam; bonus dibayar hanya setelah verifikasi.',
    autoGraceBody: 'Waktu berbagi sudah berakhir. VeInvite sedang memeriksa otomatis post yang dibagikan sebelum tenggat. Biarkan post tetap publik sampai verifikasi 24 jam selesai.',
    autoConnectedX: 'Akun X sudah terhubung. Post publikmu akan diperiksa otomatis; tidak perlu mengirim tautan.',
  },
  vi: {
    connectX: 'Kết nối tài khoản X',
    connectedX: 'Đã kết nối tài khoản X. Trong lúc tính năng kiểm tra tự động đang được thử nghiệm, bạn vẫn có thể gửi liên kết bài đăng theo cách thủ công.',
    autoConnectBody: 'Trước tiên hãy kết nối tài khoản X công khai. Sau đó chia sẻ bài đăng trong vòng 24 giờ. Không cần gửi URL bài đăng.',
    autoOpenBody: 'Hãy chia sẻ lên X trong vòng 24 giờ. VeInvite sẽ tự động tìm bài đăng. Giữ bài đăng ở chế độ công khai ít nhất 24 giờ; chỉ trả thưởng sau khi xác minh.',
    autoGraceBody: 'Thời gian chia sẻ đã kết thúc. VeInvite đang tự động kiểm tra các bài đăng được chia sẻ trước hạn. Hãy giữ bài đăng công khai cho đến khi hoàn tất xác minh 24 giờ.',
    autoConnectedX: 'Đã kết nối tài khoản X. Bài đăng công khai sẽ được kiểm tra tự động; không cần gửi liên kết.',
  },
  ...REWARD_X_PROMOTION_AUTO_EXPANDED_COPY,
};
