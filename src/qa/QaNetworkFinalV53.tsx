'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import { NETWORK_CANVAS_COPY } from '@/components/network/VeInviteNetworkCanvas';
import {
  VeInviteNetworkCanvasV3,
  type NetworkData,
  type NetworkSource,
} from '@/components/network/VeInviteNetworkCanvasV3';
import type { NetworkMemberStatus } from '@/components/network/VeInviteNetworkCanvas';

type Node = {
  wallet: string;
  parent: string | null;
  status: NetworkMemberStatus;
  joinedAt: string;
  children: string[];
  generation: number;
  network: number;
  qualified: number;
  depthBelow: number;
};
type Graph = { root: string; nodes: Map<string, Node>; nextIndex: number };
type ExtendedNode = NetworkData['children'][number] & { parentWallet: string | null; generation: number };
type ExtendedData = NetworkData & { allNodes: ExtendedNode[] };

type Size = 0 | 1 | 5 | 30 | 100 | 500 | 1000 | 10000;

function wallet(index: number) {
  return `0x${index.toString(16).padStart(40, '0')}`;
}
function buildGraph(total: number): Graph {
  const nodes = new Map<string, Node>();
  const root = wallet(1);
  nodes.set(root, {
    wallet: root,
    parent: null,
    status: 'REWARDED',
    joinedAt: '2026-08-28T00:00:00.000Z',
    children: [],
    generation: 0,
    network: 0,
    qualified: 0,
    depthBelow: 0,
  });
  for (let index = 2; index <= total + 1; index += 1) {
    const id = wallet(index);
    const parentIndex = index <= 9 ? 1 : 2 + Math.floor((index - 10) / 3);
    const parent = wallet(Math.max(1, Math.min(index - 1, parentIndex)));
    const parentNode = nodes.get(parent)!;
    const status: NetworkMemberStatus = index % 5 === 0 ? 'IN_PROGRESS' : index % 3 === 0 ? 'QUALIFIED' : 'REWARDED';
    nodes.set(id, {
      wallet: id,
      parent,
      status,
      joinedAt: new Date(Date.UTC(2026, 7, 28) + index * 5_400_000).toISOString(),
      children: [],
      generation: parentNode.generation + 1,
      network: 0,
      qualified: 0,
      depthBelow: 0,
    });
    parentNode.children.push(id);
  }
  recompute(nodes);
  return { root, nodes, nextIndex: total + 2 };
}
function recompute(nodes: Map<string, Node>) {
  const ordered = [...nodes.values()].sort((left, right) => right.generation - left.generation);
  ordered.forEach((node) => {
    node.network = 0;
    node.qualified = 0;
    node.depthBelow = 0;
  });
  ordered.forEach((node) => {
    if (!node.parent) return;
    const parent = nodes.get(node.parent);
    if (!parent) return;
    parent.network += 1 + node.network;
    parent.qualified += (node.status === 'IN_PROGRESS' ? 0 : 1) + node.qualified;
    parent.depthBelow = Math.max(parent.depthBelow, 1 + node.depthBelow);
  });
}
function lineage(nodes: Map<string, Node>, id: string) {
  const path: string[] = [];
  let cursor: string | null = id;
  while (cursor) {
    path.unshift(cursor);
    cursor = nodes.get(cursor)?.parent ?? null;
  }
  return path;
}
function descendants(nodes: Map<string, Node>, id: string) {
  const result: string[] = [];
  const queue = [...(nodes.get(id)?.children ?? [])];
  let cursor = 0;
  while (cursor < queue.length) {
    const next = queue[cursor++];
    result.push(next);
    queue.push(...(nodes.get(next)?.children ?? []));
  }
  return result;
}
function toChild(nodes: Map<string, Node>, id: string, focusGeneration: number): ExtendedNode {
  const node = nodes.get(id)!;
  return {
    wallet: node.wallet,
    status: node.status,
    joinedAt: node.joinedAt,
    network: node.network,
    direct: node.children.length,
    qualified: node.qualified,
    thisRound: Number(id.slice(-2)) % 4 === 0 ? Math.max(1, Math.round(node.network / 5)) : 0,
    depth: node.depthBelow,
    parentWallet: node.parent,
    generation: Math.max(1, node.generation - focusGeneration),
  };
}
function readData(graph: Graph, focus: string, query = ''): ExtendedData {
  const nodes = graph.nodes;
  const target = nodes.get(focus) ?? nodes.get(graph.root)!;
  const below = descendants(nodes, target.wallet);
  const allNodes = below.map((id) => toChild(nodes, id, target.generation));
  const children = target.children.map((id) => toChild(nodes, id, target.generation));
  const value = query.trim().toLowerCase();
  const rootBelow = descendants(nodes, graph.root);
  const searchResults = value.length >= 3
    ? rootBelow
        .filter((id) => id.includes(value))
        .slice(0, 12)
        .map((id) => ({ wallet: id, parentWallet: nodes.get(id)?.parent ?? null, depth: nodes.get(id)?.generation ?? 0 }))
    : [];
  return {
    rootWallet: graph.root,
    focusWallet: target.wallet,
    focusDepth: target.generation,
    invitedBy: target.parent,
    breadcrumb: lineage(nodes, target.wallet),
    summary: {
      network: target.network,
      direct: target.children.length,
      qualified: target.qualified,
      thisRound: Math.round(target.network / 4),
      depth: target.depthBelow,
    },
    round: { id: 115, startAt: '2026-09-07T00:00:00.000Z', endAt: '2026-09-14T00:00:00.000Z' },
    children,
    allNodes,
    searchResults,
    depthLimitReached: false,
  };
}

export function QaNetworkFinalV53() {
  const [size, setSize] = useState<Size>(30);
  const [locale, setLocale] = useState<'en' | 'ko'>('en');
  const [revision, setRevision] = useState(0);
  const graphRef = useRef(buildGraph(size));
  const currentSizeRef = useRef(size);

  if (currentSizeRef.current !== size) {
    currentSizeRef.current = size;
    graphRef.current = buildGraph(size);
  }

  const source = useCallback<NetworkSource>(async (_root, options = {}) => {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 45);
      options.signal?.addEventListener('abort', () => {
        window.clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return readData(graphRef.current, options.focus ?? graphRef.current.root, options.query ?? '');
  }, []);

  const invite = useCallback(async (focus: string) => {
    // QA only: the preview can simulate a new direct arrival only for YOU.
    if (focus !== graphRef.current.root) return;
    await new Promise((resolve) => window.setTimeout(resolve, 420));
    const graph = graphRef.current;
    const id = wallet(graph.nextIndex++);
    const parent = graph.nodes.get(focus);
    if (!parent) return;
    graph.nodes.set(id, {
      wallet: id,
      parent: focus,
      status: 'IN_PROGRESS',
      joinedAt: new Date().toISOString(),
      children: [],
      generation: parent.generation + 1,
      network: 0,
      qualified: 0,
      depthBelow: 0,
    });
    parent.children.push(id);
    recompute(graph.nodes);
    setRevision((value) => value + 1);
  }, []);

  const copy = useMemo(() => NETWORK_CANVAS_COPY[locale], [locale]);
  const sizes: Size[] = [0, 1, 5, 30, 100, 500, 1000, 10000];

  return (
    <main className="candidatePage">
      <div className="qaStrip">
        <div>
          <b>FINAL QA · V53</b>
          <span>Full descendant canvas · manual groups · LOD/culling · real API adapter ready · production untouched</span>
        </div>
        <div className="qaActions">
          {sizes.map((value) => (
            <button key={value} type="button" className={size === value ? 'active' : ''} onClick={() => { setSize(value); setRevision((current) => current + 1); }}>{value >= 1000 ? `${value / 1000}k` : value}</button>
          ))}
          <i />
          <button type="button" className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>EN</button>
          <button type="button" className={locale === 'ko' ? 'active' : ''} onClick={() => setLocale('ko')}>KR</button>
        </div>
      </div>

      <VeInviteNetworkCanvasV3
        key={`final-v53-${size}`}
        rootWallet={graphRef.current.root}
        source={source}
        copy={copy}
        locale={locale}
        revision={revision}
        storageNamespace={`veinvite:network:final-v53:${size}`}
        availableSlots={(data) => data.focusWallet === data.rootWallet ? 2 : 0}
        onInvite={invite}
      />

      <style jsx global>{`
        html,body,#__next{min-height:100%;background:#080807}body{margin:0;background:#080807;color:#f4f0e8}*{box-sizing:border-box}.candidatePage{min-height:100svh;padding:12px 0 30px;background:#080807}.qaStrip{width:min(calc(100vw - 20px),960px);margin:0 auto 5px;padding:7px 9px;border:1px solid rgba(244,183,40,.1);border-radius:10px;background:#0b0b0a;display:flex;align-items:center;justify-content:space-between;gap:10px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}.qaStrip>div:first-child{display:grid;gap:2px}.qaStrip b{font-size:.42rem;color:#8f7a47;letter-spacing:.04em}.qaStrip span{font-size:.34rem;color:#514c44}.qaActions{display:flex;align-items:center;gap:4px;max-width:70%;overflow:auto}.qaActions button{height:25px;min-width:30px;padding:0 7px;border:1px solid rgba(255,255,255,.055);border-radius:7px;background:#0e0e0d;color:#68635b;font-size:.36rem;cursor:pointer}.qaActions button.active{border-color:rgba(244,183,40,.3);color:#c7a349;background:rgba(244,183,40,.05)}.qaActions i{width:1px;height:15px;background:rgba(255,255,255,.06);flex:0 0 auto}@media(max-width:640px){.candidatePage{padding-top:6px}.qaStrip{align-items:flex-start;flex-direction:column;padding:6px 7px}.qaStrip span{display:none}.qaActions{width:100%;max-width:none}}
      `}</style>
    </main>
  );
}
