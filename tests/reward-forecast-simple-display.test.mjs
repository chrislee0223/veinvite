import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const card = readFileSync('src/components/PublicRewardForecastCard.tsx', 'utf8');
const copy = readFileSync('src/lib/i18n/rewardForecastCopy.ts', 'utf8');
const api = readFileSync('src/app/api/rewards/estimate/route.ts', 'utf8');

test('Home shows the original concise forecast wording for every locale', () => {
  assert.match(card, /const t = REWARD_FORECAST_COPY\[resolvedLocale\]/);
  assert.match(card, /className="estimateEyebrow">\{t\.eyebrow\}/);
  assert.match(card, /className="estimateEligibility">\{t\.eligibility\}/);
  assert.match(card, /\{note\}/);
  assert.match(card, /:\s*t\.disclaimer/);
  assert.match(copy, /ko: \{ eyebrow: '예상 초대 보상', eligibility:/);
  assert.doesNotMatch(card, /ELASTIC_UI_COPY|\belasticScenarios\b|data-elastic-reward-scenarios/);
  assert.doesNotMatch(card, /1명 완료 시|2명 완료|3명 완료|IF 1 FINISHES|2 finish|3 finish/);
});

test('simplifying the copy preserves the current elastic amount and safety states', () => {
  assert.match(card, /elasticEstimate: readElasticEstimate\(record\.elasticEstimate\)/);
  assert.match(card, /const elastic = ready && forecast\.elasticEstimate\?\.mode === 'ELASTIC_SCENARIOS'/);
  assert.match(card, /formatRewardWei\(elastic\.oneWinnerWei\)/);
  assert.match(card, /const elasticPending = ready && forecast\.elasticEstimate\?\.mode === 'PENDING'/);
  assert.match(card, /elasticPending\s*\? '— B3TR'/);
  assert.match(card, /elasticPending \|\| forecast\?\.status === 'pending'/);
  assert.match(card, /isRewardForecastStale/);
  assert.match(card, /readPersistedForecast/);
  assert.match(api, /readElasticPublicPreview\(network\)/);
  assert.match(api, /estimatedRewardWei: snapshot\.estimatedRewardWei/);
});
