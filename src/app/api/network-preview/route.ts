import { NextRequest, NextResponse } from 'next/server';

type Status = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type PreviewNode = {
  wallet: string;
  status: Status;
  joinedAt: string;
  joinedThisRound?: boolean;
  children: PreviewNode[];
};

const root: PreviewNode = {
  wallet: '0x1111111111111111111111111111111111111111',
  status: 'REWARDED',
  joinedAt: '2026-08-21T08:30:00.000Z',
  children: [
    {
      wallet: '0xA100000000000000000000000000000000000001',
      status: 'REWARDED',
      joinedAt: '2026-08-24T11:00:00.000Z',
      children: [
        {
          wallet: '0xA110000000000000000000000000000000000011',
          status: 'QUALIFIED',
          joinedAt: '2026-08-28T09:10:00.000Z',
          joinedThisRound: true,
          children: [
            { wallet: '0xA111000000000000000000000000000000000111', status: 'REWARDED', joinedAt: '2026-09-01T12:00:00.000Z', joinedThisRound: true, children: [] },
            { wallet: '0xA112000000000000000000000000000000000112', status: 'IN_PROGRESS', joinedAt: '2026-09-04T14:00:00.000Z', joinedThisRound: true, children: [] },
          ],
        },
        {
          wallet: '0xA120000000000000000000000000000000000012',
          status: 'REWARDED',
          joinedAt: '2026-08-30T10:30:00.000Z',
          children: [
            { wallet: '0xA121000000000000000000000000000000000121', status: 'QUALIFIED', joinedAt: '2026-09-02T16:00:00.000Z', joinedThisRound: true, children: [] },
          ],
        },
        { wallet: '0xA130000000000000000000000000000000000013', status: 'IN_PROGRESS', joinedAt: '2026-09-05T09:00:00.000Z', joinedThisRound: true, children: [] },
        { wallet: '0xA140000000000000000000000000000000000014', status: 'QUALIFIED', joinedAt: '2026-09-06T13:20:00.000Z', joinedThisRound: true, children: [] },
      ],
    },
    {
      wallet: '0xB200000000000000000000000000000000000002',
      status: 'QUALIFIED',
      joinedAt: '2026-08-25T15:00:00.000Z',
      children: [
        {
          wallet: '0xB210000000000000000000000000000000000021',
          status: 'REWARDED',
          joinedAt: '2026-08-29T09:00:00.000Z',
          children: [
            { wallet: '0xB211000000000000000000000000000000000211', status: 'QUALIFIED', joinedAt: '2026-09-03T08:00:00.000Z', joinedThisRound: true, children: [] },
          ],
        },
        { wallet: '0xB220000000000000000000000000000000000022', status: 'QUALIFIED', joinedAt: '2026-09-01T09:00:00.000Z', joinedThisRound: true, children: [] },
        { wallet: '0xB230000000000000000000000000000000000023', status: 'IN_PROGRESS', joinedAt: '2026-09-07T11:40:00.000Z', joinedThisRound: true, children: [] },
      ],
    },
    {
      wallet: '0xC300000000000000000000000000000000000003',
      status: 'REWARDED',
      joinedAt: '2026-08-27T07:30:00.000Z',
      children: [
        { wallet: '0xC310000000000000000000000000000000000031', status: 'QUALIFIED', joinedAt: '2026-09-02T10:00:00.000Z', joinedThisRound: true, children: [] },
        { wallet: '0xC320000000000000000000000000000000000032', status: 'IN_PROGRESS', joinedAt: '2026-09-08T05:30:00.000Z', joinedThisRound: true, children: [] },
      ],
    },
    {
      wallet: '0xD400000000000000000000000000000000000004',
      status: 'IN_PROGRESS',
      joinedAt: '2026-09-01T11:00:00.000Z',
      joinedThisRound: true,
      children: [
        { wallet: '0xD410000000000000000000000000000000000041', status: 'IN_PROGRESS', joinedAt: '2026-09-08T04:00:00.000Z', joinedThisRound: true, children: [] },
      ],
    },
    { wallet: '0xE500000000000000000000000000000000000005', status: 'QUALIFIED', joinedAt: '2026-09-06T08:20:00.000Z', joinedThisRound: true, children: [] },
  ],
};

const nodeByWallet = new Map<string, PreviewNode>();
const parentByWallet = new Map<string, string | null>();
const pathByWallet = new Map<string, string[]>();

function indexTree(node: PreviewNode, parent: string | null, path: string[]) {
  const key = node.wallet.toLowerCase();
  nodeByWallet.set(key, node);
  parentByWallet.set(key, parent);
  pathByWallet.set(key, [...path, node.wallet]);
  for (const child of node.children) indexTree(child, node.wallet, [...path, node.wallet]);
}
indexTree(root, null, []);

function descendants(node: PreviewNode): PreviewNode[] {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

function branchSize(node: PreviewNode): number {
  return 1 + descendants(node).length;
}

function branchQualified(node: PreviewNode): number {
  return [node, ...descendants(node)].filter((item) => item.status !== 'IN_PROGRESS').length;
}

function branchGrowth(node: PreviewNode): number {
  return [node, ...descendants(node)].filter((item) => item.joinedThisRound).length;
}

function maxDepth(node: PreviewNode): number {
  if (node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(maxDepth));
}

export async function GET(request: NextRequest) {
  const focusKey = (request.nextUrl.searchParams.get('focus') || root.wallet).toLowerCase();
  const focus = nodeByWallet.get(focusKey) || root;
  const focusPath = pathByWallet.get(focus.wallet.toLowerCase()) || [root.wallet];
  const allDownstream = descendants(focus);
  const query = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase();

  const searchResults = query.length >= 3
    ? descendants(root)
        .filter((node) => node.wallet.toLowerCase().includes(query))
        .slice(0, 8)
        .map((node) => ({
          wallet: node.wallet,
          parentWallet: parentByWallet.get(node.wallet.toLowerCase()) || null,
          depth: (pathByWallet.get(node.wallet.toLowerCase())?.length || 1) - 1,
        }))
    : [];

  return NextResponse.json({
    rootWallet: root.wallet,
    focusWallet: focus.wallet,
    focusDepth: focusPath.length - 1,
    invitedBy: parentByWallet.get(focus.wallet.toLowerCase()) || null,
    breadcrumb: focusPath,
    summary: {
      network: allDownstream.length,
      direct: focus.children.length,
      qualified: allDownstream.filter((node) => node.status !== 'IN_PROGRESS').length,
      thisRound: allDownstream.filter((node) => node.joinedThisRound).length,
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
  }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Robots-Tag': 'noindex',
    },
  });
}
