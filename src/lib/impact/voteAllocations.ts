import { supabaseAdmin } from '@/lib/supabaseServer';
import type { VeBetterNetwork } from '@/lib/vebetter/network';
import type { VoteAllocation } from '@/lib/vebetter/vote';

function isValidTxId(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isValidWalletAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isValidAppId(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export async function recordMissionVoteAllocations({
  inviteCode,
  network,
  walletAddress,
  txId,
  blockNumber,
  blockTimestamp,
  clauseIndex,
  voteRoundId,
  allocations,
}: {
  inviteCode: string;
  network: VeBetterNetwork;
  walletAddress: string;
  txId: string;
  blockNumber: number;
  blockTimestamp: number;
  clauseIndex: number;
  voteRoundId: number;
  allocations: VoteAllocation[];
}): Promise<boolean> {
  const normalizedWallet =
    walletAddress.toLowerCase();
  const normalizedTxId = txId.toLowerCase();

  if (
    !inviteCode ||
    !isValidWalletAddress(normalizedWallet) ||
    !isValidTxId(normalizedTxId) ||
    !Number.isSafeInteger(blockNumber) ||
    blockNumber < 0 ||
    !Number.isSafeInteger(blockTimestamp) ||
    blockTimestamp < 0 ||
    !Number.isSafeInteger(clauseIndex) ||
    clauseIndex < 0 ||
    !Number.isSafeInteger(voteRoundId) ||
    voteRoundId < 0 ||
    allocations.length === 0
  ) {
    console.warn(
      'Skipping invalid mission vote allocation payload.',
      {
        inviteCode,
        txId: normalizedTxId,
      },
    );
    return false;
  }

  for (const allocation of allocations) {
    if (
      !Number.isSafeInteger(
        allocation.allocationIndex,
      ) ||
      allocation.allocationIndex < 0 ||
      !isValidAppId(allocation.appId) ||
      !/^\d+$/.test(allocation.voteWeight)
    ) {
      console.warn(
        'Skipping malformed decoded vote allocation.',
        {
          inviteCode,
          txId: normalizedTxId,
          allocationIndex:
            allocation.allocationIndex,
        },
      );
      return false;
    }
  }

  const {
    data: invitation,
    error: invitationError,
  } = await supabaseAdmin
    .from('invitations')
    .select('id')
    .eq('invite_code', inviteCode)
    .eq('invitee_wallet', normalizedWallet)
    .maybeSingle();

  if (invitationError) {
    console.error(
      'Failed to resolve invitation for vote allocations:',
      invitationError,
    );
    return false;
  }

  if (!invitation?.id) {
    console.warn(
      'No invitation matched decoded vote allocations.',
      {
        inviteCode,
        walletAddress: normalizedWallet,
      },
    );
    return false;
  }

  const occurredAt = new Date(
    blockTimestamp * 1000,
  ).toISOString();

  const rows = allocations.map(
    (allocation) => ({
      invitation_id: invitation.id,
      invite_code: inviteCode,
      network,
      wallet_address: normalizedWallet,
      tx_id: normalizedTxId,
      block_number: blockNumber,
      clause_index: clauseIndex,
      round_id: voteRoundId,
      allocation_index:
        allocation.allocationIndex,
      app_id:
        allocation.appId.toLowerCase(),
      vote_weight: allocation.voteWeight,
      vote_kind: 'MISSION_QUALIFYING',
      occurred_at: occurredAt,
    }),
  );

  const { error } = await supabaseAdmin
    .from('invite_vote_allocations')
    .upsert(rows, {
      onConflict:
        'network,tx_id,clause_index,allocation_index',
    });

  if (error) {
    console.error(
      'Failed to persist mission vote allocations:',
      error,
    );
    return false;
  }

  return true;
}
