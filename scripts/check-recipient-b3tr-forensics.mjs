import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(join(root, path), 'utf8');

const baseMigration = read(
  'supabase/migrations/20260901033000_add_reward_recipient_b3tr_flow_forensics.sql',
);
const dueMigration = read(
  'supabase/migrations/20260907033744_add_b3tr_recipient_observation_due_view.sql',
);
const evidenceMigration = read(
  'supabase/migrations/20260907033955_harden_b3tr_recipient_observation_evidence.sql',
);
const scanner = read(
  'src/lib/sybil/recipientB3trForensics.ts',
);
const observation = read(
  'src/lib/sybil/recipientB3trObservation.ts',
);
const batch = read(
  'src/lib/sybil/recipientB3trObservationBatch.ts',
);
const route = read(
  'src/app/api/admin/recipient-forensics/b3tr/route.ts',
);
const cron = read(
  'src/app/api/cron/reconcile/route.ts',
);

if (
  !/create table if not exists public\.reward_recipient_b3tr_flow_snapshots/i.test(baseMigration) ||
  !/observation_only boolean not null default true check \(observation_only = true\)/i.test(baseMigration) ||
  !/before update or delete on public\.reward_recipient_b3tr_flow_snapshots/i.test(baseMigration) ||
  !/append-only/i.test(baseMigration)
) {
  failures.push(
    'B3TR recipient forensic snapshots must remain append-only and observation-only.',
  );
}

if (
  !/revoke all on table public\.reward_recipient_b3tr_flow_snapshots from public, anon, authenticated/i.test(baseMigration) ||
  !/grant select, insert on table public\.reward_recipient_b3tr_flow_snapshots to service_role/i.test(baseMigration)
) {
  failures.push(
    'B3TR recipient forensic storage must remain operator/backend-only.',
  );
}

if (
  !/operator_reward_recipient_b3tr_forensics/i.test(baseMigration) ||
  !/shared_destination_recipient_count/i.test(baseMigration) ||
  !/known_protocol_destination/i.test(baseMigration)
) {
  failures.push(
    'Operator B3TR forensics view must preserve convergence and protocol-destination context.',
  );
}

if (
  !/operator_reward_recipient_b3tr_observation_due/i.test(dueMigration) ||
  !/l\.paid_at <= now\(\) - interval '24 hours'/i.test(dueMigration) ||
  !/s\.block_number \+ 8640/i.test(dueMigration) ||
  !/f\.scan_to_block >= s\.block_number \+ 8640/i.test(dueMigration)
) {
  failures.push(
    'Scheduled B3TR observation must be bounded to finalized payouts due after the first approximate 24-hour horizon and suppress completed repeat scans.',
  );
}

if (
  !/operator_reward_recipient_b3tr_evidence/i.test(evidenceMigration) ||
  !/l\.amount_wei::text as payout_amount_wei/i.test(evidenceMigration) ||
  !/chain_evidence_matches/i.test(evidenceMigration) ||
  !/s\.network = l\.network/i.test(evidenceMigration) ||
  !/lower\(s\.tx_id\) = lower\(l\.tx_id\)/i.test(evidenceMigration) ||
  !/revoke all on table public\.operator_reward_recipient_b3tr_evidence[\s\S]*from public, anon, authenticated/i.test(evidenceMigration) ||
  !/grant select on table public\.operator_reward_recipient_b3tr_evidence[\s\S]*to service_role/i.test(evidenceMigration)
) {
  failures.push(
    'B3TR observation evidence must preserve exact numeric(78,0) wei as text, verify settlement provenance, and remain service-role-only.',
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

if (
  !/operator_reward_recipient_b3tr_evidence/.test(observation) ||
  !/Reward receipt and settlement chain evidence do not match/.test(observation) ||
  !/assertPositiveWeiString/.test(observation) ||
  !/observeRecipientB3trReceipt/.test(observation) ||
  !/evaluateRecipientB3trFlow/.test(observation) ||
  !/reward_recipient_b3tr_flow_snapshots/.test(observation) ||
  !/observation_only:\s*true/.test(observation)
) {
  failures.push(
    'Manual and scheduled B3TR scans must share one exact-wei, chain-evidence-validated observation core.',
  );
}

if (
  /\.from\(['"]invitations['"]\)[\s\S]{0,160}\.update\(/.test(observation) ||
  /\.from\(['"]reward_payouts['"]\)[\s\S]{0,160}\.update\(/.test(observation) ||
  /runAutomaticRewardPayout/.test(observation) ||
  /sybil_status/.test(observation) ||
  /reward_status/.test(observation)
) {
  failures.push(
    'Shared B3TR observation core must never mutate eligibility, payout state, or Sybil decisions.',
  );
}

if (
  !/SYBIL_B3TR_OBSERVATION_ENABLED === 'true'/.test(batch) ||
  !/operator_reward_recipient_b3tr_observation_due/.test(batch) ||
  !/try_acquire_operator_lock/.test(batch) ||
  !/release_operator_lock/.test(batch) ||
  !/minimumScanToBlock:\s*targetScanToBlock/.test(batch) ||
  !/observationOnly:\s*true/.test(batch) ||
  !/transfersPerformed:\s*false/.test(batch) ||
  !/sybilStatusChanged:\s*false/.test(batch) ||
  !/rewardStatusChanged:\s*false/.test(batch)
) {
  failures.push(
    'Scheduled B3TR observation must be explicitly gated, serialized, horizon-bounded, and observation-only.',
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
  !/admin_b3tr_forensics_receipt/.test(route) ||
  !/observeRecipientB3trReceipt/.test(route)
) {
  failures.push(
    'Manual B3TR recipient forensic writes must require explicit same-origin operator intent, bounded rate limits, and the shared observation core.',
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

const payoutIndex = cron.indexOf('await runAutomaticRewardPayout()');
const observationIndex = cron.indexOf(
  'await runB3trRecipientObservationBatch()',
);
if (
  payoutIndex < 0 ||
  observationIndex < 0 ||
  payoutIndex > observationIndex ||
  !/'B3TR_RECIPIENT_OBSERVATION'/.test(cron)
) {
  failures.push(
    'Scheduled B3TR observation must run after payout recovery and remain an independently reported cron stage.',
  );
}

if (failures.length > 0) {
  console.error('Recipient B3TR forensic gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Recipient B3TR forensic gate passed.');
