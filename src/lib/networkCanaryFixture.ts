type MemberStatus = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';

type FixtureNode = {
  wallet: string;
  parent: string | 'root';
  status: MemberStatus;
  joinedAt: string;
};

type RoundContext = {
  id: number;
  startAt: string;
  endAt: string;
} | null;

const WALLETS = {
  a: '0x1000000000000000000000000000000000000001',
  b: '0x2000000000000000000000000000000000000002',
  c: '0x3000000000000000000000000000000000000003',
  a1: '0x1100000000000000000000000000000000000011',
  a2: '0x1200000000000000000000000000000000000012',
  a3: '0x1300000000000000000000000000000000000013',
  a11: '0x1110000000000000000000000000000000000111',
  a12: '0x1120000000000000000000000000000000000112',
  a111: '0x1111000000000000000000000000000000001111',
  b1: '0x2100000000000000000000000000000000000021',
  b2: '0x2200000000000000000000000000000000000022',
  b11: '0x2110000000000000000000000000000000000211',
  c1: '0x3100000000000000000000000000000000000031',
} as const;

const NODES: FixtureNode[] = [
  { wallet: WALLETS.a, parent: 'root', status: 'REWARDED', joinedAt: '2026-09-01T09:00:00.000Z' },
  { wallet: WALLETS.b, parent: 'root', status: 'QUALIFIED', joinedAt: '2026-09-03T13:20:00.000Z' },
  { wallet: WALLETS.c, parent: 'root', status: 'IN_PROGRESS', joinedAt: '2026-09-07T04:10:00.000Z' },
  { wallet: WALLETS.a1, parent: WALLETS.a, status: 'REWARDED', joinedAt: '2026-09-04T10:30:00.000Z' },
  { wallet: WALLETS.a2, parent: WALLETS.a, status: 'QUALIFIED', joinedAt: '2026-09-05T08:15:00.000Z' },
  { wallet: WALLETS.a3, parent: WALLETS.a, status: 'IN_PROGRESS', joinedAt: '2026-09-08T12:45:00.000Z' },
  { wallet: WALLETS.a11, parent: WALLETS.a1, status: 'REWARDED', joinedAt: '2026-09-06T02:40:00.000Z' },
  { wallet: WALLETS.a12, parent: WALLETS.a1, status: 'QUALIFIED', joinedAt: '2026-09-09T11:05:00.000Z' },
  { wallet: WALLETS.a111, parent: WALLETS.a11, status: 'IN_PROGRESS', joinedAt: '2026-09-11T15:25:00.000Z' },
  { wallet: WALLETS.b1, parent: WALLETS.b, status: 'QUALIFIED', joinedAt: '2026-09-05T06:55:00.000Z' },
  { wallet: WALLETS.b2, parent: WALLETS.b, status: 'IN_PROGRESS', joinedAt: '2026-09-10T09:35:00.000Z' },
  { wallet: WALLETS.b11, parent: WALLETS.b1, status: 'REWARDED', joinedAt: '2026-09-12T01:50:00.000Z' },
  { wallet: WALLETS.c1, parent: WALLETS.c, status: 'IN_PROGRESS', joinedAt: '2026-09-13T05:20:00.000Z' },
];

function key(wallet: string): string {
  return wallet.toLowerCase();
}

const NODE_BY_WALLET = new Map(NODES.map((node) => [key(node.wallet), node]));

function childrenOf(parent: string | 'root'): FixtureNode[] {
  return NODES.filter((node) => key(node.parent) === key(parent));
}

function descendantsOf(parent: string | 'root'): FixtureNode[] {
  const direct = childrenOf(parent);
  return direct.flatMap((node) => [node, ...descendantsOf(node.wallet)]);
}

function depthOf(wallet: string): number {
  let depth = 0;
  let current = NODE_BY_WALLET.get(key(wallet)) ?? null;
  while (current) {
    depth += 1;
    if (current.parent === 'root') break;
    current = NODE_BY_WALLET.get(key(current.parent)) ?? null;
  }
  return depth;
}

function breadcrumbFor(rootWallet: string, focusWallet: string): string[] {
  if (key(rootWallet) === key(focusWallet)) return [rootWallet];
  const path: string[] = [];
  let current = NODE_BY_WALLET.get(key(focusWallet)) ?? null;
  while (current) {
    path.unshift(current.wallet);
    if (current.parent === 'root') break;
    current = NODE_BY_WALLET.get(key(current.parent)) ?? null;
  }
  return [rootWallet, ...path];
}

function nodeSummary(parent: string | 'root') {
  const direct = childrenOf(parent);
  const descendants = descendantsOf(parent);
  return {
    network: descendants.length,
    direct: direct.length,
    qualified: descendants.filter((node) => node.status !== 'IN_PROGRESS').length,
    thisRound: descendants.filter((node) => node.joinedAt >= '2026-09-14T00:00:00.000Z').length,
  };
}

export function buildNetworkCanaryFixture(
  rootWallet: string,
  focusWallet: string,
  search: string,
  round: RoundContext,
) {
  const normalizedRoot = key(rootWallet);
  const normalizedFocus = key(focusWallet);
  const focusIsRoot = normalizedFocus === normalizedRoot;
  const focusNode = focusIsRoot ? null : NODE_BY_WALLET.get(normalizedFocus) ?? null;

  if (!focusIsRoot && !focusNode) {
    return { error: 'FOCUS_NOT_IN_NETWORK' as const };
  }

  const parentKey: string | 'root' = focusIsRoot ? 'root' : focusNode!.wallet;
  const summary = nodeSummary(parentKey);
  const direct = childrenOf(parentKey).map((node) => {
    const childSummary = nodeSummary(node.wallet);
    return {
      wallet: node.wallet,
      status: node.status,
      joinedAt: node.joinedAt,
      network: childSummary.network,
      direct: childSummary.direct,
      qualified: childSummary.qualified,
      thisRound: childSummary.thisRound,
      depth: depthOf(node.wallet),
    };
  });

  const normalizedSearch = search.toLowerCase();
  const searchResults = normalizedSearch.length >= 3
    ? NODES
        .filter((node) => key(node.wallet).includes(normalizedSearch))
        .slice(0, 12)
        .map((node) => ({
          wallet: node.wallet,
          parentWallet: node.parent === 'root' ? rootWallet : node.parent,
          depth: depthOf(node.wallet),
        }))
    : [];

  return {
    rootWallet,
    focusWallet: focusIsRoot ? rootWallet : focusNode!.wallet,
    focusDepth: focusIsRoot ? 0 : depthOf(focusNode!.wallet),
    invitedBy: focusIsRoot
      ? null
      : focusNode!.parent === 'root'
        ? rootWallet
        : focusNode!.parent,
    breadcrumb: breadcrumbFor(rootWallet, focusIsRoot ? rootWallet : focusNode!.wallet),
    summary: {
      ...summary,
      depth: focusIsRoot ? 0 : depthOf(focusNode!.wallet),
    },
    round,
    children: direct,
    searchResults,
    depthLimitReached: false,
    canaryFixture: true,
  };
}

export function getNetworkCanarySummary() {
  return {
    summary: {
      network: descendantsOf('root').length,
    },
    canaryFixture: true,
  };
}
