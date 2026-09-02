import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const legacyPortal = join(
  root,
  'src/components/PublicRewardEstimatePortal.tsx',
);

if (existsSync(legacyPortal)) {
  failures.push(
    'Retired PublicRewardEstimatePortal must stay removed; it contained one-minute polling against the public reward estimate endpoint.',
  );
}

const forecastPortal = readFileSync(
  join(root, 'src/components/PublicRewardForecastPortal.tsx'),
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

if (!/setInterval\(\s*loadForecast,\s*15\s*\*\s*60_000\s*,?\s*\)/s.test(forecastPortal)) {
  failures.push(
    'Public reward forecast polling must stay at the reviewed 15-minute cadence.',
  );
}

if (/setInterval\([^)]*,\s*60_000\s*,?\s*\)/s.test(forecastPortal)) {
  failures.push(
    'Public reward forecast must not regress to one-minute client polling.',
  );
}

for (const legacyDetail of [
  'estimateRange',
  'estimateMeta',
  'formatUpdatedAt',
]) {
  if (forecastPortal.includes(legacyDetail)) {
    failures.push(
      `Public reward forecast UI must stay simplified; legacy detail returned: ${legacyDetail}.`,
    );
  }
}

if (!/text-align:center/.test(forecastPortal)) {
  failures.push(
    'Public reward forecast disclaimer must keep the reviewed centered mobile presentation.',
  );
}

if (!/data\.rewardForecastPreview|rewardForecastPreview/.test(forecastPortal)) {
  failures.push(
    'UI test reward forecast must keep its fake-data preview path instead of fetching production data.',
  );
}

if (!/REWARD_FORECAST_COPY\[(?:resolvedLocale|locale)\]/.test(forecastPortal)) {
  failures.push(
    'Public reward forecast component must read copy from the centralized locale table.',
  );
}

if (/const\s+COPY\s*:\s*Record<\s*SupportedLocale/.test(forecastPortal)) {
  failures.push(
    'Public reward forecast copy must not drift back into a component-local locale table.',
  );
}

if (
  !/let\s+cachedForecast\s*:/.test(forecastPortal) ||
  !/function\s+requestForecast\s*\(/.test(forecastPortal) ||
  !/function\s+PublicRewardForecastWarmup\s*\(/.test(forecastPortal) ||
  !/flushSync\s*\(/.test(forecastPortal)
) {
  failures.push(
    'Public reward forecast must retain the reviewed warm cache and same-cycle attachment that prevent leaderboard card layout shift.',
  );
}

if (!/dir=\{getLocaleDirection\(resolvedLocale\)\}/.test(forecastPortal)) {
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

if (/estimateBadge/.test(forecastPortal)) {
  failures.push(
    'Public reward forecast must not restore the redundant top-right B3TR badge.',
  );
}

if (/≈\s*\{formatRewardWei/.test(forecastPortal)) {
  failures.push(
    'Public reward forecast amount must not repeat estimate semantics with an approximation symbol.',
  );
}

if (
  !/hundredthWei\s*=\s*10n\s*\*\*\s*16n/.test(forecastPortal) ||
  !/padStart\(2,\s*'0'\)/.test(forecastPortal)
) {
  failures.push(
    'Public reward forecast display must keep two-decimal B3TR formatting without reducing internal precision.',
  );
}

if (
  !/@media \(max-width:340px\)/.test(forecastPortal) ||
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

if (failures.length > 0) {
  console.error('Forecast stability gate failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Forecast stability gate passed.');
