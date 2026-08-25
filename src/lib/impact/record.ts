import { supabaseAdmin } from '@/lib/supabaseServer';
import type { VeBetterNetwork } from '@/lib/vebetter/network';
import type { QualifyingRewardEvent } from '@/lib/vebetter/activity';
import type { Vot3ConversionEvent } from '@/lib/vebetter/vot3Conversion';

function toIsoTimestamp(unixSeconds: number): string {
  if (
    !Number.isSafeInteger(unixSeconds) ||
    unixSeconds < 0
  ) {
    throw new Error('Invalid VeChain block timestamp.');
  }

  return new Date(unixSeconds * 1000).toISOString();
}

export async function recordQualifyingRewardImpact(args: {
  inviteCode: string;
  network: VeBetterNetwork | null;
  walletAddress: string;
  events: QualifyingRewardEvent[];
}): Promise<boolean> {
  if (!args.network) {
    console.error(
      'Refusing to record dApp impact without invitation network provenance.',
    );
    return false;
  }

  if (args.events.length === 0) {
    return true;
  }

  const rows = args.events.map((event) => ({
    event_key:
      `reward:${args.network}:${args.inviteCode}:${event.txId}:${event.appId}`.toLowerCase(),
    invite_code: args.inviteCode,
    network: args.network,
    wallet_address: args.walletAddress.toLowerCase(),
    event_type: 'DAPP_REWARD',
    tx_id: event.txId.toLowerCase(),
    block_number: event.blockNumber,
    block_timestamp: toIsoTimestamp(event.blockTimestamp),
    app_id: event.appId.toLowerCase(),
    vote_round_id: null,
    amount_wei: null,
  }));

  const { error } = await supabaseAdmin
    .from('invite_impact_events')
    .upsert(rows, {
      onConflict: 'event_key',
      ignoreDuplicates: true,
    });

  if (error) {
    console.error(
      'Failed to persist qualifying dApp impact events:',
      error,
    );
    return false;
  }

  return true;
}

export async function recordVot3ConversionImpact(args: {
  inviteCode: string;
  network: VeBetterNetwork | null;
  walletAddress: string;
  events: Vot3ConversionEvent[];
}): Promise<boolean> {
  if (!args.network) {
    console.error(
      'Refusing to record VOT3 conversion impact without invitation network provenance.',
    );
    return false;
  }

  if (args.events.length === 0) {
    return true;
  }

  const rows = args.events.map((event) => ({
    event_key:
      `vot3-conversion:${args.network}:${args.inviteCode}:${event.txId}:${event.clauseIndex}:${event.amountWei}`.toLowerCase(),
    invite_code: args.inviteCode,
    network: args.network,
    wallet_address: args.walletAddress.toLowerCase(),
    event_type: 'VOT3_CONVERSION',
    tx_id: event.txId.toLowerCase(),
    block_number: event.blockNumber,
    block_timestamp:
      toIsoTimestamp(event.blockTimestamp),
    app_id: null,
    vote_round_id: null,
    amount_wei: event.amountWei,
  }));

  const { error } = await supabaseAdmin
    .from('invite_impact_events')
    .upsert(rows, {
      onConflict: 'event_key',
      ignoreDuplicates: true,
    });

  if (error) {
    console.error(
      'Failed to persist VOT3 conversion impact events:',
      error,
    );
    return false;
  }

  return true;
}

export async function recordVoteImpact(args: {
  inviteCode: string;
  network: VeBetterNetwork | null;
  walletAddress: string;
  txId: string;
  blockNumber: number;
  blockTimestamp: number;
  voteRoundId: number;
}): Promise<boolean> {
  if (!args.network) {
    console.error(
      'Refusing to record vote impact without invitation network provenance.',
    );
    return false;
  }

  const normalizedTxId = args.txId.toLowerCase();

  const { error } = await supabaseAdmin
    .from('invite_impact_events')
    .upsert(
      {
        event_key:
          `vote:${args.network}:${args.inviteCode}:${normalizedTxId}:${args.voteRoundId}`.toLowerCase(),
        invite_code: args.inviteCode,
        network: args.network,
        wallet_address: args.walletAddress.toLowerCase(),
        event_type: 'ALLOCATION_VOTE',
        tx_id: normalizedTxId,
        block_number: args.blockNumber,
        block_timestamp:
          toIsoTimestamp(args.blockTimestamp),
        app_id: null,
        vote_round_id: args.voteRoundId,
        amount_wei: null,
      },
      {
        onConflict: 'event_key',
        ignoreDuplicates: true,
      },
    );

  if (error) {
    console.error(
      'Failed to persist governance vote impact event:',
      error,
    );
    return false;
  }

  return true;
}
