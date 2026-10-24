import type { SupportedLocale } from './locales';
import type { RewardXPromotionCopy } from './rewardXPromotionCopy';
import { REWARD_X_PROMOTION_AUTO_EXPANDED_COPY } from './rewardXPromotionAutoExpandedCopy';

export type RewardXPromotionAutoCopy = Required<
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

const CORE_AUTO_COPY = {
  en: {
    connectX: 'Connect X account',
    connectedX: 'X account connected. You can still submit the post link while automatic checks are being tested.',
    autoConnectBody: 'Connect your public X account first. Then share within 24 hours. No post URL is needed.',
    autoOpenBody: 'Share to X within 24 hours. VeInvite will find the post automatically. Keep it public for at least 24 hours; the bonus is paid only after verification.',
    autoShareFollowupBody: 'Once you publish on X, no URL submission or confirmation is needed. Keep the post public for at least 24 hours; VeInvite checks it automatically and pays the bonus only after verification.',
    autoGraceBody: 'The sharing window has ended. VeInvite is checking posts shared before the deadline automatically. Keep your post public until the 24-hour verification finishes.',
    autoConnectedX: 'X account connected. Your public post will be checked automatically; no link submission is needed.',
  },
  ko: {
    connectX: 'X 계정 연결',
    connectedX: 'X 계정이 연결되었어요. 자동 확인 기능을 시험하는 동안에도 게시물 링크를 직접 제출할 수 있어요.',
    autoConnectBody: '먼저 공개 X 계정을 연결해 주세요. 그런 다음 24시간 안에 공유하면 게시물 URL을 따로 제출할 필요가 없어요.',
    autoOpenBody: '24시간 안에 X에 공유해 주세요. VeInvite가 공개 게시물을 자동으로 찾아 확인해요. 게시물을 24시간 이상 공개 상태로 유지하면 검증 후 추가 보상이 지급돼요.',
    autoShareFollowupBody: 'X에 게시한 뒤에는 URL 제출이나 별도 확인이 필요 없어요. 게시물을 24시간 이상 공개 상태로 유지하면 VeInvite가 자동 확인 후 추가 보상을 지급해요.',
    autoGraceBody: '공유 가능 시간이 끝났어요. VeInvite가 기한 안에 게시된 글을 자동 확인 중이에요. 24시간 검증이 끝날 때까지 게시물을 공개 상태로 유지해 주세요.',
    autoConnectedX: 'X 계정이 연결되었어요. 공개 게시물은 자동으로 확인되므로 링크를 제출하지 않아도 돼요.',
  },
  zh: {
    connectX: '连接 X 账号',
    connectedX: 'X 账号已连接。自动验证测试期间仍可手动提交帖文链接。',
    autoConnectBody: '请先连接你的公开 X 账号，然后在 24 小时内分享，无需提交帖文链接。',
    autoOpenBody: '请在 24 小时内分享到 X。VeInvite 会自动查找公开帖文。请至少保持公开 24 小时，验证通过后才会发放奖励。',
    autoShareFollowupBody: '发布到 X 后无需提交链接或再次确认。请至少保持帖文公开 24 小时；VeInvite 会自动检查并在验证通过后发放奖励。',
    autoGraceBody: '分享时间已结束。VeInvite 正在自动检查截止时间前发布的帖文。请保持帖文公开，直到 24 小时验证完成。',
    autoConnectedX: 'X 账号已连接。公开帖文会自动检查，无需提交链接。',
  },
  'zh-tw': {
    connectX: '連接 X 帳號',
    connectedX: 'X 帳號已連接。自動驗證測試期間仍可手動提交貼文連結。',
    autoConnectBody: '請先連接你的公開 X 帳號，接著在 24 小時內分享，不需要另外提交貼文連結。',
    autoOpenBody: '請在 24 小時內分享到 X。VeInvite 會自動尋找公開貼文。請至少保持公開 24 小時，驗證通過後才會發放獎勵。',
    autoShareFollowupBody: '發佈到 X 後不需要提交連結或再次確認。請至少保持貼文公開 24 小時；VeInvite 會自動檢查並在驗證通過後發放獎勵。',
    autoGraceBody: '分享時間已結束。VeInvite 正在自動檢查截止前發佈的貼文。請保持貼文公開，直到 24 小時驗證完成。',
    autoConnectedX: 'X 帳號已連接。公開貼文會自動檢查，不需要提交連結。',
  },
  ja: {
    connectX: 'Xアカウントを接続',
    connectedX: 'Xアカウントは接続済みです。自動確認のテスト中も投稿リンクを手動で送信できます。',
    autoConnectBody: 'まず公開Xアカウントを接続してください。その後24時間以内にシェアすれば、投稿URLの送信は不要です。',
    autoOpenBody: '24時間以内にXへシェアしてください。VeInviteが公開投稿を自動で探します。少なくとも24時間公開を維持し、確認完了後にボーナスが支払われます。',
    autoShareFollowupBody: 'Xへ投稿した後はURL送信や追加確認は不要です。少なくとも24時間公開を維持すると、VeInviteが自動確認し、条件確認後にボーナスを支払います。',
    autoGraceBody: 'シェア期限は終了しました。VeInviteが期限内の投稿を自動確認しています。24時間確認が終わるまで投稿を公開したままにしてください。',
    autoConnectedX: 'Xアカウントは接続済みです。公開投稿は自動確認されるため、リンク送信は不要です。',
  },
  es: {
    connectX: 'Conectar cuenta de X',
    connectedX: 'La cuenta de X está conectada. Mientras se prueba la verificación automática, aún puedes enviar el enlace de la publicación.',
    autoConnectBody: 'Primero conecta tu cuenta pública de X. Después comparte dentro de 24 horas. No necesitas enviar la URL de la publicación.',
    autoOpenBody: 'Comparte en X dentro de 24 horas. VeInvite buscará la publicación automáticamente. Mantenla pública al menos 24 horas; el bono se paga solo tras la verificación.',
    autoShareFollowupBody: 'Después de publicar en X no necesitas enviar una URL ni confirmar nada. Mantén la publicación pública al menos 24 horas; VeInvite la revisa automáticamente y paga el bono tras verificarla.',
    autoGraceBody: 'El plazo para compartir terminó. VeInvite está revisando automáticamente las publicaciones hechas antes de la fecha límite. Mantén tu publicación pública hasta que termine la verificación de 24 horas.',
    autoConnectedX: 'La cuenta de X está conectada. Tu publicación pública se revisará automáticamente; no necesitas enviar un enlace.',
  },
  de: {
    connectX: 'X-Konto verbinden',
    connectedX: 'Das X-Konto ist verbunden. Während die automatische Prüfung getestet wird, kannst du den Post-Link weiterhin manuell einreichen.',
    autoConnectBody: 'Verbinde zuerst dein öffentliches X-Konto. Teile dann innerhalb von 24 Stunden. Eine Post-URL musst du nicht einreichen.',
    autoOpenBody: 'Teile innerhalb von 24 Stunden auf X. VeInvite findet den öffentlichen Post automatisch. Lass ihn mindestens 24 Stunden öffentlich; der Bonus wird erst nach der Prüfung ausgezahlt.',
    autoShareFollowupBody: 'Nach dem Posten auf X musst du keine URL einreichen oder etwas bestätigen. Lass den Post mindestens 24 Stunden öffentlich; VeInvite prüft ihn automatisch und zahlt den Bonus nach erfolgreicher Prüfung aus.',
    autoGraceBody: 'Das Zeitfenster zum Teilen ist beendet. VeInvite prüft automatisch Posts, die vor Ablauf der Frist veröffentlicht wurden. Lass deinen Post bis zum Ende der 24-Stunden-Prüfung öffentlich.',
    autoConnectedX: 'Das X-Konto ist verbunden. Dein öffentlicher Post wird automatisch geprüft; ein Link ist nicht nötig.',
  },
  fr: {
    connectX: 'Connecter le compte X',
    connectedX: 'Le compte X est connecté. Pendant les tests de vérification automatique, vous pouvez encore envoyer le lien du post.',
    autoConnectBody: 'Connectez d’abord votre compte X public, puis partagez dans les 24 heures. Aucun lien de post n’est à envoyer.',
    autoOpenBody: 'Partagez sur X dans les 24 heures. VeInvite trouvera automatiquement le post public. Gardez-le public au moins 24 heures ; le bonus est versé uniquement après vérification.',
    autoShareFollowupBody: 'Après publication sur X, aucun lien ni confirmation n’est nécessaire. Gardez le post public au moins 24 heures ; VeInvite le vérifie automatiquement et verse le bonus après validation.',
    autoGraceBody: 'La période de partage est terminée. VeInvite vérifie automatiquement les posts publiés avant l’échéance. Gardez votre post public jusqu’à la fin de la vérification de 24 heures.',
    autoConnectedX: 'Le compte X est connecté. Votre post public sera vérifié automatiquement ; aucun lien n’est nécessaire.',
  },
  it: {
    connectX: 'Collega account X',
    connectedX: 'L’account X è collegato. Durante i test della verifica automatica puoi ancora inviare manualmente il link del post.',
    autoConnectBody: 'Collega prima il tuo account X pubblico, poi condividi entro 24 ore. Non serve inviare l’URL del post.',
    autoOpenBody: 'Condividi su X entro 24 ore. VeInvite troverà automaticamente il post pubblico. Mantienilo pubblico per almeno 24 ore; il bonus viene pagato solo dopo la verifica.',
    autoShareFollowupBody: 'Dopo la pubblicazione su X non serve inviare URL o conferme. Mantieni il post pubblico per almeno 24 ore; VeInvite lo controlla automaticamente e paga il bonus dopo la verifica.',
    autoGraceBody: 'La finestra di condivisione è terminata. VeInvite sta controllando automaticamente i post pubblicati prima della scadenza. Mantieni il post pubblico fino al termine della verifica di 24 ore.',
    autoConnectedX: 'L’account X è collegato. Il tuo post pubblico verrà controllato automaticamente; non serve inviare il link.',
  },
  tr: {
    connectX: 'X hesabını bağla',
    connectedX: 'X hesabı bağlı. Otomatik kontrol test edilirken gönderi bağlantısını yine de elle gönderebilirsin.',
    autoConnectBody: 'Önce herkese açık X hesabını bağla. Ardından 24 saat içinde paylaş. Gönderi URL’si göndermen gerekmez.',
    autoOpenBody: '24 saat içinde X’te paylaş. VeInvite herkese açık gönderiyi otomatik olarak bulur. En az 24 saat açık tut; bonus yalnızca doğrulamadan sonra ödenir.',
    autoShareFollowupBody: 'X’te yayımladıktan sonra URL göndermen veya ayrıca onaylaman gerekmez. Gönderiyi en az 24 saat açık tut; VeInvite otomatik kontrol eder ve doğrulamadan sonra bonusu öder.',
    autoGraceBody: 'Paylaşım süresi sona erdi. VeInvite son tarihten önce yayımlanan gönderileri otomatik olarak kontrol ediyor. 24 saatlik doğrulama bitene kadar gönderini açık tut.',
    autoConnectedX: 'X hesabı bağlı. Herkese açık gönderin otomatik kontrol edilir; bağlantı göndermen gerekmez.',
  },
  nl: {
    connectX: 'X-account koppelen',
    connectedX: 'Het X-account is gekoppeld. Tijdens het testen van automatische controle kun je de postlink nog handmatig indienen.',
    autoConnectBody: 'Koppel eerst je openbare X-account. Deel daarna binnen 24 uur. Je hoeft geen post-URL in te dienen.',
    autoOpenBody: 'Deel binnen 24 uur op X. VeInvite zoekt de openbare post automatisch. Houd de post minimaal 24 uur openbaar; de bonus wordt pas na verificatie uitbetaald.',
    autoShareFollowupBody: 'Na publicatie op X hoef je geen URL in te dienen of iets te bevestigen. Houd de post minimaal 24 uur openbaar; VeInvite controleert automatisch en betaalt de bonus na verificatie.',
    autoGraceBody: 'De deelperiode is afgelopen. VeInvite controleert automatisch posts die vóór de deadline zijn geplaatst. Houd je post openbaar tot de 24-uurscontrole is afgerond.',
    autoConnectedX: 'Het X-account is gekoppeld. Je openbare post wordt automatisch gecontroleerd; een link indienen is niet nodig.',
  },
  pt: {
    connectX: 'Conectar conta do X',
    connectedX: 'A conta do X está conectada. Durante os testes da verificação automática, você ainda pode enviar manualmente o link da publicação.',
    autoConnectBody: 'Primeiro conecte sua conta pública do X. Depois compartilhe em até 24 horas. Não é necessário enviar a URL da publicação.',
    autoOpenBody: 'Compartilhe no X em até 24 horas. O VeInvite encontrará a publicação pública automaticamente. Mantenha-a pública por pelo menos 24 horas; o bônus só é pago após a verificação.',
    autoShareFollowupBody: 'Depois de publicar no X, não é preciso enviar URL nem confirmar nada. Mantenha a publicação pública por pelo menos 24 horas; o VeInvite verifica automaticamente e paga o bônus após a aprovação.',
    autoGraceBody: 'O prazo de compartilhamento terminou. O VeInvite está verificando automaticamente as publicações feitas antes do prazo. Mantenha sua publicação pública até o fim da verificação de 24 horas.',
    autoConnectedX: 'A conta do X está conectada. Sua publicação pública será verificada automaticamente; não é preciso enviar link.',
  },
  ru: {
    connectX: 'Подключить аккаунт X',
    connectedX: 'Аккаунт X подключён. Пока автоматическая проверка тестируется, ссылку на пост всё ещё можно отправить вручную.',
    autoConnectBody: 'Сначала подключите публичный аккаунт X, затем поделитесь постом в течение 24 часов. Отправлять ссылку на пост не нужно.',
    autoOpenBody: 'Поделитесь в X в течение 24 часов. VeInvite автоматически найдёт публичный пост. Оставьте его публичным минимум на 24 часа; бонус выплачивается только после проверки.',
    autoShareFollowupBody: 'После публикации в X не нужно отправлять ссылку или подтверждать действие. Оставьте пост публичным минимум на 24 часа; VeInvite проверит его автоматически и выплатит бонус после подтверждения.',
    autoGraceBody: 'Период публикации закончился. VeInvite автоматически проверяет посты, опубликованные до дедлайна. Оставьте пост публичным до завершения 24-часовой проверки.',
    autoConnectedX: 'Аккаунт X подключён. Публичный пост будет проверен автоматически; отправлять ссылку не нужно.',
  },
  id: {
    connectX: 'Hubungkan akun X',
    connectedX: 'Akun X sudah terhubung. Selama pemeriksaan otomatis masih diuji, kamu tetap bisa mengirim tautan Post secara manual.',
    autoConnectBody: 'Hubungkan akun X publikmu terlebih dahulu. Lalu bagikan dalam 24 jam. Tidak perlu mengirim URL Post.',
    autoOpenBody: 'Bagikan ke X dalam 24 jam. VeInvite akan mencari Post publik secara otomatis. Biarkan tetap publik setidaknya 24 jam; bonus dibayar hanya setelah verifikasi.',
    autoShareFollowupBody: 'Setelah dipublikasikan di X, kamu tidak perlu mengirim URL atau konfirmasi lagi. Biarkan Post tetap publik setidaknya 24 jam; VeInvite memeriksanya otomatis dan membayar bonus setelah verifikasi.',
    autoGraceBody: 'Jendela berbagi sudah berakhir. VeInvite sedang memeriksa secara otomatis Post yang dibagikan sebelum batas waktu. Biarkan Post tetap publik sampai verifikasi 24 jam selesai.',
    autoConnectedX: 'Akun X sudah terhubung. Post publikmu akan diperiksa otomatis; tidak perlu mengirim tautan.',
  },
  vi: {
    connectX: 'Kết nối tài khoản X',
    connectedX: 'Tài khoản X đã được kết nối. Trong khi tính năng kiểm tra tự động đang thử nghiệm, bạn vẫn có thể gửi liên kết bài đăng thủ công.',
    autoConnectBody: 'Hãy kết nối tài khoản X công khai trước, rồi chia sẻ trong vòng 24 giờ. Không cần gửi URL bài đăng.',
    autoOpenBody: 'Chia sẻ lên X trong vòng 24 giờ. VeInvite sẽ tự động tìm bài đăng công khai. Hãy giữ bài đăng công khai ít nhất 24 giờ; chỉ trả thưởng sau khi xác minh.',
    autoShareFollowupBody: 'Sau khi đăng lên X, bạn không cần gửi URL hay xác nhận thêm. Hãy giữ bài đăng công khai ít nhất 24 giờ; VeInvite sẽ tự động kiểm tra và trả thưởng sau khi xác minh.',
    autoGraceBody: 'Thời gian chia sẻ đã kết thúc. VeInvite đang tự động kiểm tra các bài đăng được đăng trước hạn. Hãy giữ bài đăng công khai cho đến khi hoàn tất xác minh 24 giờ.',
    autoConnectedX: 'Tài khoản X đã được kết nối. Bài đăng công khai sẽ được kiểm tra tự động; không cần gửi liên kết.',
  },
} satisfies Partial<Record<SupportedLocale, RewardXPromotionAutoCopy>>;

export const REWARD_X_PROMOTION_AUTO_COPY: Record<
  SupportedLocale,
  RewardXPromotionAutoCopy
> = {
  ...CORE_AUTO_COPY,
  ...REWARD_X_PROMOTION_AUTO_EXPANDED_COPY,
};
