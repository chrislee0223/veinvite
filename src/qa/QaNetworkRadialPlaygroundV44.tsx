'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { QaNetworkRadialPlaygroundV43 } from './QaNetworkRadialPlaygroundV43';

type Point = { x: number; y: number };
type DragState = {
  nodeId: string;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  mode: 'new-group' | 'create-editor';
} | null;

type DraftState = {
  kind: 'create' | 'edit';
  name: string;
  selectedIds: string[];
  editGroupName?: string;
  pendingGroupedIds?: string[];
};

type PendingCreate = {
  nodeIds: string[];
  beforeGroupIds: string[];
} | null;

type SelectedPerson = {
  id: string;
  label: string;
  pendingMove: boolean;
};

function inputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function curvePath(point: Point) {
  const bend = Math.sign(point.x || 1) * Math.min(58, Math.abs(point.x) * .16);
  return `M 0 0 C ${bend} ${point.y * .22}, ${point.x - bend} ${point.y * .78}, ${point.x} ${point.y}`;
}

function pointIn(element: HTMLElement | null, clientX: number, clientY: number, pad = 0) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return clientX >= rect.left - pad && clientX <= rect.right + pad && clientY >= rect.top - pad && clientY <= rect.bottom + pad;
}

function buttonText(button: HTMLButtonElement | null) {
  return button?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function selectedPeopleEqual(left: SelectedPerson[], right: SelectedPerson[]) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return Boolean(other) && item.id === other.id && item.label === other.label && item.pendingMove === other.pendingMove;
  });
}

export function QaNetworkRadialPlaygroundV44() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState>(null);
  const draftRef = useRef<DraftState | null>(null);
  const restoringRef = useRef(false);
  const pendingGroupedIdsRef = useRef<string[]>([]);
  const pendingCreateRef = useRef<PendingCreate>(null);
  const pendingCreateTimerRef = useRef<number | null>(null);
  const pendingMoveTimerRef = useRef<number | null>(null);
  const edgeFrameRef = useRef<number | null>(null);
  const suppressOutsideUntilRef = useRef(0);
  const syntheticPointerRef = useRef(99440);
  const forwardSelectionRef = useRef(false);
  const forwardGroupMoveRef = useRef(false);

  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);
  const [panelEditor, setPanelEditor] = useState(false);
  const [createEditor, setCreateEditor] = useState(false);
  const [groupCount, setGroupCount] = useState(0);
  const [clustered, setClustered] = useState(false);
  const [newDropHover, setNewDropHover] = useState(false);
  const [createDropHover, setCreateDropHover] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState<SelectedPerson[]>([]);

  const getPanel = () => rootRef.current?.querySelector<HTMLElement>('.v42GroupPanel') ?? null;
  const getToolbar = () => rootRef.current?.querySelector<HTMLButtonElement>('.v42GroupToolbarButton') ?? null;
  const getNewDrop = () => rootRef.current?.querySelector<HTMLElement>('.v44NewGroupDrop') ?? null;
  const getCreateDrop = () => rootRef.current?.querySelector<HTMLElement>('.v44CreateDropMore') ?? null;
  const personNode = (id: string) => rootRef.current?.querySelector<HTMLButtonElement>(`.personNode[data-node-id="${CSS.escape(id)}"]`) ?? null;
  const selectedNodeIds = () => Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('.personNode.v42SelectedMember[data-node-id]') ?? [])
    .map((node) => node.dataset.nodeId)
    .filter((id): id is string => Boolean(id));

  const syncSelectedPeople = () => {
    const selected = selectedNodeIds();
    const pending = pendingGroupedIdsRef.current.filter((id) => !selected.includes(id));
    const ids = [...selected, ...pending];
    const next = ids.map((id) => {
      const node = personNode(id);
      return {
        id,
        label: node?.querySelector<HTMLElement>('b')?.textContent?.trim() || id,
        pendingMove: pending.includes(id),
      };
    });
    setSelectedPeople((current) => selectedPeopleEqual(current, next) ? current : next);
  };

  const syncPendingCount = () => {
    const root = rootRef.current;
    const panel = getPanel();
    if (!root || !panel || !panel.querySelector('input')) return;
    const heading = panel.querySelector<HTMLElement>('.v42PanelHead b')?.textContent?.trim() ?? '';
    if (!heading.startsWith('Create group')) return;

    const pendingIds = pendingGroupedIdsRef.current.filter((id) => Boolean(personNode(id)));
    if (pendingIds.length !== pendingGroupedIdsRef.current.length) pendingGroupedIdsRef.current = pendingIds;
    const pendingSet = new Set(pendingIds);
    root.querySelectorAll<HTMLElement>('.personNode.v44PendingNewGroupMember').forEach((node) => {
      const id = node.dataset.nodeId;
      if (!id || !pendingSet.has(id)) node.classList.remove('v44PendingNewGroupMember');
    });
    pendingIds.forEach((id) => {
      const node = personNode(id);
      if (node && !node.classList.contains('v44PendingNewGroupMember')) node.classList.add('v44PendingNewGroupMember');
    });

    const selected = selectedNodeIds();
    const extras = pendingIds.filter((id) => !selected.includes(id));
    const count = selected.length + extras.length;
    const countEl = panel.querySelector<HTMLElement>('.v42SelectionCount b');
    const textEl = panel.querySelector<HTMLElement>('.v42SelectionCount span');
    const nextCount = String(count);
    const nextText = extras.length
      ? `selected · ${extras.length} will move here on create`
      : 'selected · tap or drag more people';
    if (countEl && countEl.textContent !== nextCount) countEl.textContent = nextCount;
    if (textEl && textEl.textContent !== nextText) textEl.textContent = nextText;
    syncSelectedPeople();
  };

  const focusCreateInput = () => {
    window.requestAnimationFrame(() => {
      const input = getPanel()?.querySelector<HTMLInputElement>('input');
      if (!input) return;
      try { input.focus({ preventScroll: true }); } catch { input.focus(); }
      syncPendingCount();
    });
  };

  const syntheticToggleNode = (id: string) => {
    const node = personNode(id);
    if (!node) return;
    const rect = node.getBoundingClientRect();
    syntheticPointerRef.current += 1;
    const pointerId = syntheticPointerRef.current;
    forwardSelectionRef.current = true;
    node.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'mouse',
      button: 0,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }));
    if (forwardSelectionRef.current) forwardSelectionRef.current = false;
  };

  const toggleCreateSelection = (id: string) => {
    const node = personNode(id);
    if (!node) return;
    const grouped = node.classList.contains('v42GroupedMember');
    if (grouped) {
      const current = pendingGroupedIdsRef.current;
      pendingGroupedIdsRef.current = current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id];
      syncPendingCount();
      return;
    }

    syntheticToggleNode(id);
    window.requestAnimationFrame(syncPendingCount);
  };

  const beginCreate = (nodeId: string | null = null) => {
    const panel = getPanel();
    const createButton = panel?.querySelector<HTMLButtonElement>('.v42CreateButton');
    if (!panel || !createButton || createButton.disabled) return;

    pendingGroupedIdsRef.current = [];
    const node = nodeId ? personNode(nodeId) : null;
    const grouped = Boolean(node?.classList.contains('v42GroupedMember'));
    if (nodeId && grouped) pendingGroupedIdsRef.current = [nodeId];
    createButton.click();

    window.requestAnimationFrame(() => {
      if (nodeId && !grouped) syntheticToggleNode(nodeId);
      syncPendingCount();
      focusCreateInput();
    });
  };

  const simulateMoveToGroup = (nodeId: string, groupId: string) => {
    const root = rootRef.current;
    const node = personNode(nodeId);
    const row = root?.querySelector<HTMLElement>(`.v42GroupRow[data-group-id="${CSS.escape(groupId)}"]`);
    if (!root || !node || !row) return;

    const nodeRect = node.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const startX = nodeRect.left + nodeRect.width / 2;
    const startY = nodeRect.top + nodeRect.height / 2;
    syntheticPointerRef.current += 1;
    const pointerId = syntheticPointerRef.current;
    forwardGroupMoveRef.current = true;

    node.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', button: 0, clientX: startX, clientY: startY,
    }));
    node.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', buttons: 1, clientX: startX + 18, clientY: startY,
    }));
    node.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', button: 0,
      clientX: rowRect.left + Math.min(60, rowRect.width / 2),
      clientY: rowRect.top + rowRect.height / 2,
    }));
    forwardGroupMoveRef.current = false;
  };

  const clearPendingCreate = () => {
    if (pendingCreateTimerRef.current !== null) {
      window.clearTimeout(pendingCreateTimerRef.current);
      pendingCreateTimerRef.current = null;
    }
    pendingCreateRef.current = null;
  };

  const movePendingNodes = (ids: string[], groupId: string, index = 0) => {
    if (index >= ids.length || !rootRef.current?.isConnected) {
      pendingMoveTimerRef.current = null;
      return;
    }
    simulateMoveToGroup(ids[index], groupId);
    pendingMoveTimerRef.current = window.setTimeout(() => {
      pendingMoveTimerRef.current = null;
      movePendingNodes(ids, groupId, index + 1);
    }, 90);
  };

  const finishPendingCreate = (attempt = 0) => {
    const pending = pendingCreateRef.current;
    if (!pending) return;
    const panel = getPanel();
    if (!panel || panel.querySelector('input')) {
      if (attempt >= 25 || !rootRef.current?.isConnected) {
        clearPendingCreate();
        pendingGroupedIdsRef.current = [];
        return;
      }
      pendingCreateTimerRef.current = window.setTimeout(() => {
        pendingCreateTimerRef.current = null;
        finishPendingCreate(attempt + 1);
      }, 40);
      return;
    }

    const rows = Array.from(panel.querySelectorAll<HTMLElement>('.v42GroupRow[data-group-id]'));
    const created = rows.find((row) => {
      const id = row.dataset.groupId;
      return Boolean(id && !pending.beforeGroupIds.includes(id));
    });
    const newId = created?.dataset.groupId;
    const pendingIds = [...pending.nodeIds];
    clearPendingCreate();
    pendingGroupedIdsRef.current = [];
    rootRef.current?.querySelectorAll('.personNode.v44PendingNewGroupMember').forEach((node) => node.classList.remove('v44PendingNewGroupMember'));
    setSelectedPeople([]);

    if (newId && pendingIds.length) {
      if (pendingMoveTimerRef.current !== null) window.clearTimeout(pendingMoveTimerRef.current);
      window.requestAnimationFrame(() => movePendingNodes(pendingIds, newId));
    }
  };

  const captureDraft = () => {
    const panel = getPanel();
    const input = panel?.querySelector<HTMLInputElement>('input');
    if (!panel || !input) {
      draftRef.current = null;
      return;
    }

    const heading = panel.querySelector<HTMLElement>('.v42PanelHead b')?.textContent?.trim() ?? '';
    const isCreate = heading.startsWith('Create group');
    draftRef.current = {
      kind: isCreate ? 'create' : 'edit',
      name: input.value,
      selectedIds: selectedNodeIds(),
      editGroupName: isCreate ? undefined : heading.replace(/^Edit\s+/, ''),
      pendingGroupedIds: isCreate ? [...pendingGroupedIdsRef.current] : undefined,
    };
  };

  const restoreSelection = (desired: string[]) => {
    const current = new Set(selectedNodeIds());
    const wanted = new Set(desired);
    const all = new Set([...current, ...wanted]);
    all.forEach((id) => {
      if (current.has(id) !== wanted.has(id)) syntheticToggleNode(id);
    });
  };

  const restoreDraft = (draft: DraftState) => {
    const panel = getPanel();
    if (!panel || panel.querySelector('input') || restoringRef.current) return;
    restoringRef.current = true;

    if (draft.kind === 'create') {
      pendingGroupedIdsRef.current = [...(draft.pendingGroupedIds ?? [])];
      panel.querySelector<HTMLButtonElement>('.v42CreateButton')?.click();
    } else {
      const row = Array.from(panel.querySelectorAll<HTMLElement>('.v42GroupRow')).find((item) =>
        item.querySelector<HTMLElement>('.v42GroupRowMain b')?.textContent?.trim() === draft.editGroupName,
      );
      row?.querySelector<HTMLButtonElement>('.v42ManageGroup')?.click();
    }

    window.requestAnimationFrame(() => {
      const input = getPanel()?.querySelector<HTMLInputElement>('input');
      if (input) inputValue(input, draft.name);
      restoreSelection(draft.selectedIds);
      syncPendingCount();
      focusCreateInput();
      draftRef.current = null;
      restoringRef.current = false;
    });
  };

  const closePanel = (preserveDraft: boolean) => {
    const toolbar = getToolbar();
    if (!toolbar || !getPanel()) return;
    if (preserveDraft) captureDraft();
    toolbar.click();
  };

  const ensureUniqueName = (button: HTMLButtonElement) => {
    const panel = getPanel();
    const input = panel?.querySelector<HTMLInputElement>('input');
    if (!panel || !input || buttonText(button) !== 'Create') return false;
    const raw = input.value.trim();
    if (!raw) return false;

    const names = Array.from(panel.querySelectorAll<HTMLElement>('.v42GroupRowMain b')).map((item) => item.textContent?.trim() ?? '');
    if (!names.includes(raw)) return false;

    let suffix = 2;
    let next = `${raw} (${suffix})`;
    while (names.includes(next)) { suffix += 1; next = `${raw} (${suffix})`; }
    inputValue(input, next.slice(0, 24));
    return true;
  };

  const syncGroupedEdges = () => {
    edgeFrameRef.current = null;
    const root = rootRef.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]'));
    const paths = Array.from(root.querySelectorAll<SVGPathElement>('svg.edges path.spoke:not(.slotSpoke):not(.clusterSpoke)'));
    nodes.forEach((node, index) => {
      const path = paths[index];
      if (!path) return;
      const grouped = node.classList.contains('v42GroupedMember');
      const collapsed = grouped && node.classList.contains('v42CollapsedMember');
      const x = parsePx(node.style.getPropertyValue('--x')) + (grouped ? parsePx(node.style.getPropertyValue('--v42-group-dx')) : 0);
      const y = parsePx(node.style.getPropertyValue('--y')) + (grouped ? parsePx(node.style.getPropertyValue('--v42-group-dy')) : 0);
      const nextPath = curvePath({ x, y });
      if (path.getAttribute('d') !== nextPath) path.setAttribute('d', nextPath);
      path.classList.toggle('v44ExpandedGroupPath', grouped && !collapsed);
      path.classList.toggle('v44CollapsedGroupPath', collapsed);
    });
  };

  const scheduleGroupedEdges = () => {
    if (edgeFrameRef.current !== null) return;
    edgeFrameRef.current = window.requestAnimationFrame(syncGroupedEdges);
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => {
      if (root.querySelector('[data-v42-transient-drag="1"]')) return;
      const panel = getPanel();
      setPanelHost((current) => current === panel ? current : panel);
      const input = panel?.querySelector('input');
      const editing = Boolean(input);
      const heading = panel?.querySelector<HTMLElement>('.v42PanelHead b')?.textContent?.trim() ?? '';
      const creating = editing && heading.startsWith('Create group');
      setPanelEditor((current) => current === editing ? current : editing);
      setCreateEditor((current) => current === creating ? current : creating);
      setGroupCount(panel?.querySelectorAll('.v42GroupRow').length ?? 0);
      setClustered(Boolean(root.querySelector('.stage.clusterMode')));

      const title = root.querySelector<HTMLElement>('.labHeader strong');
      const subtitle = root.querySelector<HTMLElement>('.labHeader > div:first-child span');
      if (title && title.textContent !== 'RADIAL NETWORK PLAYGROUND · V44') {
        title.textContent = 'RADIAL NETWORK PLAYGROUND · V44';
      }
      if (subtitle && subtitle.textContent !== 'Drop to create · multi-person draft · grouped edge continuity') {
        subtitle.textContent = 'Drop to create · multi-person draft · grouped edge continuity';
      }

      if (creating) syncPendingCount();
      else if (selectedPeople.length) setSelectedPeople([]);
      scheduleGroupedEdges();
      if (panel && !editing && draftRef.current && !restoringRef.current) {
        const draft = draftRef.current;
        window.requestAnimationFrame(() => restoreDraft(draft));
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (forwardSelectionRef.current) {
        forwardSelectionRef.current = false;
        return;
      }
      if (forwardGroupMoveRef.current) return;

      const node = event.target instanceof Element
        ? event.target.closest('button.personNode[data-node-id]') as HTMLButtonElement | null
        : null;
      const id = node?.dataset.nodeId;
      if (!node || !id) return;

      const panel = getPanel();
      const input = panel?.querySelector('input');
      const heading = panel?.querySelector<HTMLElement>('.v42PanelHead b')?.textContent?.trim() ?? '';
      const creating = Boolean(input && heading.startsWith('Create group'));
      if (input && !creating) return;

      dragRef.current = {
        nodeId: id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        mode: creating ? 'create-editor' : 'new-group',
      };

      if (creating) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (forwardGroupMoveRef.current) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.v42GroupHub')) scheduleGroupedEdges();

      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (!drag.moved && distance >= 10) drag.moved = true;
      if (!drag.moved) return;

      if (drag.mode === 'create-editor') {
        const over = pointIn(getCreateDrop(), event.clientX, event.clientY, 6);
        setCreateDropHover((current) => current === over ? current : over);
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      const over = pointIn(getNewDrop(), event.clientX, event.clientY, 4);
      setNewDropHover((current) => current === over ? current : over);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (forwardGroupMoveRef.current) return;
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        scheduleGroupedEdges();
        return;
      }
      dragRef.current = null;
      scheduleGroupedEdges();
      window.requestAnimationFrame(scheduleGroupedEdges);

      if (drag.mode === 'create-editor') {
        const overCreate = drag.moved && pointIn(getCreateDrop(), event.clientX, event.clientY, 6);
        setCreateDropHover(false);
        if (drag.moved) suppressOutsideUntilRef.current = performance.now() + 280;
        if (!drag.moved || overCreate) toggleCreateSelection(drag.nodeId);
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      const overNew = drag.moved && pointIn(getNewDrop(), event.clientX, event.clientY, 4);
      setNewDropHover(false);
      if (drag.moved) suppressOutsideUntilRef.current = performance.now() + 280;
      if (overNew) {
        const id = drag.nodeId;
        window.requestAnimationFrame(() => beginCreate(id));
      }
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (forwardGroupMoveRef.current) return;
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setNewDropHover(false);
      setCreateDropHover(false);
      suppressOutsideUntilRef.current = performance.now() + 120;
      scheduleGroupedEdges();
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const panel = getPanel();
      const toolbar = getToolbar();
      const button = target.closest('button') as HTMLButtonElement | null;

      if (panel && button && panel.contains(button)) {
        const text = buttonText(button);
        if (button.classList.contains('v44SelectedChip')) return;
        if (text === 'Create') {
          if (ensureUniqueName(button)) {
            event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
            window.requestAnimationFrame(() => button.click());
            return;
          }
          pendingCreateRef.current = {
            nodeIds: [...pendingGroupedIdsRef.current],
            beforeGroupIds: Array.from(panel.querySelectorAll<HTMLElement>('.v42GroupRow[data-group-id]')).map((row) => row.dataset.groupId).filter((id): id is string => Boolean(id)),
          };
          draftRef.current = null;
          if (pendingCreateTimerRef.current !== null) window.clearTimeout(pendingCreateTimerRef.current);
          pendingCreateTimerRef.current = window.setTimeout(() => {
            pendingCreateTimerRef.current = null;
            finishPendingCreate(0);
          }, 30);
        } else if (text === 'Save changes') {
          draftRef.current = null;
        } else if (text === 'Cancel' || (text === '×' && panel.querySelector('input'))) {
          draftRef.current = null;
          clearPendingCreate();
          pendingGroupedIdsRef.current = [];
          root.querySelectorAll('.personNode.v44PendingNewGroupMember').forEach((node) => node.classList.remove('v44PendingNewGroupMember'));
          setSelectedPeople([]);
        }
        return;
      }

      if (!panel || panel.contains(target) || toolbar?.contains(target)) return;
      if (performance.now() < suppressOutsideUntilRef.current) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closePanel(true);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !getPanel()) return;
      event.preventDefault();
      closePanel(true);
    };

    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true, attributeFilter: ['class'] });
    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('pointermove', onPointerMove, true);
    root.addEventListener('pointerup', onPointerUp, true);
    root.addEventListener('pointercancel', onPointerCancel, true);
    root.addEventListener('click', onClickCapture, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', scheduleGroupedEdges);
    sync();

    return () => {
      observer.disconnect();
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('pointermove', onPointerMove, true);
      root.removeEventListener('pointerup', onPointerUp, true);
      root.removeEventListener('pointercancel', onPointerCancel, true);
      root.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', scheduleGroupedEdges);
      clearPendingCreate();
      if (pendingMoveTimerRef.current !== null) window.clearTimeout(pendingMoveTimerRef.current);
      if (edgeFrameRef.current !== null) window.cancelAnimationFrame(edgeFrameRef.current);
    };
  }, [selectedPeople.length]);

  const onNewGroupClick = () => {
    if (clustered) return;
    beginCreate(null);
  };

  return (
    <div ref={rootRef} className="v44GroupUxRoot">
      <QaNetworkRadialPlaygroundV43 />

      {panelHost && !panelEditor ? createPortal(
        <button
          type="button"
          className={`v44NewGroupDrop ${groupCount === 0 ? 'first' : ''} ${newDropHover ? 'dropTarget' : ''}`}
          onClick={onNewGroupClick}
          disabled={clustered}
          aria-label="Create new group"
        >
          <b>{groupCount === 0 ? '＋ Create your first group' : '＋ New group'}</b>
          <small>{clustered
            ? 'Zoom in first'
            : newDropHover
              ? 'Release to start with this person'
              : groupCount === 0
                ? 'Drop a person here, or tap to create an empty group'
                : 'Drop a person here or tap to create empty'}</small>
        </button>,
        panelHost,
      ) : null}

      {panelHost && createEditor ? createPortal(
        <div className={`v44CreateDropMore ${createDropHover ? 'dropTarget' : ''}`} aria-label="Add people to new group">
          <b>{createDropHover ? 'Release to add' : '＋ Drop more people here'}</b>
          <small>Drag from the network, or tap a person to select</small>
          {selectedPeople.length ? <div className="v44SelectedPeople">
            {selectedPeople.map((person) => <button
              key={person.id}
              type="button"
              className="v44SelectedChip"
              onClick={() => toggleCreateSelection(person.id)}
              title={person.pendingMove ? 'Will move from another group' : 'Remove from selection'}
            >
              <span>{person.label}</span><i>{person.pendingMove ? 'move' : ''}</i><b>×</b>
            </button>)}
          </div> : <span className="v44NoSelection">No people selected yet</span>}
        </div>,
        panelHost,
      ) : null}

      <style jsx global>{`
        .v44GroupUxRoot .v42CreateButton{display:none!important}
        .v44NewGroupDrop{
          width:100%;min-height:44px;margin-top:7px;padding:7px 9px;box-sizing:border-box;
          border:1px dashed rgba(244,183,40,.32);border-radius:10px;
          background:rgba(244,183,40,.045);color:#c9a94f;text-align:left;
          display:grid;gap:2px;cursor:copy;transition:border-color 140ms ease,background 140ms ease,box-shadow 140ms ease,transform 140ms ease
        }
        .v44NewGroupDrop b{font-size:.46rem;color:#d5b354}.v44NewGroupDrop small{font-size:.35rem;color:#746b5c;line-height:1.3}
        .v44NewGroupDrop.first{min-height:54px;padding:9px 10px;border-color:rgba(244,183,40,.42);background:rgba(244,183,40,.065)}
        .v44NewGroupDrop.first b{font-size:.49rem}.v44NewGroupDrop.first small{font-size:.36rem}
        .v44NewGroupDrop.dropTarget,.v44CreateDropMore.dropTarget{
          border-style:solid!important;border-color:rgba(255,207,71,1)!important;background:rgba(42,33,10,.98)!important;
          box-shadow:0 0 0 4px rgba(244,183,40,.12),0 0 28px rgba(244,183,40,.16)!important;transform:scale(1.008)
        }
        .v44NewGroupDrop.dropTarget small,.v44CreateDropMore.dropTarget small{color:#e4bb50}.v44NewGroupDrop:disabled{opacity:.36;cursor:not-allowed}
        .v44CreateDropMore{
          width:100%;box-sizing:border-box;margin-top:7px;padding:8px;border:1px dashed rgba(244,183,40,.28);border-radius:10px;
          background:rgba(244,183,40,.035);display:grid;gap:3px;order:4;transition:border-color 140ms ease,background 140ms ease,box-shadow 140ms ease,transform 140ms ease
        }
        .v44CreateDropMore>b{font-size:.44rem;color:#d2af50}.v44CreateDropMore>small{font-size:.34rem;color:#756d60}
        .v44SelectedPeople{display:flex;gap:4px;flex-wrap:wrap;max-height:66px;overflow:auto;margin-top:3px;padding-top:2px}
        .v44SelectedChip{max-width:100%;height:25px;padding:0 6px 0 7px;border:1px solid rgba(244,183,40,.17);border-radius:999px;background:#10100d;color:#a99d87;display:flex;align-items:center;gap:4px;font-size:.34rem}
        .v44SelectedChip span{max-width:112px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.v44SelectedChip i{font-style:normal;color:#9f8240;font-size:.29rem}.v44SelectedChip>b{font-size:.48rem;color:#8e8374}.v44NoSelection{font-size:.33rem;color:#625d54;margin-top:2px}
        .v44GroupUxRoot .v42GroupPanel:has(.v44CreateDropMore){display:flex!important;flex-direction:column!important}
        .v44GroupUxRoot .v42GroupPanel:has(.v44CreateDropMore) .v42PanelHead{order:1}.v44GroupUxRoot .v42GroupPanel:has(.v44CreateDropMore) .v42SelectionCount{order:2}.v44GroupUxRoot .v42GroupPanel:has(.v44CreateDropMore) input{order:3}.v44GroupUxRoot .v42GroupPanel:has(.v44CreateDropMore) .v42CreateActions{order:5}.v44GroupUxRoot .v42GroupPanel:has(.v44CreateDropMore) .v42PanelNote{order:6}
        .v44GroupUxRoot .v42ManualGroupsRoot.v42Creating .personNode.v42LockedMember{pointer-events:auto!important;opacity:.42!important}
        .v44GroupUxRoot .personNode.v44PendingNewGroupMember{opacity:1!important;pointer-events:auto!important}
        .v44GroupUxRoot .personNode.v44PendingNewGroupMember .nodeCircle{
          transform:scale(1.12)!important;border-color:rgba(244,183,40,.98)!important;
          box-shadow:0 0 0 4px rgba(244,183,40,.12),0 0 30px rgba(244,183,40,.18)!important
        }
        .v44GroupUxRoot .personNode.v44PendingNewGroupMember b{color:#f0c755!important}
        .v44GroupUxRoot .spoke.v42GroupMemberPath.v44ExpandedGroupPath{opacity:.46!important;stroke:rgba(239,205,111,.22)!important}
        .v44GroupUxRoot .spoke.v42GroupMemberPath.v44CollapsedGroupPath{opacity:0!important}
        .v44GroupUxRoot .v42GroupPanel{max-height:calc(100dvh - 18px);overflow:auto;overscroll-behavior:contain}
        .v44GroupUxRoot .v42CreateActions{position:sticky;bottom:-1px;z-index:2;padding-top:6px;background:linear-gradient(to bottom,rgba(12,12,10,0),rgba(12,12,10,.99) 30%)}
        @media(max-width:640px){
          .v44GroupUxRoot .v42GroupPanel{max-height:calc(100dvh - 18px);padding-bottom:max(9px,env(safe-area-inset-bottom))}
          .v44NewGroupDrop.first{min-height:50px}
          .v44CreateDropMore{padding:7px}.v44SelectedPeople{max-height:58px}.v44SelectedChip span{max-width:96px}
        }
        @media(prefers-reduced-motion:reduce){.v44NewGroupDrop,.v44CreateDropMore{transition:none!important}}
      `}</style>
    </div>
  );
}
