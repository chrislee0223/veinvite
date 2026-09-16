'use client';

import { createPortal } from 'react-dom';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { NETWORK_CANARY_UI_COPY } from '@/lib/i18n/networkCanaryUiCopy';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';
import { useWalletLauncher } from './WalletControl';

type Point = { x: number; y: number };
type ReleaseNode = { wallet: string; point: Point };
type ReleaseGroup = {
  id: string;
  scope: string;
  name: string;
  members: string[];
  collapsed: boolean;
  position?: Point;
};
type EditorState = {
  mode: 'create' | 'edit';
  groupId: string | null;
  name: string;
  selected: string[];
} | null;
type GroupDrag = {
  groupId: string;
  pointerId: number;
  startX: number;
  startY: number;
  startPosition: Point;
  previewPosition: Point;
  moved: boolean;
} | null;
type NodeDrag = {
  pointerId: number;
  wallet: string;
  startX: number;
  startY: number;
  startOffset: Point;
  previewOffset: Point;
  sourceGroupId: string | null;
  mode: 'pending' | 'free' | 'transfer';
  moved: boolean;
  timer: number;
} | null;
type NodeOffsetStore = Record<string, Point>;

const STORAGE_PREFIX = 'veinvite-network-release-groups-v1:';
const NODE_POSITION_PREFIX = 'veinvite-network-release-node-positions-v1:';
const NODE_HOLD_MS = 500;
const NODE_TRANSFER_THRESHOLD_PX = 10;
const NODE_FREE_THRESHOLD_PX = 4;
const NODE_CLICK_SUPPRESS_MS = 800;

function keyWallet(value: string) {
  return value.toLowerCase();
}

function validWallet(value: string) {
  return /^0x[0-9a-f]{40}$/.test(value);
}

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function finitePoint(value: unknown): Point | null {
  if (!value || typeof value !== 'object') return null;
  const point = value as Partial<Point>;
  if (typeof point.x !== 'number' || typeof point.y !== 'number') return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return {
    x: Math.max(-900, Math.min(900, point.x)),
    y: Math.max(-900, Math.min(900, point.y)),
  };
}

function sameNodes(left: ReleaseNode[], right: ReleaseNode[]) {
  if (left.length !== right.length) return false;
  return left.every((node, index) => {
    const other = right[index];
    return Boolean(other) && node.wallet === other.wallet && Math.abs(node.point.x - other.point.x) < .25 && Math.abs(node.point.y - other.point.y) < .25;
  });
}

function sanitizeGroups(value: unknown): ReleaseGroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Partial<ReleaseGroup>;
    if (typeof item.id !== 'string' || typeof item.scope !== 'string' || typeof item.name !== 'string' || !Array.isArray(item.members)) return [];
    const scope = keyWallet(item.scope);
    if (!validWallet(scope)) return [];
    const members = Array.from(new Set(item.members.filter((member): member is string => typeof member === 'string').map(keyWallet).filter(validWallet)));
    const position = finitePoint(item.position) ?? undefined;
    return [{
      id: item.id.slice(0, 96),
      scope,
      name: item.name.trim().slice(0, 24),
      members,
      collapsed: item.collapsed !== false,
      position,
    }];
  }).filter((group) => group.name.length > 0);
}

function sanitizeNodeOffsets(value: unknown): NodeOffsetStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next: NodeOffsetStore = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
    const parts = key.split('|');
    if (parts.length !== 2 || !validWallet(parts[0] ?? '') || !validWallet(parts[1] ?? '')) return;
    const point = finitePoint(raw);
    if (point) next[`${keyWallet(parts[0])}|${keyWallet(parts[1])}`] = point;
  });
  return next;
}

function centroid(members: string[], nodes: ReleaseNode[]): Point | null {
  const wanted = new Set(members);
  const points = nodes.filter((node) => wanted.has(node.wallet)).map((node) => node.point);
  if (!points.length) return null;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function defaultGroupPosition(index: number): Point {
  const angle = -Math.PI / 2 + index * 2.15;
  const radius = 154 + Math.floor(index / 5) * 34;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function groupPath(point: Point) {
  const bend = Math.sign(point.x || 1) * Math.min(36, Math.abs(point.x) * .2);
  return `M 0 0 C ${bend} ${point.y * .24}, ${point.x - bend} ${point.y * .76}, ${point.x} ${point.y}`;
}

function currentSceneScale(scene: HTMLElement | null) {
  if (!scene) return 1;
  const transform = window.getComputedStyle(scene).transform;
  if (!transform || transform === 'none') return 1;
  try {
    const matrix = new DOMMatrixReadOnly(transform);
    return Math.max(.01, Math.hypot(matrix.a, matrix.b));
  } catch {
    return 1;
  }
}

function nodePositionKey(scope: string, wallet: string) {
  return `${keyWallet(scope)}|${keyWallet(wallet)}`;
}

function keepNodeOutsideCenter(point: Point, fallback: Point): Point {
  const minRadius = 92;
  const distance = Math.hypot(point.x, point.y);
  if (distance >= minRadius) return point;
  const fallbackDistance = Math.hypot(fallback.x, fallback.y);
  const source = distance > 2 ? point : fallbackDistance > 2 ? fallback : { x: 0, y: -1 };
  const sourceDistance = Math.max(1, Math.hypot(source.x, source.y));
  return {
    x: source.x / sourceDistance * minRadius,
    y: source.y / sourceDistance * minRadius,
  };
}

export function NetworkReleaseGroups({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const { wallet } = useWalletLauncher();
  const walletKey = wallet ? keyWallet(wallet) : '';
  const copy = NETWORK_CANARY_UI_COPY[locale as SupportedLocale] ?? NETWORK_CANARY_UI_COPY.en;
  const boundaryRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<EditorState>(null);
  const groupsRef = useRef<ReleaseGroup[]>([]);
  const focusRef = useRef('');
  const nodesRef = useRef<ReleaseNode[]>([]);
  const nodeOffsetsRef = useRef<NodeOffsetStore>({});
  const groupDragRef = useRef<GroupDrag>(null);
  const nodeDragRef = useRef<NodeDrag>(null);
  const touchPointersRef = useRef(new Set<number>());
  const suppressNodeClickRef = useRef<{ wallet: string; until: number } | null>(null);

  const [stage, setStage] = useState<HTMLElement | null>(null);
  const [scene, setScene] = useState<HTMLElement | null>(null);
  const [focusWallet, setFocusWallet] = useState('');
  const [nodes, setNodes] = useState<ReleaseNode[]>([]);
  const [groups, setGroups] = useState<ReleaseGroup[]>([]);
  const [hydratedWallet, setHydratedWallet] = useState('');
  const [nodeOffsets, setNodeOffsets] = useState<NodeOffsetStore>({});
  const [nodeHydratedWallet, setNodeHydratedWallet] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; point: Point } | null>(null);
  const [nodeDragPreview, setNodeDragPreview] = useState<{ wallet: string; offset: Point } | null>(null);
  const [groupDropTargetId, setGroupDropTargetId] = useState<string | null>(null);

  editorRef.current = editor;
  groupsRef.current = groups;
  focusRef.current = focusWallet;
  nodesRef.current = nodes;
  nodeOffsetsRef.current = nodeOffsets;

  const cancelNodeDrag = (discardPreview = true) => {
    const drag = nodeDragRef.current;
    if (drag) window.clearTimeout(drag.timer);
    nodeDragRef.current = null;
    if (discardPreview) setNodeDragPreview(null);
    setGroupDropTargetId(null);
  };

  useEffect(() => {
    setHydratedWallet('');
    setGroups([]);
    setPanelOpen(false);
    setEditor(null);
    setDragPreview(null);
    cancelNodeDrag();
    if (!walletKey) return;
    try {
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${walletKey}`);
      setGroups(raw ? sanitizeGroups(JSON.parse(raw)) : []);
    } catch {
      setGroups([]);
    } finally {
      setHydratedWallet(walletKey);
    }
  }, [walletKey]);

  useEffect(() => {
    setNodeHydratedWallet('');
    setNodeOffsets({});
    if (!walletKey) return;
    try {
      const raw = window.localStorage.getItem(`${NODE_POSITION_PREFIX}${walletKey}`);
      setNodeOffsets(raw ? sanitizeNodeOffsets(JSON.parse(raw)) : {});
    } catch {
      setNodeOffsets({});
    } finally {
      setNodeHydratedWallet(walletKey);
    }
  }, [walletKey]);

  useEffect(() => {
    if (!walletKey || hydratedWallet !== walletKey) return;
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${walletKey}`, JSON.stringify(groups));
    } catch {
      // Groups are a local presentation preference; Network data remains authoritative.
    }
  }, [hydratedWallet, walletKey, groups]);

  useEffect(() => {
    if (!walletKey || nodeHydratedWallet !== walletKey) return;
    try {
      window.localStorage.setItem(`${NODE_POSITION_PREFIX}${walletKey}`, JSON.stringify(nodeOffsets));
    } catch {
      // Node positions are local presentation state only.
    }
  }, [nodeHydratedWallet, nodeOffsets, walletKey]);

  useLayoutEffect(() => {
    const boundary = boundaryRef.current;
    if (!boundary) return;
    let frame = 0;

    const sync = () => {
      frame = 0;
      const nextStage = boundary.querySelector<HTMLElement>('.releaseStage');
      const nextScene = boundary.querySelector<HTMLElement>('.releaseScene');
      const center = boundary.querySelector<HTMLElement>('.releaseCenter[data-release-wallet]');
      const nextFocus = center?.dataset.releaseWallet ? keyWallet(center.dataset.releaseWallet) : '';
      const nextNodes = Array.from(boundary.querySelectorAll<HTMLElement>('.releasePerson[data-release-wallet]')).flatMap((node) => {
        const address = node.dataset.releaseWallet ? keyWallet(node.dataset.releaseWallet) : '';
        if (!validWallet(address)) return [];
        return [{
          wallet: address,
          point: {
            x: parsePx(node.style.getPropertyValue('--node-x')),
            y: parsePx(node.style.getPropertyValue('--node-y')),
          },
        }];
      });

      setStage((current) => current === nextStage ? current : nextStage);
      setScene((current) => current === nextScene ? current : nextScene);
      setFocusWallet((current) => current === nextFocus ? current : nextFocus);
      setNodes((current) => sameNodes(current, nextNodes) ? current : nextNodes);
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(sync);
    };

    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(boundary, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-release-wallet'],
    });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    setPanelOpen(false);
    setEditor(null);
    setDragPreview(null);
    cancelNodeDrag();
  }, [focusWallet]);

  const currentGroups = useMemo(
    () => groups.filter((group) => group.scope === focusWallet),
    [groups, focusWallet],
  );
  const currentEditorGroup = editor?.mode === 'edit'
    ? currentGroups.find((group) => group.id === editor.groupId) ?? null
    : null;

  const positionedNodes = useMemo(() => nodes.map((node) => {
    const stored = nodeOffsets[nodePositionKey(focusWallet, node.wallet)] ?? { x: 0, y: 0 };
    const offset = nodeDragPreview?.wallet === node.wallet ? nodeDragPreview.offset : stored;
    return {
      ...node,
      point: { x: node.point.x + offset.x, y: node.point.y + offset.y },
    };
  }), [focusWallet, nodeDragPreview, nodeOffsets, nodes]);

  const groupLayouts = useMemo(() => currentGroups.map((group, index) => ({
    group,
    point: dragPreview?.id === group.id
      ? dragPreview.point
      : group.position ?? centroid(group.members, positionedNodes) ?? defaultGroupPosition(index),
  })), [currentGroups, positionedNodes, dragPreview]);

  useEffect(() => {
    const boundary = boundaryRef.current;
    if (!boundary) return;
    const selected = new Set(editor?.selected ?? []);
    const managingId = editor?.mode === 'edit' ? editor.groupId : null;
    const owner = new Map<string, ReleaseGroup>();
    currentGroups.forEach((group) => group.members.forEach((member) => owner.set(member, group)));
    const baseByWallet = new Map(nodes.map((node) => [node.wallet, node.point]));
    const people = Array.from(boundary.querySelectorAll<HTMLElement>('.releasePerson[data-release-wallet]'));
    const edges = Array.from(boundary.querySelectorAll<SVGLineElement>('.releaseEdges line:not(.clusterEdge)'));

    people.forEach((person, index) => {
      const address = person.dataset.releaseWallet ? keyWallet(person.dataset.releaseWallet) : '';
      const group = owner.get(address);
      const hidden = Boolean(group?.collapsed && (!managingId || managingId !== group.id));
      const base = baseByWallet.get(address) ?? { x: 0, y: 0 };
      const stored = nodeOffsets[nodePositionKey(focusWallet, address)] ?? { x: 0, y: 0 };
      const offset = nodeDragPreview?.wallet === address ? nodeDragPreview.offset : stored;

      person.style.setProperty('--release-node-offset-x', `${offset.x}px`);
      person.style.setProperty('--release-node-offset-y', `${offset.y}px`);
      person.classList.toggle('releaseGroupHidden', hidden);
      person.classList.toggle('releaseGroupDraftSelected', Boolean(editor && selected.has(address)));
      person.classList.toggle('releaseGroupDraftUnselected', Boolean(editor && !selected.has(address)));
      person.classList.toggle('releaseNodeDragging', nodeDragPreview?.wallet === address);

      const edge = edges[index];
      if (edge) {
        edge.setAttribute('x2', String(base.x + offset.x));
        edge.setAttribute('y2', String(base.y + offset.y));
        edge.classList.toggle('releaseGroupHiddenEdge', hidden);
      }
    });

    boundary.classList.toggle('releaseGroupEditing', Boolean(editor));
    return () => {
      people.forEach((person) => {
        person.classList.remove('releaseGroupHidden', 'releaseGroupDraftSelected', 'releaseGroupDraftUnselected', 'releaseNodeDragging');
      });
      edges.forEach((edge) => edge.classList.remove('releaseGroupHiddenEdge'));
      boundary.classList.remove('releaseGroupEditing');
    };
  }, [currentGroups, editor, focusWallet, nodeDragPreview, nodeOffsets, nodes]);

  useEffect(() => {
    const boundary = boundaryRef.current;
    if (!boundary) return;

    const groupTargetAt = (clientX: number, clientY: number) => {
      const targets = Array.from(boundary.querySelectorAll<HTMLElement>('[data-release-group-id]'));
      for (const target of targets) {
        const rect = target.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const pad = target.classList.contains('releaseGroupHub') ? 18 : 5;
        if (
          clientX >= rect.left - pad && clientX <= rect.right + pad &&
          clientY >= rect.top - pad && clientY <= rect.bottom + pad
        ) return target.dataset.releaseGroupId ?? null;
      }
      return null;
    };

    const ownerOf = (address: string) => groupsRef.current.find(
      (group) => group.scope === focusRef.current && group.members.includes(address),
    ) ?? null;

    const setSuppressed = (address: string) => {
      suppressNodeClickRef.current = { wallet: address, until: performance.now() + NODE_CLICK_SUPPRESS_MS };
    };

    const commitNodeOffset = (address: string, previewOffset: Point) => {
      const base = nodesRef.current.find((node) => node.wallet === address)?.point ?? { x: 0, y: -120 };
      const finalPoint = keepNodeOutsideCenter({ x: base.x + previewOffset.x, y: base.y + previewOffset.y }, base);
      const nextOffset = { x: finalPoint.x - base.x, y: finalPoint.y - base.y };
      const key = nodePositionKey(focusRef.current, address);
      setNodeOffsets((current) => {
        const next = { ...current, [key]: nextOffset };
        nodeOffsetsRef.current = next;
        return next;
      });
    };

    const moveMember = (address: string, sourceGroupId: string | null, targetGroupId: string | null) => {
      if (sourceGroupId === targetGroupId) return;
      setGroups((current) => current.map((group) => {
        if (group.scope !== focusRef.current) return group;
        let members = group.members.filter((member) => member !== address);
        if (targetGroupId && group.id === targetGroupId) members = [...members, address];
        if (members.length === group.members.length && members.every((member, index) => member === group.members[index])) return group;
        return { ...group, members };
      }));
    };

    const clearNodeDrag = () => {
      const drag = nodeDragRef.current;
      if (drag) window.clearTimeout(drag.timer);
      nodeDragRef.current = null;
      setNodeDragPreview(null);
      setGroupDropTargetId(null);
    };

    const onClickCapture = (event: MouseEvent) => {
      const node = event.target instanceof Element
        ? event.target.closest<HTMLElement>('.releasePerson[data-release-wallet]')
        : null;
      if (!node || !boundary.contains(node)) return;
      const address = node.dataset.releaseWallet ? keyWallet(node.dataset.releaseWallet) : '';
      if (!validWallet(address)) return;

      const suppressed = suppressNodeClickRef.current;
      if (suppressed && suppressed.wallet === address && performance.now() < suppressed.until) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      const active = editorRef.current;
      if (!active) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setEditor((current) => {
        if (!current) return current;
        const exists = current.selected.includes(address);
        return {
          ...current,
          selected: exists
            ? current.selected.filter((value) => value !== address)
            : [...current.selected, address],
        };
      });
    };

    const onPointerDownCapture = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        touchPointersRef.current.add(event.pointerId);
        if (touchPointersRef.current.size > 1) {
          groupDragRef.current = null;
          setDragPreview(null);
          clearNodeDrag();
          return;
        }
      }

      if (editorRef.current) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (boundary.querySelector('.releaseScene.loadingFocus')) return;
      const target = event.target instanceof Element ? event.target : null;
      const node = target?.closest<HTMLElement>('.releasePerson[data-release-wallet]') ?? null;
      if (!node || !boundary.contains(node) || node.classList.contains('releaseGroupHidden')) return;
      const address = node.dataset.releaseWallet ? keyWallet(node.dataset.releaseWallet) : '';
      if (!validWallet(address) || !focusRef.current) return;

      clearNodeDrag();
      const startOffset = nodeOffsetsRef.current[nodePositionKey(focusRef.current, address)] ?? { x: 0, y: 0 };
      const state: NonNullable<NodeDrag> = {
        pointerId: event.pointerId,
        wallet: address,
        startX: event.clientX,
        startY: event.clientY,
        startOffset,
        previewOffset: startOffset,
        sourceGroupId: ownerOf(address)?.id ?? null,
        mode: 'pending',
        moved: false,
        timer: 0,
      };
      state.timer = window.setTimeout(() => {
        if (nodeDragRef.current !== state || editorRef.current || touchPointersRef.current.size > 1) return;
        state.mode = 'free';
        setSuppressed(address);
      }, NODE_HOLD_MS);
      nodeDragRef.current = state;
    };

    const onPointerMoveCapture = (event: PointerEvent) => {
      const drag = nodeDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (event.pointerType === 'touch' && touchPointersRef.current.size > 1) {
        clearNodeDrag();
        return;
      }

      const dxScreen = event.clientX - drag.startX;
      const dyScreen = event.clientY - drag.startY;
      const distance = Math.hypot(dxScreen, dyScreen);
      const scale = currentSceneScale(scene);

      if (drag.mode === 'pending') {
        if (distance < NODE_TRANSFER_THRESHOLD_PX) return;
        window.clearTimeout(drag.timer);
        drag.mode = 'transfer';
        drag.moved = true;
        setSuppressed(drag.wallet);
      } else if (drag.mode === 'free' && !drag.moved) {
        if (distance < NODE_FREE_THRESHOLD_PX) return;
        drag.moved = true;
      }

      if (!drag.moved) return;
      const previewOffset = {
        x: drag.startOffset.x + dxScreen / scale,
        y: drag.startOffset.y + dyScreen / scale,
      };
      drag.previewOffset = previewOffset;
      setNodeDragPreview({ wallet: drag.wallet, offset: previewOffset });
      setGroupDropTargetId(drag.mode === 'transfer' ? groupTargetAt(event.clientX, event.clientY) : null);
    };

    const finishNodePointer = (event: PointerEvent) => {
      const drag = nodeDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      window.clearTimeout(drag.timer);

      if (drag.mode === 'free') {
        setSuppressed(drag.wallet);
        if (drag.moved) commitNodeOffset(drag.wallet, drag.previewOffset);
      } else if (drag.mode === 'transfer' && drag.moved) {
        setSuppressed(drag.wallet);
        const targetGroupId = groupTargetAt(event.clientX, event.clientY);
        moveMember(drag.wallet, drag.sourceGroupId, targetGroupId);
      }

      nodeDragRef.current = null;
      setNodeDragPreview(null);
      setGroupDropTargetId(null);
    };

    const onPointerUpCapture = (event: PointerEvent) => {
      finishNodePointer(event);
      if (event.pointerType === 'touch') touchPointersRef.current.delete(event.pointerId);
    };

    const onPointerCancelCapture = (event: PointerEvent) => {
      if (event.pointerType === 'touch') touchPointersRef.current.delete(event.pointerId);
      if (nodeDragRef.current?.pointerId === event.pointerId) clearNodeDrag();
      if (groupDragRef.current?.pointerId === event.pointerId) {
        groupDragRef.current = null;
        setDragPreview(null);
      }
    };

    boundary.addEventListener('click', onClickCapture, true);
    boundary.addEventListener('pointerdown', onPointerDownCapture, true);
    boundary.addEventListener('pointermove', onPointerMoveCapture, true);
    boundary.addEventListener('pointerup', onPointerUpCapture, true);
    boundary.addEventListener('pointercancel', onPointerCancelCapture, true);
    return () => {
      boundary.removeEventListener('click', onClickCapture, true);
      boundary.removeEventListener('pointerdown', onPointerDownCapture, true);
      boundary.removeEventListener('pointermove', onPointerMoveCapture, true);
      boundary.removeEventListener('pointerup', onPointerUpCapture, true);
      boundary.removeEventListener('pointercancel', onPointerCancelCapture, true);
      touchPointersRef.current.clear();
      groupDragRef.current = null;
      clearNodeDrag();
    };
  }, [scene]);

  const beginCreate = () => {
    if (!focusWallet) return;
    setEditor({ mode: 'create', groupId: null, name: '', selected: [] });
  };

  const beginEdit = (group: ReleaseGroup) => {
    setEditor({ mode: 'edit', groupId: group.id, name: group.name, selected: [...group.members] });
  };

  const saveEditor = () => {
    if (!editor || !focusWallet) return;
    const name = editor.name.trim().slice(0, 24);
    if (!name) return;
    const selected = Array.from(new Set(editor.selected.map(keyWallet).filter(validWallet)));

    setGroups((current) => {
      let next = current.map((group) => {
        if (group.scope !== focusWallet) return group;
        if (editor.mode === 'edit' && group.id === editor.groupId) {
          return { ...group, name, members: selected };
        }
        const cleaned = group.members.filter((member) => !selected.includes(member));
        return cleaned.length === group.members.length ? group : { ...group, members: cleaned };
      });

      if (editor.mode === 'create') {
        next = [...next, {
          id: `release-group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          scope: focusWallet,
          name,
          members: selected,
          collapsed: true,
        }];
      }
      return next;
    });
    setEditor(null);
  };

  const deleteGroup = (groupId: string) => {
    setGroups((current) => current.filter((group) => group.id !== groupId));
    if (editor?.groupId === groupId) setEditor(null);
  };

  const toggleGroup = (groupId: string) => {
    if (editor) return;
    setGroups((current) => current.map((group) => group.id === groupId ? { ...group, collapsed: !group.collapsed } : group));
  };

  const groupPoint = (groupId: string) => groupLayouts.find((layout) => layout.group.id === groupId)?.point ?? { x: 0, y: 0 };

  const onGroupPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, group: ReleaseGroup) => {
    if (editor || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.pointerType === 'touch' && touchPointersRef.current.size > 1) return;
    const startPosition = groupPoint(group.id);
    groupDragRef.current = {
      groupId: group.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition,
      previewPosition: startPosition,
      moved: false,
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
  };

  const onGroupPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = groupDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.pointerType === 'touch' && touchPointersRef.current.size > 1) {
      groupDragRef.current = null;
      setDragPreview(null);
      return;
    }
    const dxScreen = event.clientX - drag.startX;
    const dyScreen = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dxScreen, dyScreen) >= 6) drag.moved = true;
    if (!drag.moved) return;
    const scale = currentSceneScale(scene);
    const previewPosition = {
      x: drag.startPosition.x + dxScreen / scale,
      y: drag.startPosition.y + dyScreen / scale,
    };
    drag.previewPosition = previewPosition;
    setDragPreview({ id: drag.groupId, point: previewPosition });
  };

  const finishGroupPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = groupDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    groupDragRef.current = null;
    setDragPreview(null);
    if (!drag.moved) {
      toggleGroup(drag.groupId);
      return;
    }
    const committedPosition = drag.previewPosition;
    setGroups((current) => current.map((group) => group.id === drag.groupId ? { ...group, position: committedPosition } : group));
  };

  const cancelGroupPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = groupDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    groupDragRef.current = null;
    setDragPreview(null);
  };

  return (
    <div ref={boundaryRef} className="networkReleaseGroupsBoundary">
      {children}
      {stage ? createPortal(
        <>
          <button
            type="button"
            className={`releaseGroupsToggle ${panelOpen ? 'active' : ''}`}
            data-release-interactive="true"
            onClick={() => {
              setPanelOpen((current) => !current);
              if (panelOpen) setEditor(null);
            }}
          >
            {copy.groups}
            {currentGroups.length > 0 ? <span>{currentGroups.length}</span> : null}
          </button>
          {panelOpen ? (
            <aside className="releaseGroupsPanel" data-release-interactive="true">
              {editor ? (
                <>
                  <div className="releaseGroupsHead">
                    <div><b>{editor.mode === 'create' ? copy.createGroup : `${copy.edit} ${currentEditorGroup?.name ?? ''}`}</b><small>{copy.tapAddRemove}</small></div>
                    <button type="button" onClick={() => setEditor(null)}>×</button>
                  </div>
                  <div className="releaseGroupSelection"><b>{editor.selected.length}</b><span>{copy.tapAddRemove}</span></div>
                  <input
                    value={editor.name}
                    maxLength={24}
                    onChange={(event) => setEditor((current) => current ? { ...current, name: event.target.value } : current)}
                    placeholder={copy.groupName}
                  />
                  <div className="releaseGroupActions">
                    <button type="button" onClick={() => setEditor(null)}>{copy.cancel}</button>
                    <button type="button" className="primary" onClick={saveEditor} disabled={!editor.name.trim()}>{editor.mode === 'create' ? copy.create : copy.save}</button>
                  </div>
                  <p>{copy.zeroAllowed}</p>
                </>
              ) : (
                <>
                  <div className="releaseGroupsHead">
                    <div><b>{copy.myGroups}</b><small>{copy.groupsCount.replace('{count}', String(currentGroups.length))}</small></div>
                    <button type="button" onClick={() => setPanelOpen(false)}>×</button>
                  </div>
                  <button type="button" className="releaseCreateGroup" onClick={beginCreate}>{copy.createGroup}</button>
                  <div className="releaseGroupList">
                    {currentGroups.length ? currentGroups.map((group) => (
                      <div
                        key={group.id}
                        className={`releaseGroupRow ${groupDropTargetId === group.id ? 'dropTarget' : ''}`}
                        data-release-group-id={group.id}
                      >
                        <button type="button" className="releaseGroupRowMain" onClick={() => toggleGroup(group.id)}>
                          <b>{group.name}</b><small>{copy.peopleCount.replace('{count}', String(group.members.length))} · {group.collapsed ? copy.collapsed : copy.expanded}</small>
                        </button>
                        <button type="button" onClick={() => beginEdit(group)}>{copy.edit}</button>
                        <button type="button" className="danger" onClick={() => deleteGroup(group.id)} aria-label={copy.removed}>×</button>
                      </div>
                    )) : <p className="releaseNoGroups">{copy.noGroups}</p>}
                  </div>
                </>
              )}
            </aside>
          ) : null}
        </>,
        stage,
      ) : null}

      {scene ? createPortal(
        <>
          <svg className="releaseGroupEdges" viewBox="-900 -900 1800 1800" aria-hidden="true">
            {groupLayouts.map(({ group, point }) => <path key={group.id} d={groupPath(point)} className={group.collapsed ? 'collapsed' : 'expanded'} />)}
          </svg>
          <div className="releaseGroupHubLayer">
            {groupLayouts.map(({ group, point }) => (
              <button
                key={group.id}
                type="button"
                className={`releaseGroupHub ${group.collapsed ? 'collapsed' : 'expanded'} ${editor?.groupId === group.id ? 'editing' : ''} ${groupDropTargetId === group.id ? 'dropTarget' : ''}`}
                style={{ '--group-x': `${point.x}px`, '--group-y': `${point.y}px` } as CSSProperties}
                data-release-interactive="true"
                data-release-group-id={group.id}
                onPointerDown={(event) => onGroupPointerDown(event, group)}
                onPointerMove={onGroupPointerMove}
                onPointerUp={finishGroupPointer}
                onPointerCancel={cancelGroupPointer}
                onContextMenu={(event) => event.preventDefault()}
              >
                <span aria-hidden="true">▦</span>
                <b>{group.name}</b>
                <small>{copy.peopleCount.replace('{count}', String(group.members.length))} · {group.collapsed ? copy.collapsed : copy.expanded}</small>
              </button>
            ))}
          </div>
        </>,
        scene,
      ) : null}

      <style jsx global>{`
        .networkReleaseGroupsBoundary{width:100%;min-width:0}.networkReleaseGroupsBoundary.releaseGroupEditing .releaseInspector{display:none!important}
        .networkReleaseGroupsBoundary .releasePerson{left:calc(var(--node-x) + var(--release-node-offset-x,0px))!important;top:calc(var(--node-y) + var(--release-node-offset-y,0px))!important}
        .networkReleaseGroupsBoundary .releasePerson.releaseNodeDragging{z-index:20!important;opacity:.92!important;filter:none!important;transition:none!important;cursor:grabbing!important}
        .networkReleaseGroupsBoundary.releaseGroupEditing .releasePerson.releaseGroupDraftUnselected{opacity:.42!important;filter:saturate(.68)!important}.networkReleaseGroupsBoundary.releaseGroupEditing .releasePerson.releaseGroupDraftSelected{opacity:1!important;filter:none!important;z-index:12!important}
        .networkReleaseGroupsBoundary .releasePerson.releaseGroupHidden{opacity:0!important;pointer-events:none!important}.networkReleaseGroupsBoundary .releaseEdges line.releaseGroupHiddenEdge{opacity:0!important;animation:none!important}
        .releaseGroupsToggle{position:absolute;z-index:31;left:9px;top:46px;min-height:30px;padding:0 9px;border:1px solid rgba(244,183,40,.18);border-radius:9px;background:rgba(15,15,13,.9);color:#a68c4d;font:inherit;font-size:.48rem;font-weight:900;cursor:pointer;backdrop-filter:blur(10px)}.releaseGroupsToggle.active{border-color:rgba(244,183,40,.4);color:#dfbc56}.releaseGroupsToggle span{margin-left:5px;color:#706345}
        .releaseGroupsPanel{position:absolute;z-index:45;left:9px;top:82px;width:min(318px,calc(100% - 18px));box-sizing:border-box;padding:11px;border:1px solid rgba(244,183,40,.2);border-radius:15px;background:rgba(13,13,11,.98);box-shadow:0 18px 48px rgba(0,0,0,.4);color:#d7d0c3}.releaseGroupsHead{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.releaseGroupsHead>div{min-width:0;display:grid;gap:2px}.releaseGroupsHead b{color:#d5b254;font-size:.56rem}.releaseGroupsHead small{color:#776f63;font-size:.39rem;line-height:1.35}.releaseGroupsHead>button{width:28px;height:28px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:#11110e;color:#948b7e;font:inherit;cursor:pointer}
        .releaseCreateGroup{width:100%;min-height:34px;margin-top:9px;border:1px solid rgba(244,183,40,.2);border-radius:9px;background:rgba(244,183,40,.065);color:#d1ae4e;font:inherit;font-size:.47rem;font-weight:850;cursor:pointer}.releaseGroupList{display:grid;gap:6px;margin-top:8px;max-height:250px;overflow:auto}.releaseGroupRow{display:grid;grid-template-columns:minmax(0,1fr) auto 30px;gap:5px;align-items:stretch;border-radius:10px;transition:box-shadow 120ms ease,background 120ms ease}.releaseGroupRow.dropTarget{background:rgba(244,183,40,.07);box-shadow:0 0 0 2px rgba(244,183,40,.32)}.releaseGroupRow>button{min-height:34px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:#0f0f0d;color:#9f9585;font:inherit;font-size:.4rem;cursor:pointer}.releaseGroupRow>button:not(.releaseGroupRowMain){padding:0 8px;color:#b99a49}.releaseGroupRow>button.danger{padding:0;color:#8f665d}.releaseGroupRowMain{min-width:0;padding:5px 8px!important;display:grid;gap:2px;text-align:start}.releaseGroupRowMain b{overflow:hidden;color:#c9a94f;font-size:.46rem;text-overflow:ellipsis;white-space:nowrap}.releaseGroupRowMain small{color:#6f675b;font-size:.36rem}.releaseNoGroups{margin:10px 2px 2px;color:#6e675c;font-size:.4rem}
        .releaseGroupSelection{display:flex;align-items:baseline;gap:6px;margin-top:10px}.releaseGroupSelection>b{color:#e2ba4f;font-size:1rem}.releaseGroupSelection>span{color:#81786a;font-size:.39rem}.releaseGroupsPanel input{width:100%;height:36px;box-sizing:border-box;margin-top:8px;padding:0 9px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#090907;color:#ded7ca;outline:none;font:inherit;font-size:.48rem}.releaseGroupsPanel input:focus{border-color:rgba(244,183,40,.42)}.releaseGroupActions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px}.releaseGroupActions button{min-height:34px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#11110e;color:#91887b;font:inherit;font-size:.44rem;cursor:pointer}.releaseGroupActions button.primary{border-color:rgba(244,183,40,.28);background:rgba(244,183,40,.08);color:#d5b354}.releaseGroupActions button:disabled{opacity:.34}.releaseGroupsPanel>p{margin:7px 1px 0;color:#70685c;font-size:.37rem}
        .releaseGroupEdges{position:absolute;z-index:3;left:-900px;top:-900px;width:1800px;height:1800px;overflow:visible;pointer-events:none}.releaseGroupEdges path{fill:none;vector-effect:non-scaling-stroke;stroke:rgba(244,183,40,.25);stroke-width:1;stroke-linecap:round;stroke-dasharray:4 8;opacity:.72}.releaseGroupEdges path.expanded{opacity:.16}.releaseGroupHubLayer{position:absolute;inset:0;z-index:9;pointer-events:none}.releaseGroupHub{position:absolute;left:var(--group-x);top:var(--group-y);min-width:104px;max-width:154px;padding:8px 9px;transform:translate(-50%,-50%);display:grid;grid-template-columns:18px 1fr;column-gap:5px;row-gap:1px;align-items:center;border:1px solid rgba(244,183,40,.5);border-radius:13px;background:rgba(18,16,10,.96);color:#d8b450;font:inherit;text-align:start;pointer-events:auto;touch-action:none;user-select:none;cursor:grab;box-shadow:0 8px 28px rgba(0,0,0,.26);transition:border-color 120ms ease,box-shadow 120ms ease,background 120ms ease}.releaseGroupHub:active{cursor:grabbing}.releaseGroupHub>span{grid-row:1/3;font-size:.72rem}.releaseGroupHub>b{overflow:hidden;font-size:.46rem;text-overflow:ellipsis;white-space:nowrap}.releaseGroupHub>small{color:#756b55;font-size:.34rem;white-space:nowrap}.releaseGroupHub.expanded{border-style:dashed;opacity:.86}.releaseGroupHub.editing{border-color:rgba(244,183,40,.95);box-shadow:0 0 0 4px rgba(244,183,40,.08)}.releaseGroupHub.dropTarget{border-color:rgba(244,183,40,.95);background:rgba(31,25,10,.98);box-shadow:0 0 0 5px rgba(244,183,40,.1),0 10px 34px rgba(0,0,0,.32)}
        @media(max-width:640px){.releaseGroupsPanel input{font-size:16px}.releaseGroupsPanel{top:80px}.releaseGroupHub{min-width:96px;max-width:140px;padding:7px 8px}.releaseGroupsToggle{top:44px}}
        @media(prefers-reduced-motion:reduce){.releasePerson,.releaseGroupHub{transition:none!important}}
      `}</style>
    </div>
  );
}
