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

const locales = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja',
  'it', 'tr', 'nl', 'de', 'fr',
];
for (const locale of locales) {
  if (!new RegExp(`\\b${locale}:\\s*\\{`).test(forecastPortal)) {
    failures.push(
      `Public reward forecast copy is incomplete for locale: ${locale}.`,
    );
  }
}

if (
  !/친구가 모든 미션을 완료하면 받을 수 있습니다/.test(forecastPortal) ||
  !/आपके आमंत्रित मित्र के सभी मिशन पूरे करने पर आप यह इनाम पा सकते हैं/.test(forecastPortal) ||
  !/招待した友だちがすべてのミッションを完了すると受け取れます/.test(forecastPortal) ||
  !/Puoi riceverla quando l’amico che hai invitato completa tutte le missioni/.test(forecastPortal) ||
  !/Je kunt deze ontvangen zodra de vriend die je hebt uitgenodigd alle missies voltooit/.test(forecastPortal) ||
  !/Du kannst sie erhalten, sobald dein eingeladener Freund alle Missionen abgeschlossen hat/.test(forecastPortal)
) {
  failures.push(
    'Public reward forecast mission-completion wording regressed in one or more reviewed locales.',
  );
}

if (
  /If you start inviting now/.test(forecastPortal) ||
  /지금 초대를 시작한다면/.test(forecastPortal) ||
  /Estimated per successful invite/.test(forecastPortal) ||
  /성공한 초대 1건 예상/.test(forecastPortal) ||
  /招待成功1件あたり/.test(forecastPortal) ||
  /हर सफल आमंत्रण पर/.test(forecastPortal)
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
  !/overflow-wrap:break-word/.test(forecastPortal) ||
  !/hyphens:auto/.test(forecastPortal) ||
  !/@media \(max-width:340px\)/.test(forecastPortal)
) {
  failures.push(
    'Public reward forecast must retain multilingual wrapping safeguards for narrow screens.',
  );
}

if (
  /non è temporaneamente disponibile/.test(forecastPortal) ||
  /echte allocatiegegevens/.test(forecastPortal) ||
  /genügend echte Zuteilungsdaten/.test(forecastPortal)
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