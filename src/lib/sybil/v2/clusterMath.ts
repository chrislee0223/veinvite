import type {
  SybilV2Signal,
} from '@/lib/sybil/v2/policy';

export type HistoricalRewardClusterPoint = {
  walletAddress: string;
  appId: string;
  blockNumber: number;
};

export type HistoricalB3trClusterPoint = {
  walletAddress: string;
  destinationWallet: string;
  blockNumber: number;
};

export type HistoricalRewardClusterFinding = {
  signal: SybilV2Signal;
  appId: string;
  ownRewardCount: number;
  peerWalletCount: number;
  synchronizedWindows: number;
  synchronizedPeerWalletCount: number;
};

export type HistoricalConsolidationFinding = {
  signal: SybilV2Signal;
  destinationWallet: string;
  walletCount: number;
  burstStartBlock?: number;
  burstEndBlock?: number;
  burstSpanBlocks?: number;
  burstMaxGapBlocks?: number;
};

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function detectHistoricalRewardCluster({
  walletAddress,
  rows,
  synchronizedBlockWindow = 30,
}: {
  walletAddress: string;
  rows: HistoricalRewardClusterPoint[];
  synchronizedBlockWindow?: number;
}): HistoricalRewardClusterFinding[] {
  const wallet = walletAddress.toLowerCase();
  const ownRows = rows.filter(
    (row) => row.walletAddress.toLowerCase() === wallet,
  );
  const apps = unique(ownRows.map((row) => row.appId.toLowerCase()));
  const findings: HistoricalRewardClusterFinding[] = [];

  for (const appId of apps) {
    const ownAppRows = ownRows.filter(
      (row) => row.appId.toLowerCase() === appId,
    );
    const appRows = rows.filter(
      (row) => row.appId.toLowerCase() === appId,
    );
    const peerWallets = unique(
      appRows
        .map((row) => row.walletAddress.toLowerCase())
        .filter((peer) => peer !== wallet),
    );

    if (ownAppRows.length >= 3 && peerWallets.length >= 2) {
      findings.push({
        signal: {
          code: 'HISTORICAL_REWARD_APP_CLUSTER',
          family: 'HISTORICAL_REWARD',
          strength: 'MEDIUM',
          score: Math.min(40, 20 + peerWallets.length * 3),
          independentKey: appId,
        },
        appId,
        ownRewardCount: ownAppRows.length,
        peerWalletCount: peerWallets.length,
        synchronizedWindows: 0,
        synchronizedPeerWalletCount: 0,
      });
    }

    let synchronizedWindows = 0;
    const synchronizedPeers = new Set<string>();

    for (const own of ownAppRows) {
      const windowPeers = new Set(
        appRows
          .filter((row) => {
            const peer = row.walletAddress.toLowerCase();
            return (
              peer !== wallet &&
              Math.abs(row.blockNumber - own.blockNumber) <=
                synchronizedBlockWindow
            );
          })
          .map((row) => row.walletAddress.toLowerCase()),
      );

      if (windowPeers.size >= 2) {
        synchronizedWindows += 1;
        for (const peer of windowPeers) synchronizedPeers.add(peer);
      }
    }

    if (synchronizedWindows >= 2 && synchronizedPeers.size >= 2) {
      findings.push({
        signal: {
          code: 'HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER',
          family: 'HISTORICAL_REWARD',
          strength: 'HIGH',
          score: Math.min(
            55,
            35 +
              synchronizedPeers.size * 3 +
              Math.min(10, synchronizedWindows),
          ),
          independentKey: `sync:${appId}`,
        },
        appId,
        ownRewardCount: ownAppRows.length,
        peerWalletCount: peerWallets.length,
        synchronizedWindows,
        synchronizedPeerWalletCount: synchronizedPeers.size,
      });
    }
  }

  return findings;
}

export function detectHistoricalB3trConsolidation({
  walletAddress,
  rows,
  inviterWallets,
  knownProtocolDestinations,
  minimumBlock = 0,
  denseBurstBlockWindow = 180,
  denseBurstMinimumWallets = 6,
  denseBurstMaximumGapBlocks = 24,
}: {
  walletAddress: string;
  rows: HistoricalB3trClusterPoint[];
  inviterWallets: Set<string>;
  knownProtocolDestinations: Set<string>;
  minimumBlock?: number;
  denseBurstBlockWindow?: number;
  denseBurstMinimumWallets?: number;
  denseBurstMaximumGapBlocks?: number;
}): HistoricalConsolidationFinding[] {
  const wallet = walletAddress.toLowerCase();
  const ownRows = rows.filter(
    (row) =>
      row.walletAddress.toLowerCase() === wallet &&
      row.blockNumber >= minimumBlock,
  );
  const destinations = unique(
    ownRows
      .map((row) => row.destinationWallet.toLowerCase())
      .filter(
        (destination) =>
          !knownProtocolDestinations.has(destination),
      ),
  );

  const findings: HistoricalConsolidationFinding[] = [];

  for (const destination of destinations) {
    const destinationRows = rows.filter(
      (row) =>
        row.destinationWallet.toLowerCase() === destination &&
        row.blockNumber >= minimumBlock,
    );
    const wallets = unique(
      destinationRows.map((row) => row.walletAddress.toLowerCase()),
    );

    const sortedRows = [...destinationRows].sort(
      (left, right) => left.blockNumber - right.blockNumber,
    );
    let bestBurst:
      | {
          walletCount: number;
          startBlock: number;
          endBlock: number;
          spanBlocks: number;
          maxGapBlocks: number;
        }
      | null = null;

    for (let start = 0; start < sortedRows.length; start += 1) {
      const burstWallets = new Set<string>();
      let maxGapBlocks = 0;
      let previousBlock = sortedRows[start]!.blockNumber;

      for (let end = start; end < sortedRows.length; end += 1) {
        const row = sortedRows[end]!;
        if (
          row.blockNumber - sortedRows[start]!.blockNumber >
          denseBurstBlockWindow
        ) {
          break;
        }

        if (end > start) {
          maxGapBlocks = Math.max(
            maxGapBlocks,
            row.blockNumber - previousBlock,
          );
        }
        previousBlock = row.blockNumber;
        burstWallets.add(row.walletAddress.toLowerCase());

        if (
          burstWallets.size < denseBurstMinimumWallets ||
          maxGapBlocks > denseBurstMaximumGapBlocks ||
          !burstWallets.has(wallet)
        ) {
          continue;
        }

        const candidate = {
          walletCount: burstWallets.size,
          startBlock: sortedRows[start]!.blockNumber,
          endBlock: row.blockNumber,
          spanBlocks:
            row.blockNumber - sortedRows[start]!.blockNumber,
          maxGapBlocks,
        };

        if (
          !bestBurst ||
          candidate.walletCount > bestBurst.walletCount ||
          (
            candidate.walletCount === bestBurst.walletCount &&
            candidate.spanBlocks < bestBurst.spanBlocks
          )
        ) {
          bestBurst = candidate;
        }
      }
    }

    if (bestBurst) {
      findings.push({
        signal: {
          code: 'HISTORICAL_DENSE_B3TR_BURST',
          family: 'HISTORICAL_CONSOLIDATION',
          strength: 'HIGH',
          score: Math.min(70, 45 + bestBurst.walletCount * 2),
          independentKey: `burst:${destination}`,
        },
        destinationWallet: destination,
        walletCount: bestBurst.walletCount,
        burstStartBlock: bestBurst.startBlock,
        burstEndBlock: bestBurst.endBlock,
        burstSpanBlocks: bestBurst.spanBlocks,
        burstMaxGapBlocks: bestBurst.maxGapBlocks,
      });
    }

    if (wallets.length >= 3) {
      findings.push({
        signal: {
          code: 'HISTORICAL_COMMON_B3TR_SINK',
          family: 'HISTORICAL_CONSOLIDATION',
          strength: 'HIGH',
          score: Math.min(60, 35 + wallets.length * 3),
          independentKey: destination,
        },
        destinationWallet: destination,
        walletCount: wallets.length,
      });
    }

    if (
      wallets.length >= 2 &&
      inviterWallets.has(destination)
    ) {
      findings.push({
        signal: {
          code: 'HISTORICAL_SINK_REAPPEARS_AS_INVITER',
          family: 'CLUSTER_LINK',
          strength: 'HIGH',
          score: Math.min(55, 35 + wallets.length * 2),
          independentKey: destination,
        },
        destinationWallet: destination,
        walletCount: wallets.length,
      });
    }
  }

  return findings;
}
