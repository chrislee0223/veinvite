import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(join(root, path), 'utf8');

const route = read('src/app/api/invites/[code]/route.ts');
const client = read('src/components/InviteeClient.tsx');
const monotonicMigration = read(
  'supabase/migrations/20260903143000_prevent_reconciliation_progress_regression.sql',
);

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
  if (!/mode:\s*'sync'/.test(postSection)) {
    failures.push('Explicit invite POST must select the dedicated reconciliation limiter mode.');
  }
}

if (!/scope:\s*'invite_progress_sync_code'/.test(route) || !/scope:\s*'invite_progress_sync_ip'/.test(route)) {
  failures.push('Expensive invite reconciliation must remain independently rate-limited by invite and IP.');
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

// Foreground reconciliation can overlap across tabs/devices or with the daily
// recovery worker. Modern accepted invitations are backed by immutable raw
// evidence, so their derived progress/watermark must be monotonic even when an
// older chain snapshot finishes after a newer one.
if (!/old\.eligibility_check_id is null/.test(monotonicMigration)) {
  failures.push('Reconciliation regression protection must stay scoped to modern invitations with immutable eligibility proof.');
}
if (!/new\.apps_completed\s*:=\s*old\.apps_completed/.test(monotonicMigration)) {
  failures.push('Overlapping reconciliation must not reduce the persisted completed-app count.');
}
if (!/new\.rewards_received\s*:=\s*old\.rewards_received/.test(monotonicMigration)) {
  failures.push('Overlapping reconciliation must not reduce the persisted reward-count checkpoint.');
}
if (!/new\.apps_completed_at\s*:=\s*old\.apps_completed_at/.test(monotonicMigration) ||
    !/new\.apps_completed_block\s*:=\s*old\.apps_completed_block/.test(monotonicMigration)) {
  failures.push('The verified third-app timestamp/block must survive a stale overlapping activity scan.');
}
if (!/new\.impact_last_synced_block\s*<\s*old\.impact_last_synced_block/.test(monotonicMigration) ||
    !/new\.impact_last_synced_block\s*:=\s*old\.impact_last_synced_block/.test(monotonicMigration)) {
  failures.push('An older reconciliation must not move the persisted chain watermark backwards.');
}
if (!/old\.impact_sync_complete_at is not null[\s\S]*new\.impact_sync_complete_at is null[\s\S]*new\.impact_sync_complete_at\s*:=\s*old\.impact_sync_complete_at/.test(monotonicMigration)) {
  failures.push('A stale/incomplete reconciliation must not erase an already verified completion checkpoint.');
}
if (!/create trigger prevent_invitation_reconciliation_progress_regression[\s\S]*before update of[\s\S]*on public\.invitations/.test(monotonicMigration)) {
  failures.push('The monotonic reconciliation guard must remain a BEFORE UPDATE trigger on invitations.');
}

if (failures.length > 0) {
  console.error('Invite reconciliation gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Invite reconciliation gate passed.');
