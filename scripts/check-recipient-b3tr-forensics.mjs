import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(join(root, path), 'utf8');

const migration = read(
  'supabase/migrations/20260901033000_add_reward_recipient_b3tr_flow_forensics.sql',
);
const scanner = read(
  'src/lib/sybil/recipientB3trForensics.ts',
);
const route = read(
  'src/app/api/admin/recipient-forensics/b3tr/route.ts',
);

if (
  !/create table if not exists public\.reward_recipient_b3tr_flow_snapshots/i.test(migration) ||
  !/observation_only boolean not null default true check \(observation_only = true\)/i.test(migration) ||
  !/before update or delete on public\.reward_recipient_b3tr_flow_snapshots/i.test(migration) ||
  !/append-only/i.test(migration)
) {
  failures.push(
    'B3TR recipient forensic snapshots must remain append-only and observation-only.',
  );
}

if (
  !/revoke all on table public\.reward_recipient_b3tr_flow_snapshots from public, anon, authenticated/i.test(migration) ||
  !/grant select, insert on table public\.reward_recipient_b3tr_flow_snapshots to service_role/i.test(migration)
) {
  failures.push(
    'B3TR recipient forensic storage must remain operator/backend-only.',
  );
}

if (
  !/operator_reward_recipient_b3tr_forensics/i.test(migration) ||
  !/shared_destination_recipient_count/i.test(migration) ||
  !/known_protocol_destination/i.test(migration)
) {
  failures.push(
    'Operator B3TR forensics view must preserve convergence and protocol-destination context.',
  );
}

if (
  !/address: config\.b3trAddress/.test(scanner) ||
  !/topic1: addressTopic\(wallet\)/.test(scanner) ||
  !/from: payoutBlockNumber \+ 1/.test(scanner)
) {
  failures.push(
    'Recipient flow scanner must inspect only direct post-payout B3TR outflows from the rewarded wallet.',
  );
}

if (
  !/RAPID_LARGE_B3TR_SWEEP/.test(scanner) ||
  !/SHARED_B3TR_DESTINATION/.test(scanner) ||
  !/KNOWN_PROTOCOL_DESTINATION/.test(scanner) ||
  !/sharedDestinationRecipientCount >= 3/.test(scanner)
) {
  failures.push(
    'Recipient B3TR forensics must retain rapid-sweep, shared-destination, and protocol-address context.',
  );
}

if (
  !/snapshot\.knownProtocolDestination/.test(scanner) ||
  !/destination convergence is not treated as a Farmer signal/.test(scanner)
) {
  failures.push(
    'Reviewed VeBetter protocol destinations must not be treated as Farmer convergence.',
  );
}

const authIndex = route.indexOf('await requireWalletSession');
const poolIndex = route.indexOf('await readVeInviteRewardPoolStatus');
if (authIndex < 0 || poolIndex < 0 || authIndex > poolIndex) {
  failures.push(
    'B3TR recipient forensics must authenticate the operator before reward-pool RPC reads.',
  );
}

if (
  !/RUN_B3TR_RECIPIENT_FORENSICS/.test(route) ||
  !/requestHasSameOrigin\(request\)/.test(route) ||
  !/admin_b3tr_forensics_operator/.test(route) ||
  !/admin_b3tr_forensics_receipt/.test(route)
) {
  failures.push(
    'B3TR recipient forensic writes must require explicit same-origin intent and bounded operator/receipt rate limits.',
  );
}

if (
  !/reward_recipient_audit_ledger/.test(route) ||
  !/reward_payout_transaction_settlements/.test(route) ||
  !/Reward receipt and settlement chain evidence do not match/.test(route)
) {
  failures.push(
    'B3TR recipient scans must anchor to finalized immutable receipt and settlement evidence.',
  );
}

if (
  /\.from\(['"]invitations['"]\)[\s\S]{0,160}\.update\(/.test(route) ||
  /\.from\(['"]reward_payouts['"]\)[\s\S]{0,160}\.update\(/.test(route) ||
  /runAutomaticRewardPayout/.test(route) ||
  /sybilStatusChanged:\s*true/.test(route) ||
  /rewardStatusChanged:\s*true/.test(route) ||
  /transfersPerformed:\s*true/.test(route)
) {
  failures.push(
    'Recipient B3TR forensics must never mutate eligibility, payout state, Sybil decisions, or transfer funds.',
  );
}

if (failures.length > 0) {
  console.error('Recipient B3TR forensic gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Recipient B3TR forensic gate passed.');
