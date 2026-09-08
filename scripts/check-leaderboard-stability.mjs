import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(join(root, path), 'utf8');

const route = read('src/app/api/leaderboard/route.ts');
const cacheClient = read('src/lib/leaderboardClientCache.ts');
const leaderboardEntry = read('src/components/PublicLeaderboard.tsx');
const leaderboardHub = read('src/components/PublicLeaderboardHub.tsx');
const leaderboard = read('src/components/InviterLeaderboard.tsx');
const layoutPolish = read('src/components/SecondaryPageLayoutPolish.tsx');
const podiumGuard = read('src/app/leaderboard-podium-layout-guard.css');
const podiumArtwork = read('src/app/podium-laurel-option-c.css');
const podiumTuning = read('src/app/podium-laurel-size-tuning.css');
const rootLayout = read('src/app/layout.tsx');
const finalUiHardening = read('src/app/final-ui-hardening.css');
const appProviders = read('src/components/AppProviders.tsx');
const preview = read('src/components/LeaderboardUiPreview.tsx');
const migration = read('supabase/migrations/20260829043433_add_public_lifetime_leaderboard.sql');

const fail = (message) => failures.push(message);

if (!/LEADERBOARD_SIZE\s*=\s*100/.test(route) || !/p_limit:\s*LEADERBOARD_SIZE/.test(route)) {
  fail('Public leaderboard API must retain the reviewed Top 100 limit.');
}
if (!/least\(coalesce\(p_limit,\s*5\),\s*100\)/.test(migration)) {
  fail('Leaderboard RPC no longer preserves its hard 100-entry ceiling.');
}
if (!/get_public_lifetime_leaderboard_v2/.test(route)) {
  fail('Public leaderboard must use the current v2 ranking RPC.');
}
if (/get_public_lifetime_leaderboard'/.test(route) || /readLegacyLeaderboard|normalizeLegacyLeaderboardRow|falling back to the paid lifetime leaderboard/.test(route)) {
  fail('Retired leaderboard fallback code must not return.');
}
if (/stale-while-revalidate/.test(route)) {
  fail('Public leaderboard responses must not explicitly permit stale replay.');
}
if (!/public, s-maxage=10, must-revalidate/.test(route) || !/private, no-store/.test(route)) {
  fail('Leaderboard cache headers must keep short anonymous freshness and connected-wallet no-store behavior.');
}

if (!/FRESH_FOR_MS\s*=\s*30_000/.test(cacheClient)) {
  fail('Client leaderboard freshness window changed unexpectedly.');
}
if (!/function readFreshCachedPublicLeaderboard/.test(cacheClient) || !/getCachedPublicLeaderboard[\s\S]*return readFreshCachedPublicLeaderboard\(wallet\)/.test(cacheClient)) {
  fail('All public leaderboard cache reads must pass through the freshness guard.');
}
if (!/Date\.now\(\) - entry\.fetchedAt > FRESH_FOR_MS[\s\S]*cache\.delete\(key\)[\s\S]*latestNetworkByWallet\.delete\(walletKey\)[\s\S]*return null/.test(cacheClient)) {
  fail('Expired leaderboard cache entries must be deleted instead of displayed.');
}
if (!/previousNetwork && previousNetwork !== data\.network[\s\S]*cache\.delete\(networkCacheKey\(previousNetwork, walletKey\)\)/.test(cacheClient)) {
  fail('Leaderboard cache must discard the previous network entry when network identity changes.');
}

if (/\.slice\(0,\s*5\)/.test(leaderboard) || !/PUBLIC_RANK_LIMIT\s*=\s*100/.test(leaderboard)) {
  fail('Leaderboard UI regressed from the reviewed Top 100 behavior.');
}
if (!/RANK_SLOTS\s*=\s*Array\.from\([\s\S]*length:\s*PUBLIC_RANK_LIMIT/.test(leaderboard)) {
  fail('Ranks 1-100 must remain one continuous scrollable slot list.');
}
if (/className="myRankCard"|className="myRankButton"|className="rankPrimary"/.test(leaderboard)) {
  fail('Retired nested/separate rank wrappers must not return.');
}
if (!/currentUserInList/.test(leaderboard) || !/trailingCurrentUser/.test(leaderboard) || !/className="rankDivider"/.test(leaderboard)) {
  fail('Outside-Top-100 current-wallet fallback row is missing.');
}
if (!/<span>⋮<\/span>/.test(leaderboard)) {
  fail('Outside-Top-100 current-wallet row must keep the compact vertical ellipsis separator.');
}
if (/className="rankingTopline"|className="impactNote"|className="reportingSince"/.test(leaderboard)) {
  fail('Retired hidden leaderboard markup must not be rendered.');
}
if (/\.rankingTopline\s*\{|\.impactNote\s*\{|\.reportingSince\s*\{/.test(leaderboard)) {
  fail('Retired hidden leaderboard styles must not return.');
}
if (/\.rankStack::before|\.rankStack::after/.test(leaderboard)) {
  fail('Inviter component must not carry a second podium drawing.');
}
if (!/font-variant-numeric:tabular-nums/.test(leaderboard)) {
  fail('Leaderboard numeric columns must keep tabular numerals.');
}
if (/\.rows\s*\{[^}]*overflow(?:-y)?\s*:/s.test(leaderboard)) {
  fail('Leaderboard row wrapper must not add a second nested scroller.');
}

if (
  !/import \{ PublicLeaderboard as InviterLeaderboard \} from '\.\/InviterLeaderboard';/.test(leaderboardEntry) ||
  !/import \{ PublicLeaderboardHub \} from '\.\/PublicLeaderboardHub';/.test(leaderboardEntry) ||
  !/if \(previewData\)[\s\S]*<InviterLeaderboard[\s\S]*previewData=\{previewData\}/.test(leaderboardEntry) ||
  !/<PublicLeaderboardHub[\s\S]*locale=\{locale\}[\s\S]*wallet=\{wallet\}/.test(leaderboardEntry)
) {
  fail('Leaderboard entry point must preserve QA preview behavior and route live ranking through the country hub.');
}
if (
  !/import \{ PublicLeaderboard as InviterLeaderboard \} from '\.\/InviterLeaderboard';/.test(leaderboardHub) ||
  !/<InviterLeaderboard[\s\S]*previewData=\{data\}/.test(leaderboardHub) ||
  !/type RankingView = 'inviter' \| 'country'/.test(leaderboardHub)
) {
  fail('Country hub must embed the reviewed inviter leaderboard rather than reimplementing it.');
}

if (!/import \{ SecondaryPageLayoutPolish \} from '\.\/SecondaryPageLayoutPolish';/.test(appProviders) || !/<SecondaryPageLayoutPolish\s*\/>/.test(appProviders)) {
  fail('Shared secondary-page polish layer must remain mounted.');
}
if (/LeaderboardLaurelPreviewOverride/.test(appProviders)) {
  fail('Preview-only leaderboard override must never be mounted in production.');
}

if (!/\.leaderboardPage \.tableHeader,[\s\S]*\.leaderboardPage \.rankRow\s*\{[\s\S]*display:grid\s*!important[\s\S]*grid-template-columns:12fr 40fr 20fr 28fr\s*!important[\s\S]*column-gap:0\s*!important/.test(layoutPolish)) {
  fail('Leaderboard header and rows must share the reviewed 12/40/20/28 grid.');
}
if (!/--leaderboard-content-inset:12px[\s\S]*--leaderboard-scrollbar-width:5px/.test(layoutPolish) || !/padding-inline:var\(--leaderboard-content-inset\)\s*!important/.test(layoutPolish)) {
  fail('Leaderboard header and rows must share one content inset and scrollbar width.');
}
if (
  !/\.leaderboardPage \.rankStack\s*\{[\s\S]*grid-column:1\s*!important/.test(layoutPolish) ||
  !/\.leaderboardPage \.walletCell\s*\{[\s\S]*grid-column:2\s*!important/.test(layoutPolish) ||
  !/\.leaderboardPage \.completedMetric\s*\{[\s\S]*grid-column:3\s*!important/.test(layoutPolish) ||
  !/\.leaderboardPage \.rewardMetric\s*\{[\s\S]*grid-column:4\s*!important/.test(layoutPolish)
) {
  fail('Leaderboard visible values must stay pinned to columns 1-4.');
}
if (!/\.leaderboardPage \.rankingCard\s*\{[\s\S]*--leaderboard-row-height:50px/.test(layoutPolish)) {
  fail('Desktop leaderboard must keep the reviewed row height.');
}
if (!/\.leaderboardPage \.rankScroll\s*\{[\s\S]*height:calc\(var\(--leaderboard-row-height\) \* 5\)\s*!important[\s\S]*overflow-y:auto\s*!important/.test(layoutPolish)) {
  fail('Leaderboard viewport must show exactly five rows before scrolling.');
}
if (!/\.leaderboardPage \.tableHeader,[\s\S]*\.leaderboardPage \.rankRow\.trailingCurrent\s*\{[\s\S]*overflow-y:scroll\s*!important[\s\S]*scrollbar-gutter:stable\s*!important/.test(layoutPolish)) {
  fail('Header and trailing row must reserve the same scrollbar lane as ranked rows.');
}
if (!/\.leaderboardPage \.rankValue\s*\{[\s\S]*min-inline-size:3ch\s*!important[\s\S]*font-variant-numeric:tabular-nums lining-nums\s*!important/.test(layoutPolish)) {
  fail('Rank numerals must keep stable tabular numeric typography.');
}
if (/\.leaderboardPage \.rankValue\s*\{[^}]*\n\s*position\s*:/s.test(layoutPolish)) {
  fail('Secondary polish must not override rank positioning owned by the podium layout guard.');
}
if (/rankValue::before|rankValue::after|placeholderRow\):nth-child|featured:nth-child/.test(layoutPolish)) {
  fail('Secondary polish must not carry duplicate podium artwork.');
}
if (/\.walletAvatar:empty/.test(layoutPolish)) {
  fail('Obsolete empty-avatar loading placeholder must not return now that Picasso renders immediately.');
}
if (!/\.leaderboardPage \.walletAvatar img\s*\{[\s\S]*object-fit:contain\s*!important[\s\S]*object-position:center\s*!important/.test(layoutPolish)) {
  fail('Resolved wallet avatars must remain uncropped and centered.');
}
if (!/@media \(max-width:420px\)[\s\S]*--leaderboard-row-height:46px[\s\S]*--leaderboard-content-inset:8px/.test(layoutPolish) || !/@media \(max-width:360px\)[\s\S]*--leaderboard-row-height:44px[\s\S]*--leaderboard-content-inset:6px/.test(layoutPolish)) {
  fail('Reviewed responsive leaderboard row geometry is missing.');
}

if (!/\.rankValue\.rankValue \{[\s\S]*position:absolute !important[\s\S]*left:50% !important[\s\S]*top:50% !important[\s\S]*transform:translate\(-50%,-50%\) !important/.test(podiumGuard)) {
  fail('Podium layout guard must own one locale-neutral rank axis.');
}
if (!/\.rankMovement\.rankMovement \{[\s\S]*width:100% !important[\s\S]*justify-content:center !important[\s\S]*transform:none !important/.test(podiumGuard)) {
  fail('Movement labels must remain isolated in a fixed full-width rank slot.');
}
if (/content:none !important|display:none !important/.test(podiumGuard)) {
  fail('Podium guard must not suppress obsolete artwork; obsolete artwork should be deleted at source.');
}
if (!/--podium-shape:path\(/.test(podiumArtwork) || !/rankValue\.rankValue::before/.test(podiumArtwork)) {
  fail('Approved Option C podium artwork is missing.');
}
if (!/scale\(\.80\)/.test(podiumTuning) || !/scale\(\.95\)/.test(podiumTuning)) {
  fail('Approved podium size tuning changed unexpectedly.');
}
const optionIndex = rootLayout.indexOf("./podium-laurel-option-c.css");
const tuningIndex = rootLayout.indexOf("./podium-laurel-size-tuning.css");
const guardIndex = rootLayout.indexOf("./leaderboard-podium-layout-guard.css");
if (!(optionIndex >= 0 && tuningIndex > optionIndex && guardIndex > tuningIndex)) {
  fail('Approved podium artwork, tuning, and layout guard must load in the reviewed order.');
}
if (/rankValue::before|featured:nth-child|placeholderRow:nth-child/.test(finalUiHardening)) {
  fail('Global final hardening must not carry a hidden podium implementation.');
}

if (!/getPicassoImage\(address\)/.test(leaderboard) || !/useVechainDomain/.test(leaderboard) || !/useGetAvatar/.test(leaderboard)) {
  fail('Leaderboard must preserve immediate Picasso plus real VET Domain profile resolution.');
}
if (/useGetAvatarOfAddress/.test(leaderboard) || /radial-gradient\(circle at 50% 35%,#eec04c|radial-gradient\(ellipse at 50% 82%,#eec04c/.test(leaderboard)) {
  fail('Retired avatar fallback behavior must not return.');
}

if (!/rank:\s*0,[\s\S]*completedReferrals:\s*0,[\s\S]*totalRewardWei:\s*'0'/.test(leaderboard)) {
  fail('Unranked connected wallet must retain rank dash, invite count 0, and reward 0 source data.');
}
if (!/Array\.from\(\{\s*length:\s*100\s*\}/.test(preview)) {
  fail('UI test leaderboard must exercise a full 100-row preview.');
}
if (!/rank:\s*137/.test(preview) || !/100위 밖/.test(preview)) {
  fail('UI test leaderboard must cover the current-wallet outside-Top-100 state.');
}
if (!/PreviewScenario = 'inside' \| 'outside' \| 'unranked'/.test(preview) || !/scenario === 'unranked'\) return \[\]/.test(preview) || !/useState<PreviewScenario>\('unranked'\)/.test(preview)) {
  fail('UI test must preserve the exact unranked scenario that previously regressed.');
}

if (failures.length > 0) {
  console.error('Leaderboard stability gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Leaderboard stability gate passed.');
