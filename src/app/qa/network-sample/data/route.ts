import { NextRequest, NextResponse } from 'next/server';

import { isQaStudioAccessAllowed } from '@/qa/access';

type Status = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type SampleNode = {
  wallet: string;
  status: Status;
  joinedAt: string;
  joinedThisRound: boolean;
  children: SampleNode[];
};

function wallet(id: number): string {
  return `0x${id.toString(16).padStart(40, '0')}`;
}

function statusFor(id: number): Status {
  if (id % 5 === 0) return 'IN_PROGRESS';
  if (id % 3 === 0) return 'QUALIFIED';
  return 'REWARDED';
}

function node(
  id: number,
  children: SampleNode[] = [],
  status: Status = statusFor(id),
): SampleNode {
  const day = 1 + (id % 9);
  return {
    wallet: wallet(id),
    status,
    joinedAt: new Date(Date.UTC(2026, 8, day, 8 + (id % 8), (id * 7) % 60)).toISOString(),
    joinedThisRound: day >= 7,
    children,
  };
}

const deepChain = node(3001, [
  node(3002, [
    node(3003, [
      node(3004, [
        node(3005, [
          node(3006, [], 'QUALIFIED'),
        ], 'REWARDED'),
      ], 'QUALIFIED'),
    ], 'REWARDED'),
  ], 'QUALIFIED'),
], 'REWARDED');

const firstGrandchildren = Array.from({ length: 8 }, (_, index) =>
  index === 0 ? deepChain : node(2001 + index),
);

const firstBranchChildren = Array.from({ length: 12 }, (_, index) => {
  if (index === 0) {
    return node(1001, firstGrandchildren, 'REWARDED');
  }
  if (index === 1) {
    return node(1002, [node(2101), node(2102), node(2103)], 'QUALIFIED');
  }
  if (index === 2) {
    return node(1003, [node(2201), node(2202)], 'IN_PROGRESS');
  }
  return node(1001 + index);
});

const rootChildren = Array.from({ length: 14 }, (_, index) => {
  if (index === 0) {
    return node(101, firstBranchChildren, 'REWARDED');
  }

  const childCount = index % 4;
  const children = Array.from({ length: childCount }, (_, childIndex) =>
    node(4000 + index * 10 + childIndex),
  );
  return node(101 + index, children);
});

const root: SampleNode = {
  wallet: wallet(1),
  status: 'REWARDED',
  joinedAt: '2026-08-20T08:00:00.000Z',
  joinedThisRound: false,
  children: rootChildren,
};

const nodeByWallet = new Map<string, SampleNode>();
const parentByWallet = new Map<string, string | null>();
const pathByWallet = new Map<string, string[]>();

function indexTree(current: SampleNode, parent: string | null, path: string[]) {
  const key = current.wallet.toLowerCase();
  nodeByWallet.set(key, current);
  parentByWallet.set(key, parent);
  pathByWallet.set(key, [...path, current.wallet]);
  for (const child of current.children) {
    indexTree(child, current.wallet, [...path, current.wallet]);
  }
}
indexTree(root, null, []);

function descendants(current: SampleNode): SampleNode[] {
  return current.children.flatMap((child) => [child, ...descendants(child)]);
}

function branchSize(current: SampleNode): number {
  return 1 + descendants(current).length;
}

function branchQualified(current: SampleNode): number {
  return [current, ...descendants(current)].filter((item) => item.status !== 'IN_PROGRESS').length;
}

function branchGrowth(current: SampleNode): number {
  return [current, ...descendants(current)].filter((item) => item.joinedThisRound).length;
}

function maxDepth(current: SampleNode): number {
  if (current.children.length === 0) return 0;
  return 1 + Math.max(...current.children.map(maxDepth));
}

function notFound() {
  return NextResponse.json(
    { code: 'QA_ONLY', error: 'Not found.' },
    { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
  );
}

export async function GET(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!isQaStudioAccessAllowed(host)) return notFound();

  const focusKey = (request.nextUrl.searchParams.get('focus') || root.wallet).toLowerCase();
  const focus = nodeByWallet.get(focusKey);
  if (!focus) {
    return NextResponse.json(
      { code: 'FOCUS_NOT_IN_NETWORK', error: 'That wallet is not in the QA sample network.' },
      { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
    );
  }

  const focusPath = pathByWallet.get(focus.wallet.toLowerCase()) ?? [root.wallet];
  const allDownstream = descendants(focus);
  const query = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
  const searchResults = query.length >= 3
    ? descendants(root)
        .filter((item) => item.wallet.toLowerCase().includes(query))
        .slice(0, 8)
        .map((item) => ({
          wallet: item.wallet,
          parentWallet: parentByWallet.get(item.wallet.toLowerCase()) ?? null,
          depth: (pathByWallet.get(item.wallet.toLowerCase())?.length ?? 1) - 1,
        }))
    : [];

  return NextResponse.json({
    rootWallet: root.wallet,
    focusWallet: focus.wallet,
    focusDepth: focusPath.length - 1,
    invitedBy: parentByWallet.get(focus.wallet.toLowerCase()) ?? null,
    breadcrumb: focusPath,
    summary: {
      network: allDownstream.length,
      direct: focus.children.length,
      qualified: allDownstream.filter((item) => item.status !== 'IN_PROGRESS').length,
      thisRound: allDownstream.filter((item) => item.joinedThisRound).length,
      depth: maxDepth(focus),
    },
    round: {
      id: 114,
      startAt: '2026-09-07T00:00:00.000Z',
      endAt: '2026-09-14T00:00:00.000Z',
    },
    children: focus.children.map((child) => ({
      wallet: child.wallet,
      status: child.status,
      joinedAt: child.joinedAt,
      network: branchSize(child),
      direct: child.children.length,
      qualified: branchQualified(child),
      thisRound: branchGrowth(child),
      depth: maxDepth(child),
    })),
    searchResults,
    depthLimitReached: false,
    sample: true,
  }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}
