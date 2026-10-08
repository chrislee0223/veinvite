import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const facade = read('src/components/InviteNotificationHistoryCenter.tsx');
const center = read('src/components/UnifiedInviteNotificationHistoryCenter.tsx');
const snackbar = read('src/components/TransientSnackbar.tsx');
const actionsRoute = read('src/app/api/notifications/reward-actions/route.ts');
const claimRoute = read('src/app/api/rewards/claims/route.ts');
const invitesRoute = read('src/app/api/invites/route.ts');
const page = read('src/app/page.tsx');
const home = read('src/components/HomeClient.tsx');
const rewardPaidTransient = read('src/hooks/useRewardPaidTransientFeedback.ts');
const activeReceipt = read('src/components/ActiveWalletRewardReceiptNotice.tsx');
const paidSync = read('src/components/PaidActivationLiveSync.tsx');
const paidToast = read('src/lib/notifications/rewardPaidToast.ts');
const rewardShare = read('src/lib/rewards/rewardReceiptShare.ts');
const rewardPaidCopy = read('src/lib/i18n/rewardPaidNotificationCopy.ts');
const rewardAdjustedCopy = read('src/lib/i18n/rewardAdjustedCopy.ts');
const rewardReceiptView = read('src/components/RewardReceiptView.tsx');
const qaHarness = read('src/qa/QaNotificationStateHarness.tsx');
const rootLayout = read('src/app/layout.tsx');
const legacyInvitePage = read('src/app/i/[code]/page.tsx');
const referralPage = read('src/app/r/[key]/page.tsx');
const socialReferralPage = read('src/app/s/[key]/page.tsx');
const locales = read('src/lib/i18n/locales.ts');

test('reward action API stays wallet scoped while Claim UI has one Home owner', () => {
  assert.match(actionsRoute, /requireWalletSession/);
  assert.match(actionsRoute, /\.eq\('recipient_wallet', walletAddress\)/);
  assert.match(
    actionsRoute,
    /\.in\('status', \['AWAITING_CLAIM', 'QUEUED', 'ASSIGNED'\]\)/,
  );
  assert.match(actionsRoute, /'Cache-Control': 'no-store'/);

  assert.match(home, /fetch\('\/api\/rewards\/claims'/);
  assert.match(home, /className="claimButton"/);
  assert.match(claimRoute, /request_reward_claim/);
  assert.match(claimRoute, /runImmediateClaimRewardPayout/);

  assert.doesNotMatch(center, /\/api\/notifications\/reward-actions/);
  assert.doesNotMatch(center, /notificationClaimButton/);
  assert.doesNotMatch(center, /fetch\('\/api\/rewards\/claims'/);
  assert.doesNotMatch(facade, /\/api\/notifications\/reward-actions/);
  assert.doesNotMatch(facade, /notificationRewardAttentionDot/);
});

test('reward-ready is bell history only while paid history stays reopenable', () => {
  assert.match(center, /case 'REWARD_READY':/);
  assert.match(center, /case 'REWARD_PAID':/);
  assert.match(
    center,
    /NOTIFICATION_POLICY\[item\.kind\]\.readBehavior === 'receipt'/,
  );
  assert.match(center, /notificationHistoryRow isRead isInteractive/);
  assert.match(center, /openRewardReceipt\(item\)/);
  assert.match(
    center,
    /rewards\/receipts\?inviteCode=\$\{encodeURIComponent\(item\.inviteCode\)\}/,
  );
  assert.doesNotMatch(qaHarness, /InviteNotificationSurfaceV2/);
  assert.match(qaHarness, /case 'NOTI-REWARD-READY':[\s\S]*mode: 'history'/);
});

test('paid history uses a natural amount sentence and receipt open marks it read', () => {
  assert.match(center, /rewardPaidNotificationBody\(locale, amount\)/);
  assert.match(rewardPaidCopy, /Record<SupportedLocale, string>/);
  assert.match(
    rewardPaidCopy,
    /친구 초대 보상으로 \{amount\} B3TR이 지갑에 지급됐어요\./,
  );
  assert.match(center, /const receiptAutoAckIdRef = useRef<string \| null>\(null\)/);
  assert.match(center, /void acknowledgeReceipt\(\)/);
  assert.match(center, /ACKNOWLEDGE_REWARD_RECEIPT/);
  assert.match(
    center,
    /Read-state acknowledgement is bookkeeping only/,
  );
  assert.doesNotMatch(
    center,
    /reward receipt acknowledgement failed:[\s\S]{0,220}setReceiptError\(receiptCopy\.error\)/,
  );
  assert.doesNotMatch(rewardReceiptView, /notificationReceiptAcknowledge/);
  assert.doesNotMatch(rewardReceiptView, /onAcknowledge/);
});

test('actual payout uses the common bottom snackbar without colliding with other feedback', () => {
  assert.match(
    paidSync,
    /for \(const receipt of \[\.\.\.targetReceipts\]\.reverse\(\)\)[\s\S]{0,220}storeRewardPaidToast\(receipt\)/,
  );
  assert.match(
    paidSync,
    /for \(const receipt of newReceipts\.reverse\(\)\)[\s\S]{0,160}storeRewardPaidToast\(receipt\)/,
  );
  assert.match(paidToast, /sessionStorage\.setItem/);
  assert.match(paidToast, /readRewardPaidToast/);
  assert.match(paidToast, /clearRewardPaidToast/);
  assert.match(paidToast, /MAX_PENDING_PAID_TOASTS/);
  assert.match(paidToast, /queue\.some\(\(item\) => item\.receiptId === payload\.receiptId\)/);
  assert.match(paidToast, /sessionStorage\.removeItem/);
  assert.match(paidSync, /const targetReceipts = snapshot\.receipts\.filter/);
  assert.match(paidSync, /for \(const receipt of \[\.\.\.targetReceipts\]\.reverse\(\)\)/);
  assert.match(paidSync, /const newReceipts: RewardReceipt\[\] = \[\]/);
  assert.match(paidSync, /for \(const receipt of newReceipts\.reverse\(\)\)/);

  assert.match(home, /useRewardPaidTransientFeedback/);
  assert.match(home, /deferredFeedbackRef/);
  assert.match(
    home,
    /if \(current\?\.kind === 'reward'\) \{[\s\S]*deferredFeedbackRef\.current = next/,
  );
  assert.match(
    home,
    /const next = deferredFeedbackRef\.current;[\s\S]*return next/,
  );
  assert.match(rewardPaidTransient, /readRewardPaidToast\(wallet\)/);
  assert.match(rewardPaidTransient, /clearRewardPaidToast\(wallet, payload\.receiptId\)/);
  assert.match(rewardPaidTransient, /setPendingReward\(readRewardPaidToast\(wallet\)\)/);
  assert.match(rewardPaidTransient, /if \(!pendingReward \|\| feedback\) return/);
  assert.match(rewardPaidTransient, /shareUnavailable/);
  assert.match(rewardPaidTransient, /kind: 'reward'/);
  assert.match(rewardPaidTransient, /rewardReceiptXIntentUrl/);
  assert.match(rewardPaidTransient, /REWARD_RECEIPT_COPY\[locale\]\.description/);
  assert.doesNotMatch(rewardPaidTransient, /rewardPaidNotificationBody/);
  assert.match(rewardPaidTransient, /ACKNOWLEDGE_REWARD_RECEIPT/);
  assert.match(snackbar, /feedback\.kind === 'reward'/);
  assert.match(snackbar, /feedback\.onShare && feedback\.shareLabel/);
  assert.match(snackbar, /className="rewardShareButton"/);
  assert.match(snackbar, /className="rewardConfirmButton"/);
  assert.match(snackbar, /bottom: calc\(92px \+ env\(safe-area-inset-bottom\)\)/);
});

test('partial reward offsets explain the reduced net amount without another bell event', () => {
  assert.match(invitesRoute, /reservation_basis/);
  assert.match(invitesRoute, /recoveryOffsetWei/);
  assert.match(home, /rewardRecoveryOffsetWei/);
  assert.match(home, /rewardAdjustmentMeta/);
  assert.match(home, /rewardAdjustedCopy\(locale\)\.title/);
});

test('reward adjustment and paid copy cover every supported locale', () => {
  const supportedLocales = [
    ...locales.matchAll(/\{ locale: '([^']+)'/gmu),
  ].map((match) => match[1]);

  for (const source of [rewardPaidCopy, rewardAdjustedCopy]) {
    const translatedLocales = [
      ...source.matchAll(/^\s*(?:'([^']+)'|([a-z]+)):\s*(?:\{|')/gmu),
    ]
      .map((match) => match[1] ?? match[2])
      .filter((locale) => supportedLocales.includes(locale));

    assert.deepEqual(
      [...new Set(translatedLocales)].sort(),
      [...supportedLocales].sort(),
    );
  }
});

test('paid reward receipt shares the verified permanent invite link on X', () => {
  assert.match(center, /rewardShareUrl/);
  assert.match(center, /<RewardReceiptView/);
  assert.match(rewardReceiptView, /rewardReceiptXIntentUrl/);
  assert.match(rewardReceiptView, /className="notificationXShare"/);
  assert.match(rewardReceiptView, /window\.open\(\s*rewardShareIntentUrl/);
  assert.match(rewardPaidTransient, /https:\/\/veinvite\.vercel\.app\/s\//);
  assert.match(rewardShare, /https:\/\/x\.com\/intent\/post/);
  assert.match(rewardShare, /Record<\s*SupportedLocale/);
  assert.match(rewardShare, /I just earned \${amount} #B3TR/);
  assert.match(rewardShare, /@Veinvite/);
  assert.match(rewardShare, /on #VeBetterDAO/);
  assert.match(rewardShare, /Invite friends\. Earn B3TR\. 👇/);
  assert.match(rewardShare, /'#VeChain #Web3 #Crypto'/);
  assert.match(rewardShare, /formatRewardShareAmount/);
  assert.match(rewardShare, /referralUrl/);
  assert.doesNotMatch(rewardShare, /'#VeBetterDAO #B3TR #VeInvite'/);
});

test('QA previews both paid bell history and the real paid bottom popup', () => {
  assert.match(qaHarness, /case 'NOTI-REWARD-PAID':/);
  assert.match(qaHarness, /previewRewardReceipt: QA_REWARD_RECEIPT/);
  assert.match(qaHarness, /case 'NOTI-REWARD-PAID-POPUP':/);
  assert.match(qaHarness, /<TransientSnackbar/);
  assert.match(qaHarness, /amountB3tr: '262\.97'/);
  assert.match(qaHarness, /REWARD_RECEIPT_COPY\[locale\]\.description/);
  assert.match(center, /previewRewardReceipt/);
  assert.match(center, /allowProgrammaticOpen/);
});

test('general and invite links keep the approved 1200x600 invite card while reward shares stay distinct', () => {
  assert.ok(rootLayout.includes("card: 'summary_large_image'"));
  assert.ok(rootLayout.includes('veinvite-og-invite-final.png'));
  assert.ok(rootLayout.includes('width: 1200'));
  assert.ok(rootLayout.includes('height: 600'));
  assert.ok(rootLayout.includes("type: 'image/png'"));

  assert.ok(legacyInvitePage.includes("card: 'summary_large_image'"));
  assert.ok(legacyInvitePage.includes('veinvite-og-invite-final.png'));
  assert.ok(legacyInvitePage.includes('width: 1200'));
  assert.ok(legacyInvitePage.includes('height: 600'));
  assert.ok(legacyInvitePage.includes("type: 'image/png'"));
  assert.ok(legacyInvitePage.includes("You've been invited to VeInvite"));
  assert.ok(legacyInvitePage.includes('robots: {'));

  assert.ok(referralPage.includes("card: 'summary_large_image'"));
  assert.ok(referralPage.includes('veinvite-og-invite-final.png'));
  assert.ok(referralPage.includes('width: 1200'));
  assert.ok(referralPage.includes('height: 600'));
  assert.ok(referralPage.includes("type: 'image/png'"));
  assert.ok(referralPage.includes("You've been invited to VeInvite"));
  assert.ok(referralPage.includes('robots: {'));
  assert.equal(
    referralPage.includes('veinvite-og-reward-final.png'),
    false,
  );

  assert.ok(socialReferralPage.includes("card: 'summary_large_image'"));
  assert.ok(socialReferralPage.includes('veinvite-og-reward-final.png'));
  assert.ok(socialReferralPage.includes('width: 1200'));
  assert.ok(socialReferralPage.includes('height: 600'));
  assert.ok(socialReferralPage.includes("type: 'image/png'"));
  assert.ok(socialReferralPage.includes('A friend earned B3TR with VeInvite'));
  assert.ok(socialReferralPage.includes('robots: {'));
  assert.equal(
    socialReferralPage.includes('veinvite-og-invite-final.png'),
    false,
  );

  const approvedCards = [
    {
      path: 'public/veinvite-og-invite-final.png',
      sha256: '2a2bba53ad02a8e57c398ff1d5da6cba68732de26c074d4fdca21da793409c37',
    },
    {
      path: 'public/veinvite-og-reward-final.png',
      sha256: '9904e5f38265271ec01b93d464ed05e9afc96476a61af54e5113a8ac77d86531',
    },
  ];

  for (const card of approvedCards) {
    assert.equal(
      existsSync(card.path),
      true,
      `approved OG PNG must exist: ${card.path}`,
    );
    const image = readFileSync(card.path);
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(image.readUInt32BE(16), 1200);
    assert.equal(image.readUInt32BE(20), 600);
    assert.equal(
      createHash('sha256').update(image).digest('hex'),
      card.sha256,
      `approved OG PNG bytes changed: ${card.path}`,
    );
  }
});

test('rollout keeps paid live sync without a duplicate standalone receipt surface', () => {
  assert.match(page, /<ActiveWalletRewardReceiptNotice \/>/);
  assert.match(activeReceipt, /<PaidActivationLiveSync/);
  assert.equal(
    activeReceipt.includes('import { RewardReceiptNotice }'),
    false,
  );
  assert.equal(activeReceipt.includes('<RewardReceiptNotice'), false);
});
