'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import { NETWORK_CANVAS_COPY } from '@/components/network/VeInviteNetworkCanvas';
import {
  VeInviteNetworkCanvasV2,
  type NetworkData,
  type NetworkSource,
} from '@/components/network/VeInviteNetworkCanvasV2';
import type { NetworkMemberStatus } from '@/components/network/VeInviteNetworkCanvas';

type Node = { wallet: string; parent: string | null; status: NetworkMemberStatus; joinedAt: string; children: string[] };

function wallet(index: number) { return `0x${index.toString(16).padStart(40, '0')}`; }
function buildGraph(total: number) {
  const nodes = new Map<string, Node>();
  const root = wallet(1);
  nodes.set(root, { wallet: root, parent: null, status: 'REWARDED', joinedAt: '2026-08-28T00:00:00.000Z', children: [] });
  for (let index = 2; index <= total + 1; index += 1) {
    const id = wallet(index);
    const parentIndex = index <= 8 ? 1 : 2 + ((index * 7) % (index - 2));
    const parent = wallet(parentIndex);
    const status: NetworkMemberStatus = index % 5 === 0 ? 'IN_PROGRESS' : index % 3 === 0 ? 'QUALIFIED' : 'REWARDED';
    nodes.set(id, { wallet: id, parent, status, joinedAt: new Date(Date.UTC(2026, 7, 28) + index * 5_400_000).toISOString(), children: [] });
    nodes.get(parent)?.children.push(id);
  }
  return { root, nodes, nextIndex: total + 2 };
}
function descendants(nodes: Map<string, Node>, id: string) {
  const result: string[] = [];
  const queue = [...(nodes.get(id)?.children ?? [])];
  while (queue.length) {
    const next = queue.shift()!;
    if (result.includes(next)) continue;
    result.push(next); queue.push(...(nodes.get(next)?.children ?? []));
  }
  return result;
}
function lineage(nodes: Map<string, Node>, id: string) {
  const path: string[] = []; let cursor: string | null = id;
  while (cursor) { path.unshift(cursor); cursor = nodes.get(cursor)?.parent ?? null; }
  return path;
}
function depthBelow(nodes: Map<string, Node>, id: string) {
  let max = 0;
  const queue = (nodes.get(id)?.children ?? []).map((child) => ({ child, depth: 1 }));
  while (queue.length) {
    const item = queue.shift()!; max = Math.max(max, item.depth);
    (nodes.get(item.child)?.children ?? []).forEach((child) => queue.push({ child, depth: item.depth + 1 }));
  }
  return max;
}
function readData(graph: ReturnType<typeof buildGraph>, focus: string, query = ''): NetworkData {
  const nodes = graph.nodes;
  const target = nodes.get(focus) ?? nodes.get(graph.root)!;
  const below = descendants(nodes, target.wallet);
  const children = target.children.map((id) => {
    const node = nodes.get(id)!; const branch = descendants(nodes, id);
    return {
      wallet: id,
      status: node.status,
      joinedAt: node.joinedAt,
      network: branch.length,
      direct: node.children.length,
      qualified: branch.filter((walletId) => nodes.get(walletId)?.status !== 'IN_PROGRESS').length,
      thisRound: branch.filter((walletId) => Number(walletId.slice(-2)) % 4 === 0).length,
      depth: depthBelow(nodes, id),
    };
  });
  const value = query.trim().toLowerCase();
  const rootBelow = descendants(nodes, graph.root);
  const searchResults = value.length >= 3
    ? rootBelow.filter((id) => id.includes(value)).slice(0, 8).map((id) => ({ wallet: id, parentWallet: nodes.get(id)?.parent ?? null, depth: lineage(nodes, id).length - 1 }))
    : [];
  return {
    rootWallet: graph.root,
    focusWallet: target.wallet,
    focusDepth: lineage(nodes, target.wallet).length - 1,
    invitedBy: target.parent,
    breadcrumb: lineage(nodes, target.wallet),
    summary: {
      network: below.length,
      direct: target.children.length,
      qualified: below.filter((id) => nodes.get(id)?.status !== 'IN_PROGRESS').length,
      thisRound: below.filter((id) => Number(id.slice(-2)) % 4 === 0).length,
      depth: depthBelow(nodes, target.wallet),
    },
    round: { id: 115, startAt: '2026-09-07T00:00:00.000Z', endAt: '2026-09-14T00:00:00.000Z' },
    children,
    searchResults,
    depthLimitReached: false,
  };
}

export function QaNetworkReleaseCandidateV52() {
  const [size, setSize] = useState<30 | 100 | 500>(30);
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
      const timer = window.setTimeout(resolve, 60);
      options.signal?.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    });
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return readData(graphRef.current, options.focus ?? graphRef.current.root, options.query ?? '');
  }, []);

  const invite = useCallback(async (focus: string) => {
    await new Promise((resolve) => window.setTimeout(resolve, 480));
    const graph = graphRef.current;
    const id = wallet(graph.nextIndex++);
    graph.nodes.set(id, { wallet: id, parent: focus, status: 'IN_PROGRESS', joinedAt: new Date().toISOString(), children: [] });
    graph.nodes.get(focus)?.children.push(id);
    setRevision((value) => value + 1);
  }, []);

  const copy = useMemo(() => NETWORK_CANVAS_COPY[locale], [locale]);

  return (
    <main className="candidatePage">
      <div className="qaStrip">
        <div><b>FINAL QA · Release Candidate</b><span>Production interaction core · sample sponsor graph only · production untouched</span></div>
        <div className="qaActions">
          {[30, 100, 500].map((value) => <button key={value} type="button" className={size === value ? 'active' : ''} onClick={() => { setSize(value as 30 | 100 | 500); setRevision((current) => current + 1); }}>{value}</button>)}
          <i />
          <button type="button" className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>EN</button>
          <button type="button" className={locale === 'ko' ? 'active' : ''} onClick={() => setLocale('ko')}>KR</button>
        </div>
      </div>

      <VeInviteNetworkCanvasV2
        key={`candidate-${size}`}
        rootWallet={graphRef.current.root}
        source={source}
        copy={copy}
        revision={revision}
        storageNamespace={`veinvite:network:release-candidate-v52:${size}`}
        availableSlots={() => 2}
        onInvite={invite}
      />

      <style jsx global>{`
        html,body,#__next{min-height:100%;background:#080807}body{margin:0;background:#080807;color:#f4f0e8}*{box-sizing:border-box}.candidatePage{min-height:100svh;padding:12px 0 30px;background:#080807}.qaStrip{width:min(calc(100vw - 20px),960px);margin:0 auto 5px;padding:7px 9px;border:1px solid rgba(244,183,40,.1);border-radius:10px;background:#0b0b0a;display:flex;align-items:center;justify-content:space-between;gap:10px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}.qaStrip>div:first-child{display:grid;gap:2px}.qaStrip b{font-size:.42rem;color:#8f7a47;letter-spacing:.04em}.qaStrip span{font-size:.34rem;color:#514c44}.qaActions{display:flex;align-items:center;gap:4px}.qaActions button{height:25px;min-width:30px;padding:0 7px;border:1px solid rgba(255,255,255,.055);border-radius:7px;background:#0e0e0d;color:#68635b;font-size:.36rem;cursor:pointer}.qaActions button.active{border-color:rgba(244,183,40,.3);color:#c7a349;background:rgba(244,183,40,.05)}.qaActions i{width:1px;height:15px;background:rgba(255,255,255,.06)}@media(max-width:640px){.candidatePage{padding-top:6px}.qaStrip{align-items:flex-start;flex-direction:column;padding:6px 7px}.qaStrip span{display:none}.qaActions{width:100%;overflow:auto}}
      `}</style>
    </main>
  );
}
