import type { ThorClient } from '@vechain/sdk-network';

export type ChainEventPosition = {
  txId: string;
  blockNumber: number;
  txIndex: number;
  clauseIndex: number;
};

export function compareChainEventPosition(
  left: ChainEventPosition,
  right: ChainEventPosition,
): number {
  return (
    left.blockNumber - right.blockNumber ||
    left.txIndex - right.txIndex ||
    left.clauseIndex - right.clauseIndex ||
    left.txId.localeCompare(right.txId)
  );
}

export function isStrictlyAfter(
  candidate: ChainEventPosition,
  checkpoint: ChainEventPosition,
): boolean {
  return compareChainEventPosition(candidate, checkpoint) > 0;
}

export function createTransactionIndexResolver(
  thor: ReturnType<typeof ThorClient.at>,
) {
  const blockTransactionCache =
    new Map<number, string[]>();

  return async (
    blockNumber: number,
    txId: string,
  ): Promise<number> => {
    let transactions =
      blockTransactionCache.get(blockNumber);

    if (!transactions) {
      const block =
        await thor.blocks.getBlockCompressed(blockNumber);

      if (!block) {
        throw new Error(
          `Unable to load VeChain block ${blockNumber} for execution ordering.`,
        );
      }

      transactions = block.transactions.map(
        (transactionId) =>
          transactionId.toLowerCase(),
      );
      blockTransactionCache.set(
        blockNumber,
        transactions,
      );
    }

    const txIndex = transactions.indexOf(
      txId.toLowerCase(),
    );

    if (txIndex < 0) {
      throw new Error(
        `Unable to locate transaction ${txId} in VeChain block ${blockNumber}.`,
      );
    }

    return txIndex;
  };
}
