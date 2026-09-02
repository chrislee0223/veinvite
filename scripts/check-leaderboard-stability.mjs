import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

const route = read('src/app/api/leaderboard/route.ts');
const leaderboard = read('src/components/PublicLeaderboard.tsx');
const layoutPolish = read('src/components/SecondaryPageLayoutPolish.tsx');
const appProviders = read('src/components/AppProviders.tsx');
const preview = read('src/components/LeaderboardUiPreview.tsx');
const migration = read(
  'supabase/migrations/20260829043433_add_public_lifetime_leaderboard.sql',
);

if (!/LEADERBOARD_SIZE\s*=\s*100/.test(route)) {
  failures.push('Public leaderboard API must request the reviewed Top 100.');
}
if (!/p_limit:\s*LEADERBOARD_SIZE/.test(route)) {
  failures.push('Leaderboard RPC limit must stay bound to LEADERBOARD_SIZE.');
}
if (!/least\(coalesce\(p_limit,\s*5\),\s*100\)/.test(migration)) {
  failures.push('Leaderboard RPC no longer preserves its hard 100-entry ceiling.');
}
if (/\.slice\(0,\s*5\)/.test(leaderboard)) {
  failures.push('Leaderboard UI regressed to a Top 5-only list.');
}
if (!/PUBLIC_RANK_LIMIT\s*=\s*100/.test(leaderboard)) {
  failures.push('Leaderboard UI must retain the reviewed Top 100 limit.');
}
if (/className="myRankCard"|className="myRankButton"/.test(leaderboard)) {
  failures.push('Separate My Rank card must not return; current rank belongs in the main ranking flow.');
}
if (
  !/currentUserInList/.test(leaderboard) ||
  !/trailingCurrentUser/.test(leaderboard) ||
  !/className="rankDivider"/.test(leaderboard)
) {
  failures.push('Outside-Top-100 current-wallet fallback row is missing.');
}
if (!/entry\.rank\s*>\s*0\s*&&\s*entry\.rank\s*<=\s*5\s*\?\s*'featured'\s*:\s*'compact'/.test(leaderboard)) {
  failures.push('Top 5 and ranks 6-100 no longer use the reviewed density split.');
}
if (!/font-variant-numeric:tabular-nums/.test(leaderboard)) {
  failures.push('Leaderboard numeric columns must keep tabular numerals.');
}
if (/\.rows\s*\{[^}]*overflow(?:-y)?\s*:/s.test(leaderboard)) {
  failures.push('Leaderboard must use normal page scrolling, not a nested row scroller.');
}

if (!/import \{ SecondaryPageLayoutPolish \} from '\.\/SecondaryPageLayoutPolish';/.test(appProviders)) {
  failures.push('AppProviders must keep the shared secondary-page polish layer mounted.');
}
if (!/<SecondaryPageLayoutPolish\s*\/>/.test(appProviders)) {
  failures.push('AppProviders must mount the shared secondary-page polish layer.');
}
if (!/\.leaderboardPage \.rankingTopline\s*\{[\s\S]*?display:none\s*!important/.test(layoutPolish)) {
  failures.push('The redundant visible Top 100 badge returned.');
}

// The leaderboard now owns its row geometry in one component. Global layout
// overrides previously fought the scoped component CSS and repeatedly caused
// the unranked wallet values to collapse toward the center of the card.
if (/\.leaderboardPage \.rankRow\s*\{|\.leaderboardPage \.tableHeader\s*\{/.test(layoutPolish)) {
  failures.push('SecondaryPageLayoutPolish must not override leaderboard row/header geometry.');
}
if (/className="rankPrimary"/.test(leaderboard) || /\.rankPrimary\s*\{/.test(leaderboard)) {
  failures.push('The retired nested rankPrimary wrapper must not return.');
}
if (
  !/--rank-column:42px/.test(leaderboard) ||
  !/--completed-column:86px/.test(leaderboard) ||
  !/--reward-column:104px/.test(leaderboard) ||
  !/\.tableHeader,\.rankRow\s*\{[\s\S]*grid-template-columns:[\s\S]*var\(--rank-column\)[\s\S]*minmax\(0,1fr\)[\s\S]*var\(--completed-column\)[\s\S]*var\(--reward-column\)/.test(leaderboard)
) {
  failures.push('Header and rows must share the same source-owned four-column geometry.');
}
if (
  !/<strong className="rankValue">[\s\S]*<span className="walletCell">[\s\S]*<span className="rankMetric completedMetric">[\s\S]*<span className="rankMetric rewardMetric">/.test(leaderboard)
) {
  failures.push('Rank, inviter, invite count, and reward must remain direct sibling cells in that exact order.');
}
if (
  !/\.rankValue\s*\{[\s\S]*grid-column:1/.test(leaderboard) ||
  !/\.walletCell\s*\{[\s\S]*grid-column:2/.test(leaderboard) ||
  !/\.completedMetric\s*\{[\s\S]*grid-column:3/.test(leaderboard) ||
  !/\.rewardMetric\s*\{[\s\S]*grid-column:4/.test(leaderboard)
) {
  failures.push('Leaderboard visible values must stay pinned to columns 1-4.');
}
if (!/\.tableHeader span\s*\{[\s\S]*text-align:center/.test(leaderboard)) {
  failures.push('All four leaderboard headers must stay centered over their value columns.');
}
if (!/className="walletAvatar"/.test(leaderboard) || !/\.walletAvatar\s*\{/.test(leaderboard)) {
  failures.push('Neutral wallet-avatar fallback is missing from leaderboard rows.');
}
if (
  !/rank:\s*0,[\s\S]*completedReferrals:\s*0,[\s\S]*totalRewardWei:\s*'0'/.test(leaderboard)
) {
  failures.push('Unranked connected wallet must retain rank dash, invite count 0, and reward 0 B3TR source data.');
}
if (/trailingCurrent[\s\S]*completedMetric[\s\S]*content:\s*['"]—['"]/.test(leaderboard)) {
  failures.push('Approved unranked layout shows invite count 0; do not replace it with a CSS dash.');
}
if (!/@media \(max-width:420px\)[\s\S]*--completed-column:62px[\s\S]*--reward-column:82px/.test(leaderboard)) {
  failures.push('Reviewed narrow-phone leaderboard geometry is missing.');
}
if (!/@media \(max-width:360px\)[\s\S]*--completed-column:58px[\s\S]*--reward-column:76px/.test(leaderboard)) {
  failures.push('Reviewed extra-narrow-phone leaderboard geometry is missing.');
}

if (!/Array\.from\(\{\s*length:\s*100\s*\}/.test(preview)) {
  failures.push('UI test leaderboard must exercise a full 100-row preview.');
}
if (!/rank:\s*137/.test(preview) || !/100위 밖/.test(preview)) {
  failures.push('UI test leaderboard must cover the current-wallet outside-Top-100 state.');
}
if (
  !/PreviewScenario = 'inside' \| 'outside' \| 'unranked'/.test(preview) ||
  !/scenario === 'unranked'\) return \[\]/.test(preview) ||
  !/useState<PreviewScenario>\('unranked'\)/.test(preview) ||
  !/미순위 · 초대 0건/.test(preview)
) {
  failures.push('UI test must default to the exact unranked zero-invite state that previously regressed in production.');
}

if (failures.length > 0) {
  console.error('Leaderboard stability gate failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Leaderboard stability gate passed.');