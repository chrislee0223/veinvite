import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(join(root, path), 'utf8');

const route = read('src/app/api/leaderboard/route.ts');
const leaderboard = read('src/components/PublicLeaderboard.tsx');
const layoutPolish = read('src/components/SecondaryPageLayoutPolish.tsx');
const appProviders = read('src/components/AppProviders.tsx');
const preview = read('src/components/LeaderboardUiPreview.tsx');
const migration = read('supabase/migrations/20260829043433_add_public_lifetime_leaderboard.sql');

if (!/LEADERBOARD_SIZE\s*=\s*100/.test(route) || !/p_limit:\s*LEADERBOARD_SIZE/.test(route)) {
  failures.push('Public leaderboard API must retain the reviewed Top 100 limit.');
}
if (!/least\(coalesce\(p_limit,\s*5\),\s*100\)/.test(migration)) {
  failures.push('Leaderboard RPC no longer preserves its hard 100-entry ceiling.');
}
if (/\.slice\(0,\s*5\)/.test(leaderboard) || !/PUBLIC_RANK_LIMIT\s*=\s*100/.test(leaderboard)) {
  failures.push('Leaderboard UI regressed from the reviewed Top 100 behavior.');
}
if (!/RANK_SLOTS\s*=\s*Array\.from\([\s\S]*length:\s*PUBLIC_RANK_LIMIT/.test(leaderboard)) {
  failures.push('Ranks 1-100 must remain one continuous scrollable slot list.');
}
if (/className="myRankCard"|className="myRankButton"|className="rankPrimary"/.test(leaderboard)) {
  failures.push('Retired nested/separate rank wrappers must not return.');
}
if (!/currentUserInList/.test(leaderboard) || !/trailingCurrentUser/.test(leaderboard) || !/className="rankDivider"/.test(leaderboard)) {
  failures.push('Outside-Top-100 current-wallet fallback row is missing.');
}
if (!/<span>⋮<\/span>/.test(leaderboard)) {
  failures.push('Outside-Top-100 current-wallet row must use the compact vertical ellipsis separator.');
}
if (!/font-variant-numeric:tabular-nums/.test(leaderboard)) {
  failures.push('Leaderboard numeric columns must keep tabular numerals.');
}
if (/\.rows\s*\{[^}]*overflow(?:-y)?\s*:/s.test(leaderboard)) {
  failures.push('Leaderboard row wrapper must not add a second nested scroller.');
}

if (!/import \{ SecondaryPageLayoutPolish \} from '\.\/SecondaryPageLayoutPolish';/.test(appProviders) || !/<SecondaryPageLayoutPolish\s*\/>/.test(appProviders)) {
  failures.push('Shared secondary-page polish layer must remain mounted.');
}
if (!/\.leaderboardPage \.rankingTopline\s*\{[\s\S]*?display:none\s*!important/.test(layoutPolish)) {
  failures.push('The redundant visible Top 100 badge returned.');
}

// The final rendered leaderboard geometry is intentionally global and scoped
// by .leaderboardPage. This avoids styled-jsx helper-renderer scoping gaps while
// keeping the header and every row on one proportional, screenshot-independent
// grid. The wallet avatar/text spacing is guarded here because that exact pair
// previously overlapped on narrow cards.
if (!/\.leaderboardPage \.tableHeader,[\s\S]*\.leaderboardPage \.rankRow\s*\{[\s\S]*display:grid\s*!important[\s\S]*grid-template-columns:12fr 40fr 20fr 28fr\s*!important[\s\S]*column-gap:0\s*!important/.test(layoutPolish)) {
  failures.push('Leaderboard header and rows must share the reviewed proportional 12/40/20/28 grid.');
}
if (
  !/\.leaderboardPage \.rankValue\s*\{[\s\S]*grid-column:1\s*!important/.test(layoutPolish) ||
  !/\.leaderboardPage \.walletCell\s*\{[\s\S]*grid-column:2\s*!important/.test(layoutPolish) ||
  !/\.leaderboardPage \.completedMetric\s*\{[\s\S]*grid-column:3\s*!important/.test(layoutPolish) ||
  !/\.leaderboardPage \.rewardMetric\s*\{[\s\S]*grid-column:4\s*!important/.test(layoutPolish)
) {
  failures.push('Leaderboard visible values must stay pinned to columns 1-4.');
}
if (!/\.leaderboardPage \.rankingCard\s*\{[\s\S]*--leaderboard-row-height:50px/.test(layoutPolish)) {
  failures.push('Desktop leaderboard must keep the reviewed compact row height.');
}
if (!/\.leaderboardPage \.rankScroll\s*\{[\s\S]*height:calc\(var\(--leaderboard-row-height\) \* 5\)\s*!important[\s\S]*overflow-y:auto\s*!important/.test(layoutPolish)) {
  failures.push('Leaderboard viewport must show exactly five rows before scrolling.');
}
if (!/\.leaderboardPage \.rankRow,[\s\S]*\.leaderboardPage \.rankRow\.compact\s*\{[\s\S]*height:var\(--leaderboard-row-height\)\s*!important[\s\S]*min-height:var\(--leaderboard-row-height\)\s*!important/.test(layoutPolish)) {
  failures.push('Every rank slot must use the same fixed row height so the five-row viewport cannot collapse.');
}
if (!/nth-child\(-n\+3\)[\s\S]*border:1px solid currentColor\s*!important/.test(layoutPolish) || !/nth-child\(1\)[\s\S]*#f1bd34\s*!important/.test(layoutPolish) || !/nth-child\(2\)[\s\S]*#c8cbd0\s*!important/.test(layoutPolish) || !/nth-child\(3\)[\s\S]*#c98252\s*!important/.test(layoutPolish)) {
  failures.push('Top three ranks must retain the restrained gold, silver, and bronze treatment.');
}
if (!/\.leaderboardPage \.rankDivider\s*\{[\s\S]*min-height:18px\s*!important[\s\S]*place-items:center\s*!important/.test(layoutPolish) || !/\.leaderboardPage \.rankRow\.trailingCurrent\s*\{[\s\S]*height:var\(--leaderboard-row-height\)\s*!important/.test(layoutPolish)) {
  failures.push('Outside-Top-100 current-wallet display must stay compact and visually connected to the table.');
}
if (!/\.leaderboardPage \.walletCell\s*\{[\s\S]*gap:9px\s*!important[\s\S]*overflow:hidden\s*!important/.test(layoutPolish)) {
  failures.push('Inviter avatar and wallet address must retain a real gap and clipped cell boundary.');
}
if (!/\.leaderboardPage \.walletAvatar\s*\{[\s\S]*flex:0 0 22px\s*!important[\s\S]*width:22px\s*!important[\s\S]*height:22px\s*!important/.test(layoutPolish)) {
  failures.push('Neutral wallet avatar must keep a non-shrinking desktop footprint.');
}
if (!/\.leaderboardPage \.walletText\s*\{[\s\S]*max-width:calc\(100% - 31px\)\s*!important[\s\S]*text-overflow:ellipsis\s*!important[\s\S]*white-space:nowrap\s*!important/.test(layoutPolish)) {
  failures.push('Wallet text must reserve avatar space instead of overlapping it.');
}
if (!/@media \(max-width:420px\)[\s\S]*--leaderboard-row-height:46px[\s\S]*gap:6px\s*!important[\s\S]*flex-basis:18px\s*!important/.test(layoutPolish)) {
  failures.push('Reviewed 420px row height and inviter identity spacing are missing.');
}
if (!/@media \(max-width:360px\)[\s\S]*--leaderboard-row-height:44px[\s\S]*gap:5px\s*!important[\s\S]*flex-basis:16px\s*!important/.test(layoutPolish)) {
  failures.push('Reviewed 360px row height and inviter identity spacing are missing.');
}

if (!/<strong className="rankValue">[\s\S]*<span className="walletCell">[\s\S]*<span className="rankMetric completedMetric">[\s\S]*<span className="rankMetric rewardMetric">/.test(leaderboard)) {
  failures.push('Rank, inviter, invite count, and reward must remain direct sibling cells in that exact order.');
}
if (!/className="walletAvatar"/.test(leaderboard)) {
  failures.push('Neutral wallet-avatar fallback is missing from leaderboard rows.');
}
if (!/rank:\s*0,[\s\S]*completedReferrals:\s*0,[\s\S]*totalRewardWei:\s*'0'/.test(leaderboard)) {
  failures.push('Unranked connected wallet must retain rank dash, invite count 0, and reward 0 B3TR source data.');
}
if (/trailingCurrent[\s\S]*completedMetric[\s\S]*content:\s*['"]—['"]/.test(leaderboard)) {
  failures.push('Approved unranked layout shows invite count 0; do not replace it with a CSS dash.');
}

if (!/Array\.from\(\{\s*length:\s*100\s*\}/.test(preview)) {
  failures.push('UI test leaderboard must exercise a full 100-row preview.');
}
if (!/rank:\s*137/.test(preview) || !/100위 밖/.test(preview)) {
  failures.push('UI test leaderboard must cover the current-wallet outside-Top-100 state.');
}
if (!/PreviewScenario = 'inside' \| 'outside' \| 'unranked'/.test(preview) || !/scenario === 'unranked'\) return \[\]/.test(preview) || !/useState<PreviewScenario>\('unranked'\)/.test(preview) || !/미순위 · 초대 0건/.test(preview)) {
  failures.push('UI test must default to the exact unranked zero-invite state that previously regressed in production.');
}

if (failures.length > 0) {
  console.error('Leaderboard stability gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Leaderboard stability gate passed.');