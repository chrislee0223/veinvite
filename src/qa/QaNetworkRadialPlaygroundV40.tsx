'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

import { QaNetworkRadialPlaygroundV39 } from './QaNetworkRadialPlaygroundV39';

type Point = { x: number; y: number };
type DeviceOffsets = { desktop: Point; mobile: Point };
type UserGroup = {
  id: string;
  scope: string;
  name: string;
  members: string[];
  collapsed: boolean;
  offsets: DeviceOffsets;
};
type Hosts = { nav: HTMLElement | null; stage: HTMLElement | null; scene: HTMLElement | null };
type GroupDrag = {
  groupId: string;
  pointerId: number;
  startX: number;
  startY: number;
  startHub: Point;
  base: Point;
  moved: boolean;
  target: HTMLButtonElement;
} | null;

const STORAGE_KEY = 'veinvite:qa:radial-v40:groups-v1';
const EMPTY_HOSTS: Hosts = { nav: null, stage: null, scene: null };

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function curvePath(point: Point) {
  const bend = Math.sign(point.x || 1) * Math.min(64, Math.abs(point.x) * .17);
  return `M 0 0 C ${bend} ${point.y * .22}, ${point.x - bend} ${point.y * .78}, ${point.x} ${point.y}`;
}

function scenarioId(root: HTMLElement) {
  const label = root.querySelector<HTMLElement>('.scenarioBar button.active b')?.textContent?.trim() ?? '';
  const map: Record<string, string> = {
    '0명': 'zero',
    '1명': 'one',
    '5명': 'five',
    '30명': 'balanced30',
    '직접 50': 'direct50',
    '100명': 'hundred',
    '500명': 'fiveHundred',
  };
  return map[label] ?? (label || 'unknown');
}

function scopeKey(root: HTMLElement) {
  const crumbs = Array.from(root.querySelectorAll<HTMLButtonElement>('.crumbs button'))
    .map((button) => button.textContent?.trim() ?? '')
    .filter(Boolean);
  return `${scenarioId(root)}|${crumbs.join('>') || 'YOU'}`;
}

function readZoom(root: HTMLElement) {
  const text = root.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
  const parsed = Number.parseFloat(text.replace('%', ''));
  return Number.isFinite(parsed) ? Math.max(.01, parsed / 100) : 1;
}

function pointsEqual(a: Record<string, Point>, b: Record<string, Point>) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => {
    const left = a[key];
    const right = b[key];
    return Boolean(right) && Math.abs(left.x - right.x) < .25 && Math.abs(left.y - right.y) < .25;
  });
}

function centroid(group: UserGroup, positions: Record<string, Point>) {
  const points = group.members.map((id) => positions[id]).filter((point): point is Point => Boolean(point));
  if (!points.length) return { x: 0, y: -240 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function protectCenter(point: Point, compact: boolean, fallback: Point) {
  const minimum = compact ? 176 : 238;
  const radius = Math.hypot(point.x, point.y);
  if (radius >= minimum) return point;
  const fallbackAngle = Math.atan2(fallback.y || -1, fallback.x || .001);
  const angle = radius > 4 ? Math.atan2(point.y, point.x) : fallbackAngle;
  return { x: Math.cos(angle) * minimum, y: Math.sin(angle) * minimum };
}

export function QaNetworkRadialPlaygroundV40() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const observerFrameRef = useRef<number | null>(null);
  const dragRef = useRef<GroupDrag>(null);
  const groupsRef = useRef<UserGroup[]>([]);
  const scopeRef = useRef('');
  const creatingRef = useRef(false);

  const [hosts, setHosts] = useState<Hosts>(EMPTY_HOSTS);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [scope, setScope] = useState('');
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [compact, setCompact] = useState(false);
  const [autoClustered, setAutoClustered] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');

  groupsRef.current = groups;
  scopeRef.current = scope;
  creatingRef.current = creating;

  const currentGroups = useMemo(() => groups.filter((group) => group.scope === scope), [groups, scope]);
  const memberOwner = useMemo(() => {
    const map = new Map<string, string>();
    currentGroups.forEach((group) => group.members.forEach((id) => map.set(id, group.id)));
    return map;
  }, [currentGroups]);

  const offsetFor = (group: UserGroup) => compact ? group.offsets.mobile : group.offsets.desktop;
  const baseFor = (group: UserGroup) => centroid(group, positions);
  const hubFor = (group: UserGroup) => {
    const base = baseFor(group);
    const offset = offsetFor(group);
    const raw = { x: base.x + offset.x, y: base.y + offset.y };
    const first = positions[group.members[0]] ?? base;
    return protectCenter(raw, compact, first);
  };

  const groupLayouts = useMemo(() => currentGroups.map((group) => ({ group, hub: hubFor(group) })), [currentGroups, positions, compact]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as UserGroup[];
        if (Array.isArray(parsed)) setGroups(parsed);
      }
    } catch {
      setGroups([]);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(groups)); } catch { /* QA only */ }
  }, [groups, hydrated]);

  useEffect(() => {
    setCreating(false);
    setSelectedIds([]);
    setGroupName('');
  }, [scope]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const syncDom = () => {
      observerFrameRef.current = null;
      const nav = root.querySelector<HTMLElement>('.navActions');
      const stage = root.querySelector<HTMLElement>('.stage');
      const scene = root.querySelector<HTMLElement>('.scene');
      setHosts((current) => current.nav === nav && current.stage === stage && current.scene === scene
        ? current
        : { nav, stage, scene });

      const title = root.querySelector<HTMLElement>('.labHeader strong');
      const subtitle = root.querySelector<HTMLElement>('.labHeader > div:first-child span');
      if (title && title.textContent !== 'RADIAL NETWORK PLAYGROUND · V40') title.textContent = 'RADIAL NETWORK PLAYGROUND · V40';
      if (subtitle && subtitle.textContent !== 'Manual groups · collapse / expand · move together · saved layout') {
        subtitle.textContent = 'Manual groups · collapse / expand · move together · saved layout';
      }

      const rules = root.querySelectorAll<HTMLElement>('.rules span');
      if (rules[1] && rules[1].querySelector('b')?.textContent !== 'Manual groups') {
        rules[1].classList.add('v40Rule');
        rules[1].innerHTML = '<b>Manual groups</b>You decide which people belong together.';
      }
      if (rules[3] && rules[3].querySelector('b')?.textContent !== 'Saved groups') {
        rules[3].classList.add('v40Rule');
        rules[3].innerHTML = '<b>Saved groups</b>Names, collapsed state and group position stay saved.';
      }

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
          nextPositions[id] = {
            x: parsePx(node.style.getPropertyValue('--x')),
            y: parsePx(node.style.getPropertyValue('--y')),
          };
        });
        setPositions((current) => pointsEqual(current, nextPositions) ? current : nextPositions);
      }
    };

    const schedule = () => {
      if (observerFrameRef.current !== null) return;
      observerFrameRef.current = window.requestAnimationFrame(syncDom);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    window.addEventListener('resize', schedule);
    syncDom();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      if (observerFrameRef.current !== null) window.cancelAnimationFrame(observerFrameRef.current);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const current = groups.filter((group) => group.scope === scope);
    const owner = new Map<string, UserGroup>();
    current.forEach((group) => group.members.forEach((id) => owner.set(id, group)));

    const nodes = Array.from(root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]'));
    const paths = Array.from(root.querySelectorAll<SVGPathElement>('svg.edges path.spoke:not(.slotSpoke):not(.clusterSpoke)'));

    nodes.forEach((node, index) => {
      node.classList.remove('v40GroupedMember', 'v40CollapsedMember', 'v40SelectedMember', 'v40LockedMember');
      node.style.removeProperty('--v40-group-dx');
      node.style.removeProperty('--v40-group-dy');
      paths[index]?.classList.remove('v40GroupMemberPath');
    });

    nodes.forEach((node, index) => {
      const id = node.dataset.nodeId;
      if (!id) return;
      const group = owner.get(id);
      if (group) {
        const offset = compact ? group.offsets.mobile : group.offsets.desktop;
        node.classList.add('v40GroupedMember');
        node.style.setProperty('--v40-group-dx', `${offset.x}px`);
        node.style.setProperty('--v40-group-dy', `${offset.y}px`);
        paths[index]?.classList.add('v40GroupMemberPath');
        if (group.collapsed) node.classList.add('v40CollapsedMember');
        if (creating) node.classList.add('v40LockedMember');
      }
      if (creating && selectedIds.includes(id)) node.classList.add('v40SelectedMember');
    });
  }, [groups, scope, compact, creating, selectedIds, positions]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!creatingRef.current) return;
      const node = event.target instanceof Element ? event.target.closest('button.personNode[data-node-id]') as HTMLButtonElement | null : null;
      if (!node || !root.contains(node)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const id = node.dataset.nodeId;
      if (!id) return;
      const alreadyGrouped = groupsRef.current.some((group) => group.scope === scopeRef.current && group.members.includes(id));
      if (alreadyGrouped) return;
      setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    };

    const swallowClick = (event: MouseEvent) => {
      if (!creatingRef.current) return;
      const node = event.target instanceof Element ? event.target.closest('button.personNode[data-node-id]') : null;
      if (!node || !root.contains(node)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const revealSearchHit = (event: MouseEvent) => {
      const result = event.target instanceof Element ? event.target.closest('.searchResults button') as HTMLButtonElement | null : null;
      if (!result || !root.contains(result)) return;
      const label = result.querySelector<HTMLElement>('b')?.textContent?.trim();
      if (!label) return;
      const node = Array.from(root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]'))
        .find((candidate) => candidate.querySelector<HTMLElement>('b')?.textContent?.trim() === label);
      const id = node?.dataset.nodeId;
      if (!id) return;
      setGroups((current) => current.map((group) => group.scope === scopeRef.current && group.members.includes(id)
        ? { ...group, collapsed: false }
        : group));
    };

    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('click', swallowClick, true);
    root.addEventListener('click', revealSearchHit, true);
    return () => {
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('click', swallowClick, true);
      root.removeEventListener('click', revealSearchHit, true);
    };
  }, []);

  const closeCreate = () => {
    setCreating(false);
    setSelectedIds([]);
    setGroupName('');
  };

  const openGroups = () => {
    const root = rootRef.current;
    const editButtons: HTMLButtonElement[] = root ? Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions button')) : [];
    const editButton = editButtons.find((button) => button.textContent?.includes('Done'));
    if (editButton) editButton.click();
    setPanelOpen((value) => {
      if (value) closeCreate();
      return !value;
    });
  };

  const beginCreate = () => {
    if (autoClustered) return;
    setCreating(true);
    setSelectedIds([]);
    setGroupName('');
  };

  const createGroup = () => {
    const name = groupName.trim();
    const members = selectedIds.filter((id) => !memberOwner.has(id) && positions[id]);
    if (!name || members.length < 2 || !scope) return;
    const id = `user-group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const group: UserGroup = {
      id,
      scope,
      name: name.slice(0, 24),
      members,
      collapsed: true,
      offsets: { desktop: { x: 0, y: 0 }, mobile: { x: 0, y: 0 } },
    };
    setGroups((current) => [...current, group]);
    closeCreate();
  };

  const toggleGroup = (id: string) => {
    setGroups((current) => current.map((group) => group.id === id ? { ...group, collapsed: !group.collapsed } : group));
  };

  const deleteGroup = (id: string) => {
    setGroups((current) => current.filter((group) => group.id !== id));
  };

  const setGroupOffset = (id: string, point: Point) => {
    setGroups((current) => current.map((group) => {
      if (group.id !== id) return group;
      return compact
        ? { ...group, offsets: { ...group.offsets, mobile: point } }
        : { ...group, offsets: { ...group.offsets, desktop: point } };
    }));
  };

  const onGroupPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, group: UserGroup) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const base = baseFor(group);
    const hub = hubFor(group);
    dragRef.current = {
      groupId: group.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startHub: hub,
      base,
      moved: false,
      target: event.currentTarget,
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* no-op */ }
  };

  const onGroupPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    const root = rootRef.current;
    const zoom = root ? readZoom(root) : 1;
    const desired = {
      x: drag.startHub.x + dx / zoom,
      y: drag.startHub.y + dy / zoom,
    };
    const firstGroup = groupsRef.current.find((group) => group.id === drag.groupId);
    const fallback = firstGroup ? positions[firstGroup.members[0]] ?? drag.base : drag.base;
    const protectedPoint = protectCenter(desired, compact, fallback);
    setGroupOffset(drag.groupId, { x: protectedPoint.x - drag.base.x, y: protectedPoint.y - drag.base.y });
  };

  const finishGroupPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try { drag.target.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
    dragRef.current = null;
    if (!drag.moved) toggleGroup(drag.groupId);
  };

  const cancelGroupPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try { drag.target.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
    dragRef.current = null;
  };

  return (
    <div ref={rootRef} className={`v40ManualGroupsRoot ${creating ? 'v40Creating' : ''}`}>
      <QaNetworkRadialPlaygroundV39 />

      {hosts.nav ? createPortal(
        <button type="button" className={panelOpen ? 'active v40GroupToolbarButton' : 'v40GroupToolbarButton'} onClick={openGroups}>▦ Groups</button>,
        hosts.nav,
      ) : null}

      {hosts.stage && panelOpen ? createPortal(
        <aside
          className="v40GroupPanel"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          {!creating ? <>
            <div className="v40PanelHead"><div><b>My groups</b><small>{currentGroups.length} saved here</small></div><button type="button" onClick={() => setPanelOpen(false)}>×</button></div>
            <button type="button" className="v40CreateButton" onClick={beginCreate} disabled={autoClustered}>＋ Create group</button>
            {autoClustered ? <p className="v40PanelNote">Zoom in first to choose individual people.</p> : null}
            <div className="v40GroupList">
              {currentGroups.map((group) => <div key={group.id} className="v40GroupRow">
                <button type="button" className="v40GroupRowMain" onClick={() => toggleGroup(group.id)}><b>{group.name}</b><small>{group.members.length} people · {group.collapsed ? 'collapsed' : 'expanded'}</small></button>
                <button type="button" className="v40DeleteGroup" onClick={() => deleteGroup(group.id)} aria-label={`Delete ${group.name}`}>×</button>
              </div>)}
              {!currentGroups.length ? <span className="v40EmptyGroups">No groups yet. Your network stays fully open until you make one.</span> : null}
            </div>
          </> : <>
            <div className="v40PanelHead"><div><b>Create group</b><small>Tap people on the canvas</small></div><button type="button" onClick={closeCreate}>×</button></div>
            <div className="v40SelectionCount"><b>{selectedIds.length}</b><span>selected · choose at least 2</span></div>
            <input value={groupName} maxLength={24} onChange={(event) => setGroupName(event.target.value)} placeholder="Group name · Family, Korea, Work…" />
            <div className="v40CreateActions"><button type="button" onClick={closeCreate}>Cancel</button><button type="button" className="primary" onClick={createGroup} disabled={selectedIds.length < 2 || !groupName.trim()}>Create</button></div>
            <p className="v40PanelNote">People already inside another group stay unavailable.</p>
          </>}
        </aside>,
        hosts.stage,
      ) : null}

      {hosts.scene && !autoClustered ? createPortal(<>
        <svg className="v40GroupEdges" viewBox="-2200 -2200 4400 4400" aria-hidden="true">
          {groupLayouts.map(({ group, hub }) => <path key={group.id} d={curvePath(hub)} className={group.collapsed ? 'collapsed' : 'expanded'} />)}
        </svg>
        <div className="v40GroupLayer">
          {groupLayouts.map(({ group, hub }) => <button
            key={group.id}
            type="button"
            className={`v40GroupHub ${group.collapsed ? 'collapsed' : 'expanded'}`}
            style={{ '--gx': `${hub.x}px`, '--gy': `${hub.y}px` } as CSSProperties}
            onPointerDown={(event) => onGroupPointerDown(event, group)}
            onPointerMove={onGroupPointerMove}
            onPointerUp={finishGroupPointer}
            onPointerCancel={cancelGroupPointer}
            onContextMenu={(event) => event.preventDefault()}
          ><span>▦</span><b>{group.name}</b><small>{group.members.length} people · {group.collapsed ? 'tap to open' : 'tap to close'}</small></button>)}
        </div>
      </>, hosts.scene) : null}

      <style jsx global>{`
        .v40ManualGroupsRoot .personNode.v40GroupedMember{transform:translate(calc(var(--x) + var(--v40-group-dx,0px) - 50%),calc(var(--y) + var(--v40-group-dy,0px) - 50%))!important}
        .v40ManualGroupsRoot .personNode.v40CollapsedMember{opacity:0!important;pointer-events:none!important}
        .v40ManualGroupsRoot .spoke.v40GroupMemberPath{opacity:0!important}
        .v40ManualGroupsRoot.v40Creating .personNode.v40LockedMember:not(.v40SelectedMember){opacity:.24!important;pointer-events:none!important}
        .v40ManualGroupsRoot.v40Creating .personNode:not(.v40LockedMember){cursor:pointer!important}
        .v40ManualGroupsRoot .personNode.v40SelectedMember .nodeCircle{transform:scale(1.12)!important;border-color:rgba(244,183,40,.98)!important;box-shadow:0 0 0 4px rgba(244,183,40,.12),0 0 30px rgba(244,183,40,.18)!important}
        .v40ManualGroupsRoot .personNode.v40SelectedMember b{color:#f0c755!important}
        .v40GroupEdges{position:absolute;left:50%;top:50%;width:4400px;height:4400px;transform:translate(-50%,-50%);overflow:visible;pointer-events:none;z-index:4}
        .v40GroupEdges path{fill:none;stroke:rgba(244,183,40,.34);stroke-width:1.15;stroke-linecap:round;stroke-dasharray:5 7}
        .v40GroupEdges path.expanded{opacity:.22}
        .v40GroupLayer{position:absolute;inset:0;pointer-events:none;z-index:9}
        .v40GroupHub{--gx:0px;--gy:0px;position:absolute;left:50%;top:50%;transform:translate(calc(var(--gx) - 50%),calc(var(--gy) - 50%));min-width:104px;max-width:154px;padding:8px 10px;border:1px solid rgba(244,183,40,.54);border-radius:14px;background:rgba(18,16,10,.96);color:#d8b450;display:grid;grid-template-columns:20px 1fr;column-gap:5px;row-gap:1px;align-items:center;text-align:left;box-shadow:0 8px 28px rgba(0,0,0,.26),0 0 24px rgba(244,183,40,.045);pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;cursor:grab}
        .v40GroupHub:active{cursor:grabbing}.v40GroupHub>span{grid-row:1/3;font-size:.8rem}.v40GroupHub>b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.48rem}.v40GroupHub>small{white-space:nowrap;font-size:.34rem;color:#756b55}.v40GroupHub.expanded{border-style:dashed;background:rgba(13,12,9,.9);opacity:.86}
        .v40GroupPanel{position:absolute;z-index:70;top:10px;left:10px;width:min(286px,calc(100% - 20px));box-sizing:border-box;padding:11px;border:1px solid rgba(244,183,40,.22);border-radius:14px;background:rgba(12,12,10,.97);box-shadow:0 18px 48px rgba(0,0,0,.38);color:#d7d0c3}
        .v40PanelHead{display:flex;align-items:center;justify-content:space-between;gap:8px}.v40PanelHead>div{display:grid;gap:2px}.v40PanelHead b{font-size:.54rem;color:#d6b65b}.v40PanelHead small{font-size:.38rem;color:#746d62}.v40PanelHead>button,.v40DeleteGroup{width:28px;height:28px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:#11110e;color:#948b7e}
        .v40CreateButton{width:100%;height:34px;margin-top:10px;border:1px solid rgba(244,183,40,.24);border-radius:9px;background:rgba(244,183,40,.07);color:#d1ae4e;font-size:.46rem}.v40CreateButton:disabled{opacity:.35}.v40GroupList{display:grid;gap:6px;margin-top:8px;max-height:230px;overflow:auto}.v40GroupRow{display:grid;grid-template-columns:1fr 30px;gap:5px;align-items:center}.v40GroupRowMain{min-width:0;min-height:38px;padding:6px 8px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:#0e0e0c;color:#a99f8d;text-align:left;display:grid;gap:2px}.v40GroupRowMain b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.46rem;color:#c9a94f}.v40GroupRowMain small{font-size:.36rem;color:#6f675b}.v40EmptyGroups{padding:10px 3px;color:#6e675c;font-size:.39rem;line-height:1.5}.v40PanelNote{margin:7px 1px 0;color:#70685c;font-size:.37rem;line-height:1.45}
        .v40SelectionCount{display:flex;align-items:baseline;gap:6px;margin-top:10px}.v40SelectionCount b{font-size:1rem;color:#e2ba4f}.v40SelectionCount span{font-size:.39rem;color:#81786a}.v40GroupPanel input{width:100%;height:36px;box-sizing:border-box;margin-top:8px;padding:0 9px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#090907;color:#ded7ca;outline:none;font-size:.46rem}.v40GroupPanel input:focus{border-color:rgba(244,183,40,.42)}.v40CreateActions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px}.v40CreateActions button{height:34px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#11110e;color:#91887b;font-size:.44rem}.v40CreateActions button.primary{border-color:rgba(244,183,40,.28);background:rgba(244,183,40,.08);color:#d5b354}.v40CreateActions button:disabled{opacity:.34}
        @media(max-width:640px){.v40GroupPanel{top:9px;left:9px;width:calc(100% - 18px)}.v40GroupPanel input{font-size:16px}.v40GroupHub{min-width:96px;max-width:138px;padding:7px 8px}.v40GroupHub>b{font-size:.45rem}.v40GroupHub>small{font-size:.32rem}}
        @media(prefers-reduced-motion:reduce){.v40GroupHub,.v40GroupEdges path{transition:none!important}}
      `}</style>
    </div>
  );
}
