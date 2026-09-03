import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

const activeDocs = [
  'README_KO.md',
  'docs/ARCHITECTURE.md',
  'docs/NEXT_STEPS_KO.md',
  'docs/FIRST_WEEK_OPERATIONS_20260828.md',
  'docs/LAUNCH_READINESS_20260824.md',
  'docs/PUBLIC_FAQ_KO_EN.md',
  'docs/SOCIAL_LAUNCH_COPY_KO_EN.md',
];

const staleRewardPhrases = [
  'mainnet funded rewards remain disabled',
  'mainnet funded rewards are disabled',
  'keep automatic payouts disabled',
  'server does not store a payout private key',
  'the operator signs in veworld',
  'veworld approval',
  'veworld에서 운영자가 직접',
  '서버에 운영 지갑의 개인키를 보관하거나 unattended 자동 송금을 활성화하지 않습니다',
  'funded referral rewards가 실제로 활성화되기 전',
];

for (const path of activeDocs) {
  const source = readFileSync(join(root, path), 'utf8');
  const normalized = source.toLowerCase();

  for (const phrase of staleRewardPhrases) {
    if (normalized.includes(phrase.toLowerCase())) {
      failures.push(
        `${path} still describes the retired manual/disabled reward architecture: ${phrase}`,
      );
    }
  }
}

const architecture = readFileSync(
  join(root, 'docs/ARCHITECTURE.md'),
  'utf8',
);
if (
  !/Reward Distributor/.test(architecture) ||
  !/fail-closed/i.test(architecture) ||
  !/finalized/i.test(architecture)
) {
  failures.push(
    'ARCHITECTURE.md must describe the dedicated Reward Distributor, fail-closed behavior, and finalized-chain settlement.',
  );
}

const nextSteps = readFileSync(
  join(root, 'docs/NEXT_STEPS_KO.md'),
  'utf8',
);
const nextStepsHasEnabledPipeline =
  /자동 추천 보상 파이프라인은 활성화/.test(nextSteps);
const nextStepsHasUncompletedFirstPayout =
  /최초 genuine automatic B3TR payout은 아직 발생하지 않았습니다/i.test(
    nextSteps,
  ) &&
  /genuine automatic payout E2E 검증/i.test(nextSteps);

if (
  !nextStepsHasEnabledPipeline ||
  !nextStepsHasUncompletedFirstPayout
) {
  failures.push(
    'NEXT_STEPS_KO.md must distinguish the enabled automatic pipeline from the still-uncompleted first genuine Production payout E2E.',
  );
}

const publicFaq = readFileSync(
  join(root, 'docs/PUBLIC_FAQ_KO_EN.md'),
  'utf8',
);
if (
  !/automatic referral-reward pipeline is enabled/i.test(publicFaq) ||
  !/고정 보상액이나 지급 날짜는 보장하지 않습니다/.test(publicFaq)
) {
  failures.push(
    'Public FAQ must accurately describe current automatic reward readiness without promising a fixed amount or date.',
  );
}

if (failures.length > 0) {
  console.error('Documentation drift gate failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Documentation drift gate passed.');
