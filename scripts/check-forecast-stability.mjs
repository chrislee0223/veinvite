import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const legacyPortals = [
  'src/components/PublicRewardEstimatePortal.tsx',
  'src/components/PublicRewardForecastPortal.tsx',
  'src/components/DeferredStartupExtras.tsx',
];

for (const legacyPath of legacyPortals) {
  if (existsSync(join(root, legacyPath))) {
    failures.push(
      `Retired reward forecast attachment must stay removed: ${legacyPath}.`,
    );
  }
}

const forecastCard = readFileSync(
  join(root, 'src/components/PublicRewardForecastCard.tsx'),
  'utf8',
);
const homeClient = readFileSync(
  join(root, 'src/components/HomeClient.tsx'),
  'utf8',
);
const forecastCopy = readFileSync(
  join(root, 'src/lib/i18n/rewardForecastCopy.ts'),
  'utf8',
);
const localeRegistry = readFileSync(
  join(root, 'src/lib/i18n/locales.ts'),
  'utf8',
);
const typography = readFileSync(
  join(root, 'src/app/localized-typography.css'),
  'utf8',
);

if (
  !/CLIENT_FORECAST_CACHE_MS\s*=\s*15\s*\*\s*60_000/.test(forecastCard) ||
  !/setInterval\(\s*\(\) => \{\s*void loadForecast\(true\);\s*\},\s*CLIENT_FORECAST_CACHE_MS\s*,?\s*\)/s.test(forecastCard)
) {
  failures.push(
    'Public reward forecast live refresh must stay at the reviewed 15-minute cadence.',
  );
}

if (/setInterval\([^)]*,\s*60_000\s*,?\s*\)/s.test(forecastCard)) {
  failures.push(
    'Public reward forecast must not regress to one-minute client polling.',
  );
}

if (
  !/LIVE_REFRESH_THROTTLE_MS\s*=\s*60_000/.test(forecastCard) ||
  !/lastLiveRefreshAt/.test(forecastCard)
) {
  failures.push(
    'Public reward forecast focus and visibility refreshes must stay rate-bounded.',
  );
}

for (const legacyDetail of [
  'estimateRange',
  'estimateMeta',
  'formatUpdatedAt',
]) {
  if (forecastCard.includes(legacyDetail)) {
    failures.push(
      `Public reward forecast UI must stay simplified; legacy detail returned: ${legacyDetail}.`,
    );
  }
}

if (
  !/data-home-reward-forecast="true"/.test(forecastCard) ||
  !/<PublicRewardForecastCard locale=\{locale\} \/>/.test(homeClient)
) {
  failures.push(
    'Public reward forecast must remain a direct Home surface instead of a Leaderboard attachment.',
  );
}

if (!/rewardForecastPreview/.test(forecastCard)) {
  failures.push(
    'UI test reward forecast must keep its fake-data preview path instead of fetching production data.',
  );
}

if (!/REWARD_FORECAST_COPY\[(?:resolvedLocale|locale)\]/.test(forecastCard)) {
  failures.push(
    'Public reward forecast component must read copy from the centralized locale table.',
  );
}

if (/const\s+COPY\s*:\s*Record<\s*SupportedLocale/.test(forecastCard)) {
  failures.push(
    'Public reward forecast copy must not drift back into a component-local locale table.',
  );
}

if (
  !/let\s+cachedForecast\s*:/.test(forecastCard) ||
  !/function\s+requestForecast\s*\(/.test(forecastCard) ||
  !/min-height:142px/.test(forecastCard) ||
  !/PERSISTED_FORECAST_STORAGE_KEY/.test(forecastCard) ||
  !/function\s+readPersistedForecast\s*\(/.test(forecastCard) ||
  !/useIsomorphicLayoutEffect/.test(forecastCard)
) {
  failures.push(
    'Public reward forecast must retain its warm cache, pre-paint last-good restoration, and stable Home footprint.',
  );
}

if (/amountSkeleton|noteSkeleton|forecastSkeletonPulse/.test(forecastCard)) {
  failures.push(
    'Public reward forecast must not restore the hard-refresh loading pulse.',
  );
}

if (/createPortal|MutationObserver|flushSync/.test(forecastCard)) {
  failures.push(
    'Public reward forecast must not restore the retired DOM portal attachment path.',
  );
}

if (!/dir=\{getLocaleDirection\(resolvedLocale\)\}/.test(forecastCard)) {
  failures.push(
    'Public reward forecast must derive direction from locale metadata so every RTL locale is handled, not Arabic alone.',
  );
}

const localePattern = /locale:\s*'([a-z]{2,3}(?:-[a-z0-9]{2,8})*)'/g;
const locales = [...localeRegistry.matchAll(localePattern)].map((match) => match[1]);
for (const locale of locales) {
  const escaped = locale.replaceAll('-', '\\-');
  if (!new RegExp(`\\n\\s{2}(?:${escaped}|['\"]${escaped}['\"]):\\s*\\{`).test(forecastCopy)) {
    failures.push(
      `Public reward forecast copy is incomplete for locale: ${locale}.`,
    );
  }
}

if (
  !/친구가 모든 미션을 완료하면 받을 수 있습니다/.test(forecastCopy) ||
  !/आपके आमंत्रित मित्र के सभी मिशन पूरे करने पर आप यह इनाम पा सकते हैं/.test(forecastCopy) ||
  !/招待した友だちがすべてのミッションを完了すると受け取れます/.test(forecastCopy) ||
  !/Puoi riceverla quando l’amico che hai invitato completa tutte le missioni/.test(forecastCopy) ||
  !/Je kunt deze ontvangen zodra de vriend die je hebt uitgenodigd alle missies voltooit/.test(forecastCopy) ||
  !/Du kannst sie erhalten, sobald dein eingeladener Freund alle Missionen abgeschlossen hat/.test(forecastCopy)
) {
  failures.push(
    'Public reward forecast mission-completion wording regressed in one or more reviewed locales.',
  );
}

if (
  /If you start inviting now/.test(forecastCopy) ||
  /지금 초대를 시작한다면/.test(forecastCopy) ||
  /Estimated per successful invite/.test(forecastCopy) ||
  /성공한 초대 1건 예상/.test(forecastCopy) ||
  /招待成功1件あたり/.test(forecastCopy) ||
  /हर सफल आमंत्रण पर/.test(forecastCopy)
) {
  failures.push(
    'Public reward forecast must not imply that invite start time or a per-invite count is the reward basis.',
  );
}

if (/estimateBadge/.test(forecastCard)) {
  failures.push(
    'Public reward forecast must not restore the redundant top-right B3TR badge.',
  );
}

if (/≈\s*\{formatRewardWei/.test(forecastCard)) {
  failures.push(
    'Public reward forecast amount must not repeat estimate semantics with an approximation symbol.',
  );
}

if (
  !/hundredthWei\s*=\s*10n\s*\*\*\s*16n/.test(forecastCard) ||
  !/padStart\(2,\s*'0'\)/.test(forecastCard)
) {
  failures.push(
    'Public reward forecast display must keep two-decimal B3TR formatting without reducing internal precision.',
  );
}

if (
  !/@media \(max-width:340px\)/.test(forecastCard) ||
  !/overflow-wrap:\s*normal\s*!important/.test(typography) ||
  !/word-break:\s*keep-all\s*!important/.test(typography)
) {
  failures.push(
    'Public reward forecast must retain multilingual narrow-screen and no-mid-word wrapping safeguards.',
  );
}

if (
  /non è temporaneamente disponibile/.test(forecastCopy) ||
  /echte allocatiegegevens/.test(forecastCopy) ||
  /genügend echte Zuteilungsdaten/.test(forecastCopy)
) {
  failures.push(
    'Public reward forecast copy contains a retired mechanical translation.',
  );
}

const forecastRoute = readFileSync(
  join(root, 'src/app/api/rewards/estimate/route.ts'),
  'utf8',
);

if (!/s-maxage=300/.test(forecastRoute)) {
  failures.push(
    'Public reward forecast endpoint must keep a CDN cache window.',
  );
}

if (!/stale-while-revalidate=3600/.test(forecastRoute)) {
  failures.push(
    'Public reward forecast endpoint must retain stale-while-revalidate protection.',
  );
}

if (
  !/request\.nextUrl\.searchParams\.has\('refresh'\)/.test(forecastRoute) ||
  !/private, no-store, max-age=0/.test(forecastRoute)
) {
  failures.push(
    'Explicit live forecast refreshes must remain cache-bypassed while normal reads stay CDN-backed.',
  );
}

if (failures.length > 0) {
  console.error('Forecast stability gate failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Forecast stability gate passed.');
