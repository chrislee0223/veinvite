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

// The effective production layout is intentionally hardened by a mounted
// global style layer. Guard the final presentation, not only the base JSX
// component, so a future refactor cannot silently recreate the misaligned
// unranked row that was visible in production on 2026-09-01.
if (!/import \{ SecondaryPageLayoutPolish \} from '\.\/SecondaryPageLayoutPolish';/.test(appProviders)) {
  failures.push('AppProviders must import the final secondary-page layout polish layer.');
}
if (!/<SecondaryPageLayoutPolish\s*\/>/.test(appProviders)) {
  failures.push('AppProviders must mount the final secondary-page layout polish layer.');
}
if (!/\.leaderboardPage \.rankingTopline\s*\{[\s\S]*?display:none\s*!important/.test(layoutPolish)) {
  failures.push('The redundant visible Top 100 badge returned.');
}
if (
  !/--rank-column:34px/.test(layoutPolish) ||
  !/--completed-column:78px/.test(layoutPolish) ||
  !/--reward-column:98px/.test(layoutPolish) ||
  !/grid-template-columns:[\s\S]*var\(--rank-column\)[\s\S]*minmax\(0,1fr\)[\s\S]*var\(--completed-column\)[\s\S]*var\(--reward-column\)\s*!important/.test(layoutPolish)
) {
  failures.push('Leaderboard header and rows no longer share the reviewed four-column geometry.');
}
if (
  !/\.tableHeader span:nth-child\(2\)[\s\S]*padding-left:27px\s*!important/.test(layoutPolish) ||
  !/\.walletCell\s*\{[\s\S]*padding-left:27px\s*!important/.test(layoutPolish)
) {
  failures.push('Inviter header and wallet text can drift out of alignment again.');
}
if (!/\.tableHeader span:nth-child\(3\),[\s\S]*\.tableHeader span:nth-child\(4\)[\s\S]*text-align:center\s*!important/.test(layoutPolish)) {
  failures.push('Invite-count and reward headers must stay centered over their numeric columns.');
}
if (!/\.leaderboardPage \.walletCell::before\s*\{/.test(layoutPolish)) {
  failures.push('Neutral wallet-avatar fallback is missing from leaderboard rows.');
}
if (
  !/\.rankRow\.trailingCurrent \.completedMetric b::after\s*\{[\s\S]*content:'—'\s*!important/.test(layoutPolish)
) {
  failures.push('Unranked connected wallets must show a dash instead of a misleading invite-count zero.');
}
if (!/@media \(max-width:420px\)[\s\S]*--completed-column:64px[\s\S]*--reward-column:84px/.test(layoutPolish)) {
  failures.push('Reviewed narrow-phone leaderboard geometry is missing.');
}
if (!/@media \(max-width:360px\)[\s\S]*--completed-column:58px[\s\S]*--reward-column:78px/.test(layoutPolish)) {
  failures.push('Reviewed extra-narrow-phone leaderboard geometry is missing.');
}

if (!/Array\.from\(\{\s*length:\s*100\s*\}/.test(preview)) {
  failures.push('UI test leaderboard must exercise a full 100-row preview.');
}
if (!/rank:\s*137/.test(preview) || !/100위 밖/.test(preview)) {
  failures.push('UI test leaderboard must cover the current-wallet outside-Top-100 state.');
}

if (failures.length > 0) {
  console.error('Leaderboard stability gate failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Leaderboard stability gate passed.');
