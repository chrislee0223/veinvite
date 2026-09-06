import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const facade = read('src/components/InviteNotificationHistoryCenter.tsx');
const center = read('src/components/UnifiedInviteNotificationHistoryCenter.tsx');
const actionsRoute = read('src/app/api/notifications/reward-actions/route.ts');
const claimRoute = read('src/app/api/rewards/claims/route.ts');
const page = read('src/app/page.tsx');
const home = read('src/components/HomeClient.tsx');

test('notification reward actions are live wallet-scoped state, not cached history authority', () => {
  assert.match(actionsRoute, /requireWalletSession/);
  assert.match(actionsRoute, /\.eq\('recipient_wallet', walletAddress\)/);
  assert.match(
    actionsRoute,
    /\.in\('status', \['AWAITING_CLAIM', 'QUEUED', 'ASSIGNED'\]\)/,
  );
  assert.match(actionsRoute, /invitation\.status !== 'COMPLETED'/);
  assert.match(actionsRoute, /invitation\.reward_status !== 'ELIGIBLE'/);
  assert.match(actionsRoute, /invitation\.reward_eligible_at === null/);
  assert.match(actionsRoute, /invitation\.sybil_status !== 'CLEAR'/);
  assert.match(actionsRoute, /invitation\.sybil_checked_at === null/);
  assert.match(
    actionsRoute,
    /queue\.eligible_at !== invitation\.reward_eligible_at/,
  );
  assert.match(actionsRoute, /'Cache-Control': 'no-store'/);
  assert.match(center, /fetch\('\/api\/notifications\/reward-actions'/);
  assert.doesNotMatch(center, /sessionStorage/);
});

test('only awaiting rewards expose Claim while queued and assigned rewards show processing', () => {
  assert.match(center, /action\.status !== 'AWAITING_CLAIM'/);
  assert.match(center, /const waiting = action\.status === 'AWAITING_CLAIM'/);
  assert.match(center, /className="notificationClaimButton"/);
  assert.match(center, /progressCopy\.claimReward/);
  assert.match(center, /className="notificationProcessingBadge"/);
  assert.match(center, /progressCopy\.claimQueued/);
  assert.match(center, /fetch\('\/api\/rewards\/claims'/);

  assert.match(claimRoute, /request_reward_claim/);
  assert.match(claimRoute, /runAutomaticRewardPayout/);
});

test('an unresolved Claim stays visible on the bell without piggybacking on history polling', () => {
  assert.match(facade, /const \{ wallet \} = useWalletLauncher\(\)/);
  assert.match(facade, /fetch\('\/api\/notifications\/reward-actions'/);
  assert.match(facade, /action\.status === 'AWAITING_CLAIM'/);
  assert.match(
    facade,
    /needsRewardClaim && props\.unreadCount < 1/,
  );
  assert.match(facade, /\[wallet, props\.open\]/);
  assert.doesNotMatch(facade, /\[props\.items\]/);
  assert.match(facade, /notificationRewardAttentionDot/);
  assert.match(facade, /role="status"/);
  assert.match(facade, /REWARD_RESERVATION_READY_EVENT/);
  assert.match(facade, /REWARD_CLAIM_UPDATED_EVENT/);
  assert.match(facade, /WALLET_SESSION_INVALID_EVENT/);
  assert.match(facade, /document\.visibilityState === 'visible'/);
  assert.doesNotMatch(facade, /setInterval/);
});

test('reward-ready history is an event while paid history remains reopenable as a receipt', () => {
  assert.match(center, /case 'REWARD_READY':/);
  assert.doesNotMatch(center, /item\.kind === 'REWARD_READY'[\s\S]{0,180}structure\.action/);
  assert.match(center, /const paid = item\.kind === 'REWARD_PAID'/);
  assert.match(center, /notificationHistoryRow isRead isInteractive/);
  assert.match(center, /openRewardReceipt\(item\)/);
  assert.match(center, /\/api\/rewards\/receipts\?limit=50/);
  assert.match(center, /candidate\.inviteCode === item\.inviteCode/);
  assert.match(center, /getVeChainExplorerTransactionUrl/);
  assert.match(center, /ACKNOWLEDGE_REWARD_RECEIPT/);
});

test('rollout keeps existing Home Claim and standalone receipt notice as temporary safety fallbacks', () => {
  assert.match(home, /fetch\('\/api\/rewards\/claims'/);
  assert.match(home, /className="claimButton"/);
  assert.match(page, /<ActiveWalletRewardReceiptNotice \/>/);
});
