'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

import { QaNetworkRadialPlaygroundV39 } from './QaNetworkRadialPlaygroundV39';

type Point = { x: number; y: number };
type DevicePoints = { desktop: Point; mobile: Point };
type UserGroup = {
  id: string;
  scope: string;
  name: string;
  members: string[];
  collapsed: boolean;
  positions?: DevicePoints;
  memberOffsets?: DevicePoints;
  offsets?: DevicePoints;
};
type Hosts = { nav: HTMLElement | null; stage: HTMLElement | null; scene: HTMLElement | null };
type GroupDrag = {
  groupId: string;
  pointerId: number;
  startX: number;
  startY: number;
  startPosition: Point;
  startMemberOffset: Point;
  moved: boolean;
  target: HTMLButtonElement;
} | null;
type NodeDropDrag = {
  nodeId: string;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  groupedAtStart: boolean;
} | null;
type NoticeState = { message: string; undo: UserGroup[] | null } | null;

const STORAGE_KEY = 'veinvite:qa:radial-v42:groups-v1';
const LEGACY_STORAGE_KEYS = ['veinvite:qa:radial-v41:groups-v1', 'veinvite:qa:radial-v40:groups-v1'];
const EMPTY_HOSTS: Hosts = { nav: null, stage: null, scene: null };
const ZERO_DEVICE_POINTS: DevicePoints = { desktop: { x: 0, y: 0 }, mobile: { x: 0, y: 0 } };
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function clonePoint(point: Point): Point { return { x: point.x, y: point.y }; }
function cloneDevicePoints(value: DevicePoints): DevicePoints {
  return { desktop: clonePoint(value.desktop), mobile: clonePoint(value.mobile) };
}
function cloneGroups(groups: UserGroup[]) {
  return groups.map((group) => ({
    ...group,
    members: [...group.members],
    positions: group.positions ? cloneDevicePoints(group.positions) : undefined,
    memberOffsets: group.memberOffsets ? cloneDevicePoints(group.memberOffsets) : undefined,
    offsets: group.offsets ? cloneDevicePoints(group.offsets) : undefined,
  }));
}
function curvePath(point: Point) {
  const bend = Math.sign(point.x || 1) * Math.min(64, Math.abs(point.x) * .17);
  return `M 0 0 C ${bend} ${point.y * .22}, ${point.x - bend} ${point.y * .78}, ${point.x} ${point.y}`;
}
function scenarioId(root: HTMLElement) {
  const label = root.querySelector<HTMLElement>('.scenarioBar button.active b')?.textContent?.trim() ?? '';
  const map: Record<string, string> = {
    '0명': 'zero', '1명': 'one', '5명': 'five', '30명': 'balanced30', '직접 50': 'direct50', '100명': 'hundred', '500명': 'fiveHundred',
  };
  return map[label] ?? (label || 'unknown');
}
function scopeKey(root: HTMLElement) {
  const crumbs = Array.from(root.querySelectorAll<HTMLButtonElement>('.crumbs button'))
    .map((button) => button.textContent?.trim() ?? '').filter(Boolean);
  return `${scenarioId(root)}|${crumbs.join('>') || 'YOU'}`;
}
function readZoom(root: HTMLElement) {
  const text = root.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
  const parsed = Number.parseFloat(text.replace('%', ''));
  return Number.isFinite(parsed) ? Math.max(.01, parsed / 100) : 1;
}
function pointsEqual(a: Record<string, Point>, b: Record<string, Point>) {
  const aKeys = Object.keys(a); const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => {
    const left = a[key]; const right = b[key];
    return Boolean(right) && Math.abs(left.x - right.x) < .25 && Math.abs(left.y - right.y) < .25;
  });
}
function centroid(group: UserGroup, positions: Record<string, Point>) {
  const points = group.members.map((id) => positions[id]).filter((point): point is Point => Boolean(point));
  if (!points.length) return null;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}
function protectCenter(point: Point, compact: boolean, fallback: Point = { x: 0, y: -1 }) {
  const minimum = compact ? 176 : 238;
  const radius = Math.hypot(point.x, point.y);
  if (radius >= minimum) return point;
  const fallbackAngle = Math.atan2(fallback.y || -1, fallback.x || .001);
  const angle = radius > 4 ? Math.atan2(point.y, point.x) : fallbackAngle;
  return { x: Math.cos(angle) * minimum, y: Math.sin(angle) * minimum };
}
function defaultGroupPoint(index: number, compact: boolean) {
  const ring = Math.floor(index / 7);
  const angle = -Math.PI / 2 + index * GOLDEN_ANGLE;
  const radius = (compact ? 236 : 342) + ring * (compact ? 72 : 96);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * (compact ? .86 : .78) };
}
function setDevicePoint(current: DevicePoints | undefined, compact: boolean, point: Point, fallback: DevicePoints) {
  const next = current ? cloneDevicePoints(current) : cloneDevicePoints(fallback);
  if (compact) next.mobile = point; else next.desktop = point;
  return next;
}

export function QaNetworkRadialPlaygroundV42() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const observerFrameRef = useRef<number | null>(null);
  const groupDragRef = useRef<GroupDrag>(null);
  const nodeDropDragRef = useRef<NodeDropDrag>(null);
  const groupsRef = useRef<UserGroup[]>([]);
  const scopeRef = useRef('');
  const creatingRef = useRef(false);
  const managingGroupIdRef = useRef<string | null>(null);
  const dropHoverRef = useRef<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const syntheticPanIdRef = useRef(98123);

  const [hosts, setHosts] = useState<Hosts>(EMPTY_HOSTS);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [scope, setScope] = useState('');
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [compact, setCompact] = useState(false);
  const [autoClustered, setAutoClustered] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [managingGroupId, setManagingGroupId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [dropHoverGroupId, setDropHoverGroupId] = useState<string | null>(null);
  const [removeHover, setRemoveHover] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  groupsRef.current = groups;
  scopeRef.current = scope;
  creatingRef.current = creating;
  managingGroupIdRef.current = managingGroupId;
  dropHoverRef.current = dropHoverGroupId;

  const currentGroups = useMemo(() => groups.filter((group) => group.scope === scope), [groups, scope]);
  const memberOwner = useMemo(() => {
    const map = new Map<string, string>();
    currentGroups.forEach((group) => group.members.forEach((id) => map.set(id, group.id)));
    return map;
  }, [currentGroups]);
  const managingGroup = useMemo(
    () => currentGroups.find((group) => group.id === managingGroupId) ?? null,
    [currentGroups, managingGroupId],
  );

  const groupIndex = (id: string) => Math.max(0, currentGroups.findIndex((group) => group.id === id));
  const memberOffsetFor = (group: UserGroup, isCompact = compact) => {
    const value = group.memberOffsets ?? group.offsets ?? ZERO_DEVICE_POINTS;
    return isCompact ? value.mobile : value.desktop;
  };
  const groupPositionFor = (group: UserGroup, isCompact = compact) => {
    if (group.positions) return isCompact ? group.positions.mobile : group.positions.desktop;
    const base = centroid(group, positions);
    const offset = memberOffsetFor(group, isCompact);
    if (base) return protectCenter({ x: base.x + offset.x, y: base.y + offset.y }, isCompact, base);
    return defaultGroupPoint(groupIndex(group.id), isCompact);
  };
  const groupLayouts = useMemo(
    () => currentGroups.map((group) => ({ group, hub: groupPositionFor(group) })),
    [currentGroups, positions, compact],
  );

  useEffect(() => {
    try {
      let raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        for (const key of LEGACY_STORAGE_KEYS) {
          raw = window.localStorage.getItem(key);
          if (raw) break;
        }
      }
      if (raw) {
        const parsed = JSON.parse(raw) as UserGroup[];
        if (Array.isArray(parsed)) setGroups(parsed);
      }
    } catch { setGroups([]); } finally { setHydrated(true); }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(groups)); } catch { /* QA only */ }
  }, [groups, hydrated]);

  useEffect(() => {
    setCreating(false); setManagingGroupId(null); setSelectedIds([]); setGroupName('');
    setDropHoverGroupId(null); setRemoveHover(false); setDraggingNodeId(null);
  }, [scope]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const syncDom = () => {
      observerFrameRef.current = null;
      const nav = root.querySelector<HTMLElement>('.navActions');
      const stage = root.querySelector<HTMLElement>('.stage');
      const scene = root.querySelector<HTMLElement>('.scene');
      setHosts((current) => current.nav === nav && current.stage === stage && current.scene === scene ? current : { nav, stage, scene });
      const title = root.querySelector<HTMLElement>('.labHeader strong');
      const subtitle = root.querySelector<HTMLElement>('.labHeader > div:first-child span');
      if (title && title.textContent !== 'RADIAL NETWORK PLAYGROUND · V42') title.textContent = 'RADIAL NETWORK PLAYGROUND · V42';
      if (subtitle && subtitle.textContent !== 'Empty groups · independent group position · panel drop zones · undo') subtitle.textContent = 'Empty groups · independent group position · panel drop zones · undo';
      const rules = root.querySelectorAll<HTMLElement>('.rules span');
      if (rules[1]) rules[1].innerHTML = '<b>Empty groups</b>Create a group first, then add people whenever you want.';
      if (rules[3]) rules[3].innerHTML = '<b>Independent layout</b>Moving one person never moves the group box.';
      const nextScope = scopeKey(root);
      setScope((current) => current === nextScope ? current : nextScope);
      const nextCompact = window.innerWidth <= 640;
      setCompact((current) => current === nextCompact ? current : nextCompact);
      const clustered = Boolean(stage?.classList.contains('clusterMode'));
      setAutoClustered((current) => current === clustered ? current : clustered);
      if (!clustered) {
        const nextPositions: Record<string, Point> = {};
        root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]').forEach((node) => {
          const id = node.dataset.nodeId;
          if (!id) return;
          nextPositions[id] = { x: parsePx(node.style.getPropertyValue('--x')), y: parsePx(node.style.getPropertyValue('--y')) };
        });
        setPositions((current) => pointsEqual(current, nextPositions) ? current : nextPositions);
      }
    };
    const schedule = () => {
      if (observerFrameRef.current !== null) return;
      observerFrameRef.current = window.requestAnimationFrame(syncDom);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('resize', schedule);
    syncDom();
    return () => {
      observer.disconnect(); window.removeEventListener('resize', schedule);
      if (observerFrameRef.current !== null) window.cancelAnimationFrame(observerFrameRef.current);
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !scope || !Object.keys(positions).length) return;
    setGroups((current) => {
      let changed = false;
      const scoped = current.filter((group) => group.scope === scope);
      const next = current.map((group) => {
        if (group.scope !== scope || group.positions) return group;
        changed = true;
        const index = Math.max(0, scoped.findIndex((item) => item.id === group.id));
        const base = centroid(group, positions);
        const legacyDesktop = (group.offsets ?? ZERO_DEVICE_POINTS).desktop;
        const legacyMobile = (group.offsets ?? ZERO_DEVICE_POINTS).mobile;
        const currentBase = base ?? defaultGroupPoint(index, compact);
        const currentOffset = compact ? legacyMobile : legacyDesktop;
        const frozenCurrent = protectCenter({ x: currentBase.x + currentOffset.x, y: currentBase.y + currentOffset.y }, compact, currentBase);
        const other = defaultGroupPoint(index, !compact);
        const positionsByDevice: DevicePoints = compact ? { desktop: other, mobile: frozenCurrent } : { desktop: frozenCurrent, mobile: other };
        return { ...group, positions: positionsByDevice, memberOffsets: group.memberOffsets ?? group.offsets ?? cloneDevicePoints(ZERO_DEVICE_POINTS), offsets: undefined };
      });
      return changed ? next : current;
    });
  }, [hydrated, scope, positions, compact]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const current = groups.filter((group) => group.scope === scope);
    const owner = new Map<string, UserGroup>();
    current.forEach((group) => group.members.forEach((id) => owner.set(id, group)));
    const nodes = Array.from(root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]'));
    const paths = Array.from(root.querySelectorAll<SVGPathElement>('svg.edges path.spoke:not(.slotSpoke):not(.clusterSpoke)'));
    nodes.forEach((node, index) => {
      node.classList.remove('v42GroupedMember', 'v42CollapsedMember', 'v42SelectedMember', 'v42LockedMember', 'v42OtherGroupMember');
      node.style.removeProperty('--v42-group-dx'); node.style.removeProperty('--v42-group-dy');
      paths[index]?.classList.remove('v42GroupMemberPath');
    });
    nodes.forEach((node, index) => {
      const id = node.dataset.nodeId;
      if (!id) return;
      const group = owner.get(id);
      if (group) {
        const offset = memberOffsetFor(group);
        node.classList.add('v42GroupedMember');
        node.style.setProperty('--v42-group-dx', `${offset.x}px`); node.style.setProperty('--v42-group-dy', `${offset.y}px`);
        paths[index]?.classList.add('v42GroupMemberPath');
        if (group.collapsed && managingGroupId !== group.id) node.classList.add('v42CollapsedMember');
      }
      if (creating) {
        if (group) node.classList.add('v42LockedMember');
        if (selectedIds.includes(id)) node.classList.add('v42SelectedMember');
      }
      if (managingGroupId) {
        if (group && group.id !== managingGroupId) node.classList.add('v42OtherGroupMember');
        if (selectedIds.includes(id)) node.classList.add('v42SelectedMember');
      }
    });
  }, [groups, scope, compact, creating, managingGroupId, selectedIds, positions]);

  const showNotice = (message: string, undo: UserGroup[] | null = null) => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    setNotice({ message, undo });
    noticeTimerRef.current = window.setTimeout(() => { setNotice(null); noticeTimerRef.current = null; }, undo ? 4200 : 1700);
  };
  const undoLast = () => {
    if (!notice?.undo) return;
    setGroups(cloneGroups(notice.undo)); setNotice(null);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = null;
  };
  const groupAtPoint = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return null;
    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-v42-group-drop]'));
    for (const target of targets) {
      const rect = target.getBoundingClientRect(); const pad = target.classList.contains('v42GroupHub') ? 10 : 3;
      if (clientX >= rect.left - pad && clientX <= rect.right + pad && clientY >= rect.top - pad && clientY <= rect.bottom + pad) return target.dataset.groupId ?? null;
    }
    return null;
  };
  const removeZoneAtPoint = (clientX: number, clientY: number) => {
    const zone = rootRef.current?.querySelector<HTMLElement>('.v42RemoveZone');
    if (!zone) return false;
    const rect = zone.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  };
  const ownerOf = (nodeId: string) => groupsRef.current.find((group) => group.scope === scopeRef.current && group.members.includes(nodeId)) ?? null;
  const moveNodeToGroup = (nodeId: string, targetGroupId: string) => {
    const target = groupsRef.current.find((group) => group.id === targetGroupId && group.scope === scopeRef.current);
    if (!target) return;
    const previousOwner = ownerOf(nodeId);
    if (previousOwner?.id === targetGroupId) { showNotice(`Already in ${target.name}`); return; }
    const before = cloneGroups(groupsRef.current);
    const next = groupsRef.current.map((group) => {
      if (group.scope !== scopeRef.current) return group;
      const without = group.members.filter((id) => id !== nodeId);
      if (group.id === targetGroupId) return { ...group, members: [...without, nodeId] };
      return without.length === group.members.length ? group : { ...group, members: without };
    });
    setGroups(next); showNotice(previousOwner ? `Moved to ${target.name}` : `Added to ${target.name}`, before);
  };
  const removeNodeFromGroup = (nodeId: string) => {
    const owner = ownerOf(nodeId);
    if (!owner) return;
    const before = cloneGroups(groupsRef.current);
    setGroups((current) => current.map((group) => group.id === owner.id ? { ...group, members: group.members.filter((id) => id !== nodeId) } : group));
    showNotice(`Removed from ${owner.name}`, before);
  };
  const nudgeCanvasNearEdge = (clientX: number, clientY: number) => {
    const stage = rootRef.current?.querySelector<HTMLElement>('.stage');
    if (!stage || stage.classList.contains('editMode')) return;
    const rect = stage.getBoundingClientRect(); const edge = 42;
    let dx = 0; let dy = 0;
    if (clientX < rect.left + edge) dx = 9; else if (clientX > rect.right - edge) dx = -9;
    if (clientY < rect.top + edge) dy = 9; else if (clientY > rect.bottom - edge) dy = -9;
    if (!dx && !dy) return;
    const pointerId = syntheticPanIdRef.current; const startX = rect.left + rect.width / 2; const startY = rect.top + rect.height / 2;
    try {
      stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId, pointerType: 'mouse', button: 0, clientX: startX, clientY: startY }));
      stage.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId, pointerType: 'mouse', buttons: 1, clientX: startX + dx, clientY: startY + dy }));
      stage.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId, pointerType: 'mouse', button: 0, clientX: startX + dx, clientY: startY + dy }));
    } catch { /* optional QA assist */ }
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target instanceof Element ? event.target.closest('button.personNode[data-node-id]') as HTMLButtonElement | null : null;
      if (!node || !root.contains(node)) return;
      const id = node.dataset.nodeId; if (!id) return;
      if (creatingRef.current || managingGroupIdRef.current) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        if (creatingRef.current && ownerOf(id)) return;
        setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
        return;
      }
      nodeDropDragRef.current = { nodeId: id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, groupedAtStart: Boolean(ownerOf(id)) };
    };
    const onPointerMove = (event: PointerEvent) => {
      const drag = nodeDropDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId || creatingRef.current || managingGroupIdRef.current) return;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (!drag.moved && distance < 10) return;
      if (!drag.moved) { drag.moved = true; setDraggingNodeId(drag.nodeId); }
      nudgeCanvasNearEdge(event.clientX, event.clientY);
      const overRemove = drag.groupedAtStart && removeZoneAtPoint(event.clientX, event.clientY);
      setRemoveHover(overRemove);
      const nextGroup = overRemove ? null : groupAtPoint(event.clientX, event.clientY);
      if (dropHoverRef.current !== nextGroup) setDropHoverGroupId(nextGroup);
    };
    const finishNodeDrag = (event: PointerEvent) => {
      const drag = nodeDropDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const overRemove = drag.moved && drag.groupedAtStart && removeZoneAtPoint(event.clientX, event.clientY);
      const targetGroup = drag.moved && !overRemove ? groupAtPoint(event.clientX, event.clientY) : null;
      nodeDropDragRef.current = null; setDraggingNodeId(null); setDropHoverGroupId(null); setRemoveHover(false);
      if (overRemove) removeNodeFromGroup(drag.nodeId); else if (targetGroup) moveNodeToGroup(drag.nodeId, targetGroup);
    };
    const swallowClick = (event: MouseEvent) => {
      if (!creatingRef.current && !managingGroupIdRef.current) return;
      const node = event.target instanceof Element ? event.target.closest('button.personNode[data-node-id]') : null;
      if (!node || !root.contains(node)) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    };
    const revealSearchHit = (event: MouseEvent) => {
      const result = event.target instanceof Element ? event.target.closest('.searchResults button') as HTMLButtonElement | null : null;
      if (!result || !root.contains(result)) return;
      const label = result.querySelector<HTMLElement>('b')?.textContent?.trim(); if (!label) return;
      const node = Array.from(root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]')).find((candidate) => candidate.querySelector<HTMLElement>('b')?.textContent?.trim() === label);
      const id = node?.dataset.nodeId; if (!id) return;
      setGroups((current) => current.map((group) => group.scope === scopeRef.current && group.members.includes(id) ? { ...group, collapsed: false } : group));
    };
    root.addEventListener('pointerdown', onPointerDown, true); root.addEventListener('pointermove', onPointerMove, true);
    root.addEventListener('pointerup', finishNodeDrag, true); root.addEventListener('pointercancel', finishNodeDrag, true);
    root.addEventListener('click', swallowClick, true); root.addEventListener('click', revealSearchHit, true);
    return () => {
      root.removeEventListener('pointerdown', onPointerDown, true); root.removeEventListener('pointermove', onPointerMove, true);
      root.removeEventListener('pointerup', finishNodeDrag, true); root.removeEventListener('pointercancel', finishNodeDrag, true);
      root.removeEventListener('click', swallowClick, true); root.removeEventListener('click', revealSearchHit, true);
    };
  }, []);

  const closeEditor = () => { setCreating(false); setManagingGroupId(null); setSelectedIds([]); setGroupName(''); };
  const openGroups = () => { setPanelOpen((value) => { if (value) closeEditor(); return !value; }); };
  const beginCreate = () => { if (autoClustered) return; setManagingGroupId(null); setCreating(true); setSelectedIds([]); setGroupName(''); };
  const createGroup = () => {
    const name = groupName.trim(); if (!name || !scope) return;
    const members = selectedIds.filter((id) => !memberOwner.has(id) && positions[id]);
    const index = currentGroups.length;
    const selectedBase = members.length ? centroid({ id: '', scope, name, members, collapsed: true }, positions) : null;
    const desktopPosition = compact ? defaultGroupPoint(index, false) : protectCenter(selectedBase ?? defaultGroupPoint(index, false), false, selectedBase ?? { x: 0, y: -1 });
    const mobilePosition = compact ? protectCenter(selectedBase ?? defaultGroupPoint(index, true), true, selectedBase ?? { x: 0, y: -1 }) : defaultGroupPoint(index, true);
    const group: UserGroup = {
      id: `user-group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, scope, name: name.slice(0, 24), members, collapsed: true,
      positions: { desktop: desktopPosition, mobile: mobilePosition }, memberOffsets: cloneDevicePoints(ZERO_DEVICE_POINTS),
    };
    setGroups((current) => [...current, group]); closeEditor();
    showNotice(`${group.name} created${members.length ? ` · ${members.length} people` : ' · empty'}`);
  };
  const beginManage = (group: UserGroup) => {
    if (autoClustered) return; setCreating(false); setManagingGroupId(group.id); setSelectedIds([...group.members]); setGroupName(group.name);
  };
  const saveManage = () => {
    if (!managingGroupId) return;
    const name = groupName.trim(); if (!name) return;
    const selected = selectedIds.filter((id) => positions[id]); const before = cloneGroups(groupsRef.current);
    setGroups((current) => current.map((group) => {
      if (group.scope !== scope) return group;
      if (group.id === managingGroupId) return { ...group, name: name.slice(0, 24), members: selected };
      const cleaned = group.members.filter((id) => !selected.includes(id));
      return cleaned.length === group.members.length ? group : { ...group, members: cleaned };
    }));
    closeEditor(); showNotice('Group updated', before);
  };
  const toggleGroup = (id: string) => { setGroups((current) => current.map((group) => group.id === id ? { ...group, collapsed: !group.collapsed } : group)); };
  const deleteGroup = (id: string) => {
    const group = groupsRef.current.find((item) => item.id === id); if (!group) return;
    const before = cloneGroups(groupsRef.current); setGroups((current) => current.filter((item) => item.id !== id));
    if (managingGroupId === id) closeEditor(); showNotice(`${group.name} removed · people kept`, before);
  };
  const setGroupMove = (group: UserGroup, position: Point, memberOffset: Point) => {
    const fallbackPosition: DevicePoints = { desktop: groupPositionFor(group, false), mobile: groupPositionFor(group, true) };
    const fallbackOffset: DevicePoints = group.memberOffsets ?? group.offsets ?? ZERO_DEVICE_POINTS;
    setGroups((current) => current.map((item) => item.id === group.id ? {
      ...item,
      positions: setDevicePoint(item.positions, compact, position, fallbackPosition),
      memberOffsets: setDevicePoint(item.memberOffsets ?? item.offsets, compact, memberOffset, fallbackOffset),
      offsets: undefined,
    } : item));
  };
  const onGroupPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, group: UserGroup) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (creating || managingGroupId) return;
    event.preventDefault(); event.stopPropagation();
    groupDragRef.current = {
      groupId: group.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      startPosition: groupPositionFor(group), startMemberOffset: memberOffsetFor(group), moved: false, target: event.currentTarget,
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* no-op */ }
  };
  const onGroupPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = groupDragRef.current; if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const dx = event.clientX - drag.startX; const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    const zoom = rootRef.current ? readZoom(rootRef.current) : 1;
    const desired = protectCenter({ x: drag.startPosition.x + dx / zoom, y: drag.startPosition.y + dy / zoom }, compact, drag.startPosition);
    const actualDelta = { x: desired.x - drag.startPosition.x, y: desired.y - drag.startPosition.y };
    const group = groupsRef.current.find((item) => item.id === drag.groupId); if (!group) return;
    setGroupMove(group, desired, { x: drag.startMemberOffset.x + actualDelta.x, y: drag.startMemberOffset.y + actualDelta.y });
  };
  const finishGroupPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = groupDragRef.current; if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    try { drag.target.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
    groupDragRef.current = null; if (!drag.moved) toggleGroup(drag.groupId);
  };
  const cancelGroupPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = groupDragRef.current; if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    try { drag.target.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
    groupDragRef.current = null;
  };

  const editorActive = creating || Boolean(managingGroupId);
  const draggingGroupedNode = draggingNodeId ? Boolean(ownerOf(draggingNodeId)) : false;

  return (
    <div ref={rootRef} className={`v42ManualGroupsRoot ${creating ? 'v42Creating' : ''} ${managingGroupId ? 'v42Managing' : ''}`}>
      <QaNetworkRadialPlaygroundV39 />
      {hosts.nav ? createPortal(
        <button type="button" className={`v42GroupToolbarButton ${panelOpen ? 'active' : ''}`} onClick={openGroups}>▦ Groups</button>,
        hosts.nav,
      ) : null}
      {hosts.stage && panelOpen ? createPortal(
        <aside className="v42GroupPanel" onPointerDown={(event) => event.stopPropagation()} onPointerMove={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} onTouchStart={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
          {!editorActive ? <>
            <div className="v42PanelHead"><div><b>My groups</b><small>{currentGroups.length} saved here</small></div><button type="button" onClick={() => setPanelOpen(false)}>×</button></div>
            <button type="button" className="v42CreateButton" onClick={beginCreate} disabled={autoClustered}>＋ Create group</button>
            {autoClustered ? <p className="v42PanelNote">Zoom in first to choose individual people.</p> : null}
            <div className="v42GroupList">
              {currentGroups.map((group) => <div key={group.id} data-group-id={group.id} data-v42-group-drop="true" className={`v42GroupRow ${dropHoverGroupId === group.id ? 'dropTarget' : ''}`}>
                <button type="button" className="v42GroupRowMain" onClick={() => toggleGroup(group.id)}><b>{group.name}</b><small>{group.members.length} people · {dropHoverGroupId === group.id ? 'release to add' : group.members.length === 0 ? 'empty · ready for drop' : group.collapsed ? 'collapsed' : 'expanded'}</small></button>
                <button type="button" className="v42ManageGroup" onClick={() => beginManage(group)}>Edit</button>
                <button type="button" className="v42DeleteGroup" onClick={() => deleteGroup(group.id)} aria-label={`Delete ${group.name}`}>×</button>
              </div>)}
              {!currentGroups.length ? <span className="v42EmptyGroups">No groups yet. You can create an empty group first.</span> : null}
            </div>
            <p className="v42PanelNote">Drag a person onto a group row here or onto its group box on the canvas.</p>
          </> : creating ? <>
            <div className="v42PanelHead"><div><b>Create group</b><small>People are optional</small></div><button type="button" onClick={closeEditor}>×</button></div>
            <div className="v42SelectionCount"><b>{selectedIds.length}</b><span>selected · optional</span></div>
            <input value={groupName} maxLength={24} onChange={(event) => setGroupName(event.target.value)} placeholder="Group name · Family, Korea, Work…" />
            <div className="v42CreateActions"><button type="button" onClick={closeEditor}>Cancel</button><button type="button" className="primary" onClick={createGroup} disabled={!groupName.trim()}>Create</button></div>
            <p className="v42PanelNote">You can create it with 0 people and add them later by drag & drop or Edit.</p>
          </> : <>
            <div className="v42PanelHead"><div><b>Edit {managingGroup?.name ?? 'group'}</b><small>Tap people to add or remove</small></div><button type="button" onClick={closeEditor}>×</button></div>
            <div className="v42SelectionCount"><b>{selectedIds.length}</b><span>people after save · 0 is allowed</span></div>
            <input value={groupName} maxLength={24} onChange={(event) => setGroupName(event.target.value)} placeholder="Group name" />
            <div className="v42CreateActions"><button type="button" onClick={closeEditor}>Cancel</button><button type="button" className="primary" onClick={saveManage} disabled={!groupName.trim()}>Save changes</button></div>
            <p className="v42PanelNote">Selecting someone from another group moves them here. Empty groups stay saved.</p>
          </>}
        </aside>, hosts.stage,
      ) : null}
      {hosts.stage && draggingGroupedNode ? createPortal(
        <div className={`v42RemoveZone ${removeHover ? 'active' : ''}`}><b>Remove from group</b><small>{removeHover ? 'Release here' : 'Drag here to ungroup only'}</small></div>, hosts.stage,
      ) : null}
      {hosts.stage && notice ? createPortal(
        <div className="v42Notice"><span>✦ {notice.message}</span>{notice.undo ? <button type="button" onClick={undoLast}>Undo</button> : null}</div>, hosts.stage,
      ) : null}
      {hosts.scene && !autoClustered ? createPortal(<>
        <svg className="v42GroupEdges" viewBox="-2200 -2200 4400 4400" aria-hidden="true">
          {groupLayouts.map(({ group, hub }) => <path key={group.id} d={curvePath(hub)} className={group.collapsed ? 'collapsed' : 'expanded'} />)}
        </svg>
        <div className="v42GroupLayer">
          {groupLayouts.map(({ group, hub }) => <button key={group.id} type="button" data-group-id={group.id} data-v42-group-drop="true" className={`v42GroupHub ${group.collapsed ? 'collapsed' : 'expanded'} ${dropHoverGroupId === group.id ? 'dropTarget' : ''} ${managingGroupId === group.id ? 'managing' : ''}`} style={{ '--gx': `${hub.x}px`, '--gy': `${hub.y}px` } as CSSProperties} onPointerDown={(event) => onGroupPointerDown(event, group)} onPointerMove={onGroupPointerMove} onPointerUp={finishGroupPointer} onPointerCancel={cancelGroupPointer} onContextMenu={(event) => event.preventDefault()}>
            <span>▦</span><b>{group.name}</b><small>{dropHoverGroupId === group.id ? 'release to add' : group.members.length === 0 ? '0 people · ready' : `${group.members.length} people · ${group.collapsed ? 'tap to open' : 'tap to close'}`}</small>
          </button>)}
        </div>
      </>, hosts.scene) : null}
      <style jsx global>{`
        .v42ManualGroupsRoot .personNode.v42GroupedMember{transform:translate(calc(var(--x) + var(--v42-group-dx,0px) - 50%),calc(var(--y) + var(--v42-group-dy,0px) - 50%))!important}
        .v42ManualGroupsRoot .personNode.v42CollapsedMember{opacity:0!important;pointer-events:none!important}
        .v42ManualGroupsRoot .spoke.v42GroupMemberPath{opacity:0!important}
        .v42ManualGroupsRoot.v42Creating .personNode.v42LockedMember:not(.v42SelectedMember){opacity:.22!important;pointer-events:none!important}
        .v42ManualGroupsRoot.v42Creating .personNode:not(.v42LockedMember),.v42ManualGroupsRoot.v42Managing .personNode{cursor:pointer!important}
        .v42ManualGroupsRoot.v42Managing .personNode.v42OtherGroupMember:not(.v42SelectedMember){opacity:.48!important}
        .v42ManualGroupsRoot .personNode.v42SelectedMember .nodeCircle{transform:scale(1.12)!important;border-color:rgba(244,183,40,.98)!important;box-shadow:0 0 0 4px rgba(244,183,40,.12),0 0 30px rgba(244,183,40,.18)!important}
        .v42ManualGroupsRoot .personNode.v42SelectedMember b{color:#f0c755!important}
        .v42GroupToolbarButton{height:28px!important;padding:0 9px!important;border:1px solid rgba(255,255,255,.07)!important;border-radius:8px!important;background:#0e0e0c!important;color:#918a7e!important;font-size:.48rem!important;font-weight:400!important;line-height:1!important}
        .v42GroupToolbarButton.active{border-color:rgba(244,183,40,.36)!important;background:rgba(244,183,40,.09)!important;color:#ddb958!important}
        .v42GroupEdges{position:absolute;left:50%;top:50%;width:4400px;height:4400px;transform:translate(-50%,-50%);overflow:visible;pointer-events:none;z-index:4}
        .v42GroupEdges path{fill:none;stroke:rgba(244,183,40,.26);stroke-width:1.05;stroke-linecap:round;stroke-dasharray:4 8;opacity:.7}.v42GroupEdges path.expanded{opacity:.18}
        .v42GroupLayer{position:absolute;inset:0;pointer-events:none;z-index:9}
        .v42GroupHub{--gx:0px;--gy:0px;position:absolute;left:50%;top:50%;transform:translate(calc(var(--gx) - 50%),calc(var(--gy) - 50%));min-width:108px;max-width:160px;padding:8px 10px;border:1px solid rgba(244,183,40,.54);border-radius:14px;background:rgba(18,16,10,.96);color:#d8b450;display:grid;grid-template-columns:20px 1fr;column-gap:5px;row-gap:1px;align-items:center;text-align:left;box-shadow:0 8px 28px rgba(0,0,0,.26),0 0 24px rgba(244,183,40,.045);pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;cursor:grab;transition:border-color 140ms ease,box-shadow 140ms ease,background 140ms ease}
        .v42GroupHub:active{cursor:grabbing}.v42GroupHub>span{grid-row:1/3;font-size:.8rem}.v42GroupHub>b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.48rem}.v42GroupHub>small{white-space:nowrap;font-size:.34rem;color:#756b55}.v42GroupHub.expanded{border-style:dashed;background:rgba(13,12,9,.9);opacity:.9}
        .v42GroupHub.dropTarget,.v42GroupRow.dropTarget{border-color:rgba(255,207,71,1)!important;background:rgba(42,33,10,.98)!important;box-shadow:0 0 0 4px rgba(244,183,40,.12),0 0 32px rgba(244,183,40,.18)!important}
        .v42GroupHub.dropTarget small,.v42GroupRow.dropTarget small{color:#e4bb50!important}.v42GroupRow.dropTarget .v42GroupRowMain{border-color:rgba(255,207,71,.55)!important;background:rgba(42,33,10,.92)!important}.v42GroupHub.managing{border-color:rgba(244,183,40,.92)}
        .v42GroupPanel{position:absolute;z-index:70;top:10px;left:10px;width:min(310px,calc(100% - 20px));box-sizing:border-box;padding:11px;border:1px solid rgba(244,183,40,.22);border-radius:14px;background:rgba(12,12,10,.97);box-shadow:0 18px 48px rgba(0,0,0,.38);color:#d7d0c3}
        .v42PanelHead{display:flex;align-items:center;justify-content:space-between;gap:8px}.v42PanelHead>div{display:grid;gap:2px}.v42PanelHead b{font-size:.54rem;color:#d6b65b}.v42PanelHead small{font-size:.38rem;color:#746d62}.v42PanelHead>button,.v42DeleteGroup{width:28px;height:28px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:#11110e;color:#948b7e}
        .v42CreateButton{width:100%;height:34px;margin-top:10px;border:1px solid rgba(244,183,40,.24);border-radius:9px;background:rgba(244,183,40,.07);color:#d1ae4e;font-size:.46rem}.v42CreateButton:disabled{opacity:.35}
        .v42GroupList{display:grid;gap:6px;margin-top:8px;max-height:250px;overflow:auto}.v42GroupRow{display:grid;grid-template-columns:1fr auto 30px;gap:5px;align-items:center;padding:2px;border:1px solid transparent;border-radius:11px;transition:border-color 140ms ease,box-shadow 140ms ease,background 140ms ease}.v42GroupRowMain{min-width:0;min-height:38px;padding:6px 8px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:#0e0e0c;color:#a99f8d;text-align:left;display:grid;gap:2px}.v42GroupRowMain b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.46rem;color:#c9a94f}.v42GroupRowMain small{font-size:.36rem;color:#6f675b}.v42ManageGroup{height:30px;padding:0 8px;border:1px solid rgba(244,183,40,.18);border-radius:8px;background:rgba(244,183,40,.055);color:#b99a49;font-size:.37rem}
        .v42EmptyGroups{padding:10px 3px;color:#6e675c;font-size:.39rem;line-height:1.5}.v42PanelNote{margin:7px 1px 0;color:#70685c;font-size:.37rem;line-height:1.45}.v42SelectionCount{display:flex;align-items:baseline;gap:6px;margin-top:10px}.v42SelectionCount b{font-size:1rem;color:#e2ba4f}.v42SelectionCount span{font-size:.39rem;color:#81786a}
        .v42GroupPanel input{width:100%;height:36px;box-sizing:border-box;margin-top:8px;padding:0 9px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#090907;color:#ded7ca;outline:none;font-size:.46rem}.v42GroupPanel input:focus{border-color:rgba(244,183,40,.42)}.v42CreateActions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px}.v42CreateActions button{height:34px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#11110e;color:#91887b;font-size:.44rem}.v42CreateActions button.primary{border-color:rgba(244,183,40,.28);background:rgba(244,183,40,.08);color:#d5b354}.v42CreateActions button:disabled{opacity:.34}
        .v42RemoveZone{position:absolute;z-index:76;left:50%;bottom:42px;transform:translateX(-50%);min-width:210px;padding:10px 18px;border:1px dashed rgba(210,107,75,.55);border-radius:14px;background:rgba(29,14,11,.92);display:grid;justify-items:center;gap:2px;color:#bd806f;pointer-events:none;transition:border-color 120ms ease,background 120ms ease,box-shadow 120ms ease,transform 120ms ease}.v42RemoveZone b{font-size:.46rem}.v42RemoveZone small{font-size:.34rem;color:#8f675d}.v42RemoveZone.active{border-style:solid;border-color:rgba(242,126,91,.95);background:rgba(51,20,14,.97);box-shadow:0 0 0 5px rgba(242,126,91,.08),0 0 30px rgba(242,126,91,.1);transform:translateX(-50%) scale(1.04);color:#e69a84}
        .v42Notice{position:absolute;z-index:80;left:50%;top:12px;transform:translateX(-50%);padding:6px 7px 6px 10px;border:1px solid rgba(244,183,40,.24);border-radius:999px;background:rgba(18,16,9,.97);color:#d7b34e;font-size:.43rem;display:flex;align-items:center;gap:8px;white-space:nowrap}.v42Notice button{height:25px;padding:0 9px;border:1px solid rgba(244,183,40,.24);border-radius:999px;background:rgba(244,183,40,.08);color:#e0ba55;font-size:.38rem}
        @media(max-width:640px){.v42GroupToolbarButton{font-size:.45rem!important;padding:0 8px!important}.v42GroupPanel{top:9px;left:9px;width:calc(100% - 18px)}.v42GroupPanel input{font-size:16px}.v42GroupHub{min-width:98px;max-width:142px;padding:7px 8px}.v42GroupHub>b{font-size:.45rem}.v42GroupHub>small{font-size:.32rem}.v42RemoveZone{bottom:38px;min-width:190px}.v42Notice{max-width:calc(100% - 20px);overflow:hidden}}
        @media(prefers-reduced-motion:reduce){.v42GroupHub,.v42GroupEdges path,.v42GroupRow,.v42RemoveZone{transition:none!important}}
      `}</style>
    </div>
  );
}
