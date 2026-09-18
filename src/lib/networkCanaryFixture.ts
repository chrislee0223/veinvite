type MemberStatus = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';

type FixtureNode = {
  wallet: string;
  parent: string | 'root';
  status: MemberStatus;
  joinedAt: string;
  roundOffsetHours?: number;
};

type RoundContext = {
  id: number;
  startAt: string;
  endAt: string;
} | null;

export const NETWORK_CANARY_SAMPLE_SIZE = 500;

const ROOT_BRANCH_WIDTH = 12;
const SYNTHETIC_WALLET_PREFIX = 'ca11ab1e000000000000000000000000';
const FIXTURE_START_MS = Date.UTC(2026, 7, 20, 0, 0, 0);

function walletFor(index: number): string {
  return `0x${SYNTHETIC_WALLET_PREFIX}${index.toString(16).padStart(8, '0')}`;
}

function parentIndexFor(index: number): number | 'root' {
  // Keep the root with one occupied direct slot so the real Network screen
  // still exercises the Available invite slot. Entering that first branch
  // reveals 12 direct children, then a balanced multi-generation tree.
  if (index === 1) return 'root';
  if (index <= ROOT_BRANCH_WIDTH + 1) return 1;
  return 2 + Math.floor((index - (ROOT_BRANCH_WIDTH + 2)) / 3);
}

function statusFor(index: number): MemberStatus {
  if (index % 5 === 0) return 'IN_PROGRESS';
  if (index % 3 === 0) return 'QUALIFIED';
  return 'REWARDED';
}

function buildFixtureNodes(): FixtureNode[] {
  return Array.from({ length: NETWORK_CANARY_SAMPLE_SIZE }, (_, offset) => {
    const index = offset + 1;
    const parentIndex = parentIndexFor(index);
    return {
      wallet: walletFor(index),
      parent: parentIndex === 'root' ? 'root' : walletFor(parentIndex),
      status: statusFor(index),
      joinedAt: new Date(FIXTURE_START_MS + index * 3 * 60 * 60 * 1000).toISOString(),
      // A deterministic subset follows the live round window so "This Round"
      // remains testable without making every synthetic account look new.
      ...(index % 5 === 0 ? { roundOffsetHours: index % 120 } : {}),
    };
  });
}

const NODES: FixtureNode[] = buildFixtureNodes();

function key(wallet: string): string {
  return wallet.toLowerCase();
}

const NODE_BY_WALLET = new Map(NODES.map((node) => [key(node.wallet), node]));
const CHILDREN_BY_PARENT = new Map<string, FixtureNode[]>();

for (const node of NODES) {
  const parentKey = key(node.parent);
  const siblings = CHILDREN_BY_PARENT.get(parentKey);
  if (siblings) siblings.push(node);
  else CHILDREN_BY_PARENT.set(parentKey, [node]);
}

function childrenOf(parent: string | 'root'): FixtureNode[] {
  return CHILDREN_BY_PARENT.get(key(parent)) ?? [];
}

const DESCENDANT_CACHE = new Map<string, FixtureNode[]>();

function descendantsOf(parent: string | 'root'): FixtureNode[] {
  const parentKey = key(parent);
  const cached = DESCENDANT_CACHE.get(parentKey);
  if (cached) return cached;

  const descendants = childrenOf(parent).flatMap((node) => [
    node,
    ...descendantsOf(node.wallet),
  ]);
  DESCENDANT_CACHE.set(parentKey, descendants);
  return descendants;
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

function resolvedJoinedAt(node: FixtureNode, round: RoundContext): string {
  if (!round || node.roundOffsetHours === undefined) return node.joinedAt;
  const start = Date.parse(round.startAt);
  const end = Date.parse(round.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return node.joinedAt;
  const requested = start + node.roundOffsetHours * 60 * 60 * 1000;
  const latest = Math.max(start, end - 60 * 60 * 1000);
  return new Date(Math.min(requested, latest)).toISOString();
}

function joinedThisRound(node: FixtureNode, round: RoundContext): boolean {
  if (!round) return false;
  const joined = Date.parse(resolvedJoinedAt(node, round));
  const start = Date.parse(round.startAt);
  const end = Date.parse(round.endAt);
  return Number.isFinite(joined) && Number.isFinite(start) && Number.isFinite(end) && joined >= start && joined < end;
}

function nodeSummary(parent: string | 'root', round: RoundContext) {
  const direct = childrenOf(parent);
  const descendants = descendantsOf(parent);
  return {
    network: descendants.length,
    direct: direct.length,
    qualified: descendants.filter((node) => node.status !== 'IN_PROGRESS').length,
    thisRound: round ? descendants.filter((node) => joinedThisRound(node, round)).length : null,
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
  const summary = nodeSummary(parentKey, round);
  const direct = childrenOf(parentKey).map((node) => {
    const childSummary = nodeSummary(node.wallet, round);
    return {
      wallet: node.wallet,
      status: node.status,
      joinedAt: resolvedJoinedAt(node, round),
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
