import { timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  readPostVoteFundingObservation,
} from '@/lib/sybil/v2/postVoteFunding';
import {
  loadKnownProtocolDestinations,
} from '@/lib/sybil/v2/protocolDestinations';
import {
  SYBIL_V2_ANALYZER_VERSION,
} from '@/lib/sybil/v2/version';

const SCAN_VERSION = 'post-vote-funding-observation-v1';
const COMPLETION_CODE = 'POST_VOTE_FUNDING_OBSERVATION_COMPLETE';
const MAX_BATCH = 5;
const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/u;

type Candidate = {
  invite_code: string;
  invitee_wallet: string | null;
  inviter_wallet: string;
  activation_network: string | null;
  activation_block: number | string | null;
  vote_completed_block: number | string | null;
};

function authenticated(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization');
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length &&
    timingSafeEqual(actual, expected);
}

function validBlock(raw: number | string | null): number | null {
  const value = typeof raw === 'string' && /^\d+$/u.test(raw)
    ? Number(raw)
    : raw;
  return typeof value === 'number' &&
    Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function persistObservation({
  candidate,
  protocolSources,
}: {
  candidate: Candidate;
  protocolSources: Set<string>;
}): Promise<void> {
  if (!candidate.invitee_wallet) return;
  const network = candidate.activation_network;
  if (network !== 'mainnet' && network !== 'testnet' &&
      network !== 'testnet-staging') {
    throw new Error('Funding observation invitation network is not supported.');
  }
  const activation = validBlock(candidate.activation_block);
  const vote = validBlock(candidate.vote_completed_block);
  if (activation === null || vote === null) {
    throw new Error('Funding observation requires an activated, completed vote.');
  }
  const subject = candidate.invitee_wallet.trim().toLowerCase();
  const observation = await readPostVoteFundingObservation({
    walletAddress: subject,
    network,
    activationBlock: activation,
    voteBlock: vote,
    protocolSources,
  });

  const common = {
    invite_code: candidate.invite_code,
    network,
    subject_wallet: subject,
    evidence_family: 'FUNDING',
    strength: 'INFO',
    score: 0,
    app_id: null,
    analyzer_version: SYBIL_V2_ANALYZER_VERSION,
  };
  // Every source is independently searchable by related_wallet. There is no
  // new risk signal, verdict transition, reward gate or automatic restriction.
  for (const source of observation.sources) {
    const code = `POST_VOTE_${source.asset}_FUNDER_OBSERVED`;
    const { error } = await supabaseAdmin
      .from('sybil_v2_evidence_records')
      .upsert({
        ...common,
        signal_code: code,
        related_wallet: source.sender,
        observed_block: source.firstBlock,
        observed_at: null,
        evidence: {
          scanVersion: SCAN_VERSION,
          source,
          observedAfterActivation: true,
          observedAtOrBeforeVote: true,
          directInviterTransfer:
            source.sender === candidate.inviter_wallet.toLowerCase(),
          riskScoreImpact: 0,
          automaticRestriction: false,
        },
        dedupe_key:
          `sybil-v2:${candidate.invite_code}:${SCAN_VERSION}:${source.asset}:${source.sender}`,
      }, {
        onConflict: 'dedupe_key',
        ignoreDuplicates: true,
      });
    if (error && error.code !== '23505') {
      throw new Error(`Post-vote funding source audit could not be saved: ${error.message}`);
    }
  }

  // Legacy protocol-hub signals remain immutable. Flag their CURRENT validity
  // separately rather than deleting audit evidence or treating an old HIGH as
  // proof of fraud after the address is allowlisted.
  const { data: oldEvidence, error: oldError } = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .select('signal_code,related_wallet')
    .eq('invite_code', candidate.invite_code)
    .in('signal_code', [
      'HISTORICAL_COMMON_B3TR_SINK',
      'RECENT_FUNDER_IS_HISTORICAL_COMMON_SINK',
    ])
    .eq('strength', 'HIGH');

  if (oldError) {
    throw new Error(`Legacy protocol evidence audit failed: ${oldError.message}`);
  }
  const excludedLegacyProtocolEvidence = (oldEvidence ?? [])
    .filter((row) => row.related_wallet &&
      protocolSources.has(String(row.related_wallet).toLowerCase()))
    .map((row) => ({
      signalCode: row.signal_code,
      relatedWallet: String(row.related_wallet).toLowerCase(),
      currentStatus: 'ALLOWLISTED_PROTOCOL_DESTINATION',
    }));

  // Write the idempotency marker ONLY after all sources and audit metadata
  // have been persisted. Partial network/DB failures are retryable.
  const { error } = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .upsert({
      ...common,
      signal_code: COMPLETION_CODE,
      related_wallet: null,
      observed_block: vote,
      observed_at: null,
      evidence: {
        scanVersion: SCAN_VERSION,
        ...observation,
        excludedLegacyProtocolEvidence,
        observationalOnly: true,
        automaticRestriction: false,
        rewardOrSybilStatusModified: false,
      },
      dedupe_key:
        `sybil-v2:${candidate.invite_code}:${SCAN_VERSION}:complete`,
    }, {
      onConflict: 'dedupe_key',
      ignoreDuplicates: true,
    });

  if (error && error.code !== '23505') {
    throw new Error(`Post-vote funding audit marker could not be saved: ${error.message}`);
  }
}

/**
 * Standalone, bounded, observation-only cron.
 *
 * It NEVER calls the Sybil policy/restriction/reward code and NEVER updates
 * invitations, assessments, clearances, payouts or reward reservations.
 * API failures do not block onboarding, claims, or payout finality.
 */
export async function GET(request: NextRequest) {
  if (!authenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'Production-only observation',
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const { data: invitations, error: inviteError } = await supabaseAdmin
      .from('invitations')
      .select('invite_code,invitee_wallet,inviter_wallet,activation_network,activation_block,vote_completed_block')
      .eq('vote_completed', true)
      .not('invitee_wallet', 'is', null)
      .not('vote_completed_block', 'is', null)
      .order('vote_completed_at', { ascending: false })
      .limit(500);

    if (inviteError) {
      throw new Error(`Observation candidate lookup failed: ${inviteError.message}`);
    }
    const candidates = ((invitations ?? []) as Candidate[])
      .filter((row) => INVITE_CODE_PATTERN.test(row.invite_code));
    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, considered: 0, scanned: 0, failures: 0 });
    }

    const { data: completed, error: completedError } = await supabaseAdmin
      .from('sybil_v2_evidence_records')
      .select('invite_code')
      .in('invite_code', candidates.map((row) => row.invite_code))
      .eq('signal_code', COMPLETION_CODE);
    if (completedError) {
      throw new Error(`Observation audit marker lookup failed: ${completedError.message}`);
    }
    const done = new Set((completed ?? []).map((row) => row.invite_code));
    const pending = candidates.filter((row) => !done.has(row.invite_code))
      .slice(0, MAX_BATCH);
    const protocolSources = await loadKnownProtocolDestinations('mainnet');
    let scanned = 0;
    const failures: Array<{ inviteCode: string; reason: string }> = [];
    for (const candidate of pending) {
      try {
        await persistObservation({ candidate, protocolSources });
        scanned += 1;
      } catch (failure) {
        failures.push({
          inviteCode: candidate.invite_code,
          reason: failure instanceof Error
            ? failure.message.slice(0, 200)
            : 'Unknown observation failure',
        });
      }
    }
    return NextResponse.json({
      ok: failures.length === 0,
      considered: candidates.length,
      pending: pending.length,
      scanned,
      failures,
      observationOnly: true,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Sybil post-vote observational audit failed:', error);
    return NextResponse.json({
      ok: false,
      error: 'Post-vote observation could not be completed.',
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
