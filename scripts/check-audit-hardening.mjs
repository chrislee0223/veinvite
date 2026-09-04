import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(join(root, path), 'utf8');

const migration = read(
  'supabase/migrations/20260901021000_harden_audit_privileges_and_recipient_forensics.sql',
);

if (!/revoke delete on table public\.invitations from service_role/i.test(migration)) {
  failures.push('The app service role must not retain invitation DELETE capability.');
}

for (const fn of [
  'guard_mainnet_funded_rewards_one_way',
  'guard_reward_emergency_pause_audit_metadata',
]) {
  const revokePattern = new RegExp(
    `revoke all on function public\\.${fn}\\(\\)[\\s\\S]*from public, anon, authenticated`,
    'i',
  );
  if (!revokePattern.test(migration)) {
    failures.push(`Trigger helper ${fn} must not keep client EXECUTE privileges.`);
  }
}

if (
  !/create or replace view public\.operator_reward_recipient_forensics/i.test(migration) ||
  !/unscanned_paid_referral_count/i.test(migration) ||
  !/shared_vet_funder_count/i.test(migration) ||
  !/shared_vtho_funder_count/i.test(migration) ||
  !/has_observation_signals/i.test(migration)
) {
  failures.push('Recipient forensics must retain scan-coverage and shared-funder observation fields.');
}

if (!/Signals are forensic context only and never change reward eligibility or payout state/i.test(migration)) {
  failures.push('Recipient forensic analytics must remain explicitly observation-only.');
}

const recipientIndexMigration = read(
  'supabase/migrations/20260901021500_index_reward_recipient_audit_foreign_keys.sql',
);
if (
  !/reward_recipient_audit_ledger_payout_id_idx/.test(recipientIndexMigration) ||
  !/reward_recipient_risk_events_related_receipt_id_idx/.test(recipientIndexMigration)
) {
  failures.push('Reward recipient audit foreign keys must retain covering indexes.');
}

const operatorQualityMigration = read(
  'supabase/migrations/20260904223000_align_operator_quality_and_language_reporting.sql',
);

if (
  !/2026-08-23 09:05:00\+00/.test(operatorQualityMigration) ||
  !/status in \('ACTIVATING','UNDER_REVIEW','COMPLETED'\)/i.test(operatorQualityMigration) ||
  !/create or replace view public\.operator_global_data_quality/i.test(operatorQualityMigration)
) {
  failures.push(
    'Global data quality must keep the entry-proof cutoff so verified legacy rows cannot make current integrity look dirty.',
  );
}

if (
  !/reward_queue_entries_reservation_quote_snapshot_id_idx/i.test(operatorQualityMigration) ||
  !/reservation_quote_snapshot_id\)\s*\n\s*where reservation_quote_snapshot_id is not null/i.test(
    operatorQualityMigration,
  )
) {
  failures.push(
    'Reward reservation quote snapshots must retain a covering foreign-key index.',
  );
}

for (const view of [
  'operator_accepted_wallet_languages',
  'operator_accepted_language_summary',
]) {
  const viewPattern = new RegExp(
    `create or replace view public\\.${view}[\\s\\S]{0,120}with \\(security_invoker = true\\)`,
    'i',
  );
  const revokePattern = new RegExp(
    `revoke all on public\\.${view} from public, anon, authenticated`,
    'i',
  );
  const grantPattern = new RegExp(
    `grant select on public\\.${view} to service_role`,
    'i',
  );

  if (
    !viewPattern.test(operatorQualityMigration) ||
    !revokePattern.test(operatorQualityMigration) ||
    !grantPattern.test(operatorQualityMigration)
  ) {
    failures.push(
      `Operator language view ${view} must remain security-invoker and service-role-only.`,
    );
  }
}

if (
  !/analytics_excluded_wallets/i.test(operatorQualityMigration) ||
  !/classification_status = 'VERIFIED'/i.test(operatorQualityMigration) ||
  !/e\.outcome = 'ELIGIBLE'/i.test(operatorQualityMigration) ||
  !/l\.outcome = 'ELIGIBLE'/i.test(operatorQualityMigration) ||
  !/e\.entry_class in \('NEW','RETURNING'\)/i.test(operatorQualityMigration) ||
  !/l\.entry_class in \('NEW','RETURNING'\)/i.test(operatorQualityMigration)
) {
  failures.push(
    'Accepted-wallet language reporting must stay aligned with verified modern/legacy funnel classification and analytics exclusions.',
  );
}

const onchainAnalyticsRoute = read(
  'src/app/api/admin/sybil/onchain/route.ts',
);
if (/invitation\.reward_status\s*===\s*'PAID'[\s\S]{0,500}status:\s*409/.test(onchainAnalyticsRoute)) {
  failures.push('Paid referrals must remain eligible for observation-only historical forensics.');
}
if (
  !/observationOnly:\s*true/.test(onchainAnalyticsRoute) ||
  !/sybilStatusChanged:\s*false/.test(onchainAnalyticsRoute) ||
  !/rewardStatusChanged:\s*false/.test(onchainAnalyticsRoute) ||
  !/transfersPerformed:\s*false/.test(onchainAnalyticsRoute)
) {
  failures.push('Post-payout on-chain analytics must remain explicitly observation-only with no reward or transfer mutation.');
}

const limitations = read('docs/KNOWN_LIMITATIONS.md');
if (/mainnet funded referral rewards are intentionally disabled/i.test(limitations)) {
  failures.push('Known limitations still claim mainnet funded rewards are disabled.');
}
if (/public-reporting baseline is intentionally still disabled/i.test(limitations)) {
  failures.push('Known limitations still claim the production reporting baseline is disabled.');
}
if (!/first genuine end-to-end automatic B3TR payout has not happened yet/i.test(limitations)) {
  failures.push('Known limitations must preserve the unverified first-live-payout caveat.');
}

if (failures.length > 0) {
  console.error('Audit hardening gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Audit hardening gate passed.');
