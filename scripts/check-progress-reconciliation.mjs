import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(join(root, path), 'utf8');

const route = read('src/app/api/invites/[code]/route.ts');
const client = read('src/components/InviteeClient.tsx');

const getStart = route.indexOf('export async function GET');
const postStart = route.indexOf('export async function POST');

if (getStart < 0 || postStart < 0 || getStart > postStart) {
  failures.push('Invite progress route must expose passive GET before explicit POST reconciliation.');
} else {
  const getSection = route.slice(getStart, postStart);
  const postSection = route.slice(postStart);

  if (/syncInvitationEvidence\s*\(/.test(getSection)) {
    failures.push('Passive invite GET must not perform on-chain evidence reconciliation.');
  }
  if (/runAutomaticRewardPayout\s*\(/.test(getSection)) {
    failures.push('Passive invite GET must not trigger the automatic reward worker.');
  }
  if (!/toStoredProgress\s*\(/.test(getSection)) {
    failures.push('Passive invite GET must return the last persisted progress snapshot.');
  }
  if (!/syncInvitationEvidence\s*\(/.test(postSection)) {
    failures.push('Explicit invite POST must retain on-chain evidence reconciliation.');
  }
  if (!/runAutomaticRewardPayout\s*\(/.test(postSection)) {
    failures.push('Explicit invite POST must retain the guarded immediate payout attempt.');
  }
  if (!/invite_progress_sync_code/.test(postSection) || !/invite_progress_sync_ip/.test(postSection)) {
    failures.push('Expensive invite reconciliation POST must remain independently rate-limited.');
  }
}

if (!/method:\s*mode === 'sync' \? 'POST' : 'GET'/.test(client)) {
  failures.push('Invitee client must use POST only for explicit reconciliation and GET for passive reads.');
}
if (!/shouldRecoverCompleted/.test(client) || !/rewardEligibility !== 'PAID'/.test(client)) {
  failures.push('Completed but unsettled referrals must retain a one-shot foreground payout recovery attempt.');
}
if (!/30_000/.test(client)) {
  failures.push('Active invite reconciliation must retain the reviewed 30-second foreground cadence.');
}

if (failures.length > 0) {
  console.error('Invite reconciliation gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Invite reconciliation gate passed.');
