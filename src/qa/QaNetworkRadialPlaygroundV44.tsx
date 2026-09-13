'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { QaNetworkRadialPlaygroundV43 } from './QaNetworkRadialPlaygroundV43';

type DragState = {
  nodeId: string;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
} | null;

type DraftState = {
  kind: 'create' | 'edit';
  name: string;
  selectedIds: string[];
  editGroupName?: string;
  pendingNodeId?: string | null;
  pendingWasGrouped?: boolean;
};

type PendingCreate = {
  nodeId: string | null;
  wasGrouped: boolean;
  beforeGroupIds: string[];
} | null;

function inputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function pointIn(element: HTMLElement | null, clientX: number, clientY: number, pad = 0) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return clientX >= rect.left - pad && clientX <= rect.right + pad && clientY >= rect.top - pad && clientY <= rect.bottom + pad;
}

function buttonText(button: HTMLButtonElement | null) {
  return button?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

export function QaNetworkRadialPlaygroundV44() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState>(null);
  const draftRef = useRef<DraftState | null>(null);
  const restoringRef = useRef(false);
  const pendingNodeRef = useRef<string | null>(null);
  const pendingWasGroupedRef = useRef(false);
  const pendingCreateRef = useRef<PendingCreate>(null);
  const suppressOutsideUntilRef = useRef(0);
  const syntheticPointerRef = useRef(99440);

  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);
  const [panelEditor, setPanelEditor] = useState(false);
  const [groupCount, setGroupCount] = useState(0);
  const [clustered, setClustered] = useState(false);
  const [newDropHover, setNewDropHover] = useState(false);

  const getPanel = () => rootRef.current?.querySelector<HTMLElement>('.v42GroupPanel') ?? null;
  const getToolbar = () => rootRef.current?.querySelector<HTMLButtonElement>('.v42GroupToolbarButton') ?? null;
  const getNewDrop = () => rootRef.current?.querySelector<HTMLElement>('.v44NewGroupDrop') ?? null;
  const personNode = (id: string) => rootRef.current?.querySelector<HTMLButtonElement>(`.personNode[data-node-id="${CSS.escape(id)}"]`) ?? null;
  const selectedNodeIds = () => Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('.personNode.v42SelectedMember[data-node-id]') ?? [])
    .map((node) => node.dataset.nodeId)
    .filter((id): id is string => Boolean(id));

  const syncPendingCount = () => {
    const root = rootRef.current;
    const panel = getPanel();
    if (!root || !panel || !panel.querySelector('input')) return;
    const heading = panel.querySelector<HTMLElement>('.v42PanelHead b')?.textContent?.trim() ?? '';
    if (!heading.startsWith('Create group')) return;

    root.querySelectorAll('.personNode.v44PendingNewGroupMember').forEach((node) => node.classList.remove('v44PendingNewGroupMember'));
    const pendingId = pendingNodeRef.current;
    const pendingNode = pendingId ? personNode(pendingId) : null;
    if (pendingNode && pendingWasGroupedRef.current) pendingNode.classList.add('v44PendingNewGroupMember');

    const selected = selectedNodeIds();
    const extra = pendingId && pendingWasGroupedRef.current && !selected.includes(pendingId) ? 1 : 0;
    const count = selected.length + extra;
    const countEl = panel.querySelector<HTMLElement>('.v42SelectionCount b');
    const textEl = panel.querySelector<HTMLElement>('.v42SelectionCount span');
    if (countEl) countEl.textContent = String(count);
    if (textEl) textEl.textContent = pendingWasGroupedRef.current && pendingId
      ? 'selected · will move here on create'
      : 'selected · optional';
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
    node.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'mouse',
      button: 0,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }));
  };

  const beginCreate = (nodeId: string | null = null) => {
    const panel = getPanel();
    const createButton = panel?.querySelector<HTMLButtonElement>('.v42CreateButton');
    if (!panel || !createButton || createButton.disabled) return;

    pendingNodeRef.current = nodeId;
    const node = nodeId ? personNode(nodeId) : null;
    pendingWasGroupedRef.current = Boolean(node?.classList.contains('v42GroupedMember'));
    createButton.click();

    window.requestAnimationFrame(() => {
      if (nodeId && !pendingWasGroupedRef.current) syntheticToggleNode(nodeId);
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
  };

  const finishPendingCreate = () => {
    const pending = pendingCreateRef.current;
    if (!pending) return;
    const panel = getPanel();
    if (!panel || panel.querySelector('input')) {
      window.setTimeout(finishPendingCreate, 40);
      return;
    }

    const rows = Array.from(panel.querySelectorAll<HTMLElement>('.v42GroupRow[data-group-id]'));
    const created = rows.find((row) => {
      const id = row.dataset.groupId;
      return Boolean(id && !pending.beforeGroupIds.includes(id));
    });
    const newId = created?.dataset.groupId;
    pendingCreateRef.current = null;

    if (pending.nodeId && pending.wasGrouped && newId) {
      window.requestAnimationFrame(() => simulateMoveToGroup(pending.nodeId!, newId));
    }
    pendingNodeRef.current = null;
    pendingWasGroupedRef.current = false;
    rootRef.current?.querySelectorAll('.personNode.v44PendingNewGroupMember').forEach((node) => node.classList.remove('v44PendingNewGroupMember'));
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
      pendingNodeId: isCreate ? pendingNodeRef.current : null,
      pendingWasGrouped: isCreate ? pendingWasGroupedRef.current : false,
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
      pendingNodeRef.current = draft.pendingNodeId ?? null;
      pendingWasGroupedRef.current = Boolean(draft.pendingWasGrouped);
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

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => {
      const panel = getPanel();
      setPanelHost((current) => current === panel ? current : panel);
      const editing = Boolean(panel?.querySelector('input'));
      setPanelEditor(editing);
      setGroupCount(panel?.querySelectorAll('.v42GroupRow').length ?? 0);
      setClustered(Boolean(root.querySelector('.stage.clusterMode')));

      const title = root.querySelector<HTMLElement>('.labHeader strong');
      const subtitle = root.querySelector<HTMLElement>('.labHeader > div:first-child span');
      if (title) title.textContent = 'RADIAL NETWORK PLAYGROUND · V44';
      if (subtitle) subtitle.textContent = 'Drop to create · outside click close · draft restore';

      if (editing) syncPendingCount();
      if (panel && !editing && draftRef.current && !restoringRef.current) {
        const draft = draftRef.current;
        window.requestAnimationFrame(() => restoreDraft(draft));
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const node = event.target instanceof Element
        ? event.target.closest('button.personNode[data-node-id]') as HTMLButtonElement | null
        : null;
      const id = node?.dataset.nodeId;
      if (!node || !id) return;

      const panel = getPanel();
      if (panel?.querySelector('input') && pendingNodeRef.current === id && pendingWasGroupedRef.current) {
        pendingNodeRef.current = null;
        pendingWasGroupedRef.current = false;
        node.classList.remove('v44PendingNewGroupMember');
        syncPendingCount();
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      dragRef.current = { nodeId: id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (!drag.moved && distance >= 10) drag.moved = true;
      if (!drag.moved) return;
      const over = pointIn(getNewDrop(), event.clientX, event.clientY, 4);
      setNewDropHover(over);
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const wasMoved = drag.moved;
      const overNew = wasMoved && pointIn(getNewDrop(), event.clientX, event.clientY, 4);
      dragRef.current = null;
      setNewDropHover(false);
      if (wasMoved) suppressOutsideUntilRef.current = performance.now() + 280;
      if (overNew) {
        const id = drag.nodeId;
        window.requestAnimationFrame(() => beginCreate(id));
      }
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const panel = getPanel();
      const toolbar = getToolbar();
      const button = target.closest('button') as HTMLButtonElement | null;

      if (panel && button && panel.contains(button)) {
        const text = buttonText(button);
        if (text === 'Create') {
          if (ensureUniqueName(button)) {
            event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
            window.requestAnimationFrame(() => button.click());
            return;
          }
          pendingCreateRef.current = {
            nodeId: pendingNodeRef.current,
            wasGrouped: pendingWasGroupedRef.current,
            beforeGroupIds: Array.from(panel.querySelectorAll<HTMLElement>('.v42GroupRow[data-group-id]')).map((row) => row.dataset.groupId).filter((id): id is string => Boolean(id)),
          };
          draftRef.current = null;
          window.setTimeout(finishPendingCreate, 30);
        } else if (text === 'Save changes') {
          draftRef.current = null;
        } else if (text === 'Cancel' || (text === '×' && panel.querySelector('input'))) {
          draftRef.current = null;
          pendingNodeRef.current = null;
          pendingWasGroupedRef.current = false;
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

    const onCreateModePointerUp = () => {
      const pending = pendingNodeRef.current;
      if (!pending || pendingWasGroupedRef.current) return;
      window.setTimeout(() => {
        if (!personNode(pending)?.classList.contains('v42SelectedMember')) pendingNodeRef.current = null;
        syncPendingCount();
      }, 0);
    };

    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true, attributeFilter: ['class'] });
    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('pointermove', onPointerMove, true);
    root.addEventListener('pointerup', onPointerUp, true);
    root.addEventListener('pointercancel', onPointerUp, true);
    root.addEventListener('pointerup', onCreateModePointerUp, false);
    root.addEventListener('click', onClickCapture, true);
    window.addEventListener('keydown', onKeyDown, true);
    sync();

    return () => {
      observer.disconnect();
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('pointermove', onPointerMove, true);
      root.removeEventListener('pointerup', onPointerUp, true);
      root.removeEventListener('pointercancel', onPointerUp, true);
      root.removeEventListener('pointerup', onCreateModePointerUp, false);
      root.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

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

      <style jsx global>{`
        .v44GroupUxRoot .v42CreateButton{display:none!important}
        .v44NewGroupDrop{
          width:100%;min-height:46px;margin-top:8px;padding:8px 10px;box-sizing:border-box;
          border:1px dashed rgba(244,183,40,.32);border-radius:10px;
          background:rgba(244,183,40,.045);color:#c9a94f;text-align:left;
          display:grid;gap:3px;cursor:copy;transition:border-color 140ms ease,background 140ms ease,box-shadow 140ms ease,transform 140ms ease
        }
        .v44NewGroupDrop b{font-size:.46rem;color:#d5b354}.v44NewGroupDrop small{font-size:.36rem;color:#746b5c;line-height:1.35}
        .v44NewGroupDrop.first{min-height:72px;padding:13px 12px;border-color:rgba(244,183,40,.42);background:rgba(244,183,40,.065)}
        .v44NewGroupDrop.first b{font-size:.52rem}.v44NewGroupDrop.first small{font-size:.38rem}
        .v44NewGroupDrop.dropTarget{
          border-style:solid;border-color:rgba(255,207,71,1);background:rgba(42,33,10,.98);
          box-shadow:0 0 0 4px rgba(244,183,40,.12),0 0 32px rgba(244,183,40,.18);transform:scale(1.012)
        }
        .v44NewGroupDrop.dropTarget small{color:#e4bb50}.v44NewGroupDrop:disabled{opacity:.36;cursor:not-allowed}
        .v44GroupUxRoot .personNode.v44PendingNewGroupMember .nodeCircle{
          transform:scale(1.12)!important;border-color:rgba(244,183,40,.98)!important;
          box-shadow:0 0 0 4px rgba(244,183,40,.12),0 0 30px rgba(244,183,40,.18)!important
        }
        .v44GroupUxRoot .personNode.v44PendingNewGroupMember b{color:#f0c755!important}
        .v44GroupUxRoot .v42GroupPanel{max-height:calc(100dvh - 18px);overflow:auto;overscroll-behavior:contain}
        .v44GroupUxRoot .v42CreateActions{position:sticky;bottom:-1px;z-index:2;padding-top:6px;background:linear-gradient(to bottom,rgba(12,12,10,0),rgba(12,12,10,.99) 30%)}
        @media(max-width:640px){
          .v44GroupUxRoot .v42GroupPanel{max-height:calc(100dvh - 18px);padding-bottom:max(11px,env(safe-area-inset-bottom))}
          .v44NewGroupDrop.first{min-height:68px}
        }
        @media(prefers-reduced-motion:reduce){.v44NewGroupDrop{transition:none!important}}
      `}</style>
    </div>
  );
}
