import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/components/AppNetwork.tsx';
let source = await readFile(path, 'utf8');
const lines = (...items) => items.join('\n');

function replaceOnce(label, from, to) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  source = source.replace(from, to);
}

replaceOnce('hold helpers insertion', '  const finishWorkspaceDrop = useCallback((event: ReactPointerEvent<HTMLDivElement>, drag: WorkspaceDrag) => {', lines(
  '  const cancelHoldDrag = useCallback((restore = false) => {',
  '    if (holdTimerRef.current !== null) {',
  '      window.clearTimeout(holdTimerRef.current);',
  '      holdTimerRef.current = null;',
  '    }',
  '    const hold = holdDragRef.current;',
  '    if (restore && hold?.moved) persistFocusWorkspace(hold.originalWorkspace);',
  '    holdDragRef.current = null;',
  '    if (hold) setDraggingWorkspaceKey(null);',
  '  }, [persistFocusWorkspace]);',
  '',
  '  const beginHoldDrag = useCallback((',
  '    event: ReactPointerEvent<HTMLButtonElement>,',
  '    key: string,',
  '    point: Point,',
  '  ) => {',
  '    if (editingLayout || pendingFocus || !currentFocusKey || groupContainingWallet(committedWorkspace, key)) return;',
  '    const stage = stageRef.current;',
  '    if (!stage) return;',
  '    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);',
  '    const rect = stage.getBoundingClientRect();',
  '    const worldPoint = {',
  '      x: (event.clientX - rect.left - view.x) / view.scale,',
  '      y: (event.clientY - rect.top - view.y) / view.scale,',
  '    };',
  '    holdDragRef.current = {',
  '      pointerId: event.pointerId,',
  '      key,',
  '      startScreen: { x: event.clientX, y: event.clientY },',
  '      startNode: point,',
  '      offset: { x: worldPoint.x - point.x, y: worldPoint.y - point.y },',
  '      armed: false,',
  '      moved: false,',
  '      originalWorkspace: cloneNetworkFocusWorkspace(committedWorkspace),',
  '    };',
  '    holdTimerRef.current = window.setTimeout(() => {',
  '      holdTimerRef.current = null;',
  '      const hold = holdDragRef.current;',
  '      if (!hold || hold.pointerId !== event.pointerId || pointersRef.current.size !== 1) return;',
  '      hold.armed = true;',
  "      setDraggingWorkspaceKey('node:' + key);",
  '    }, HOLD_TO_MOVE_MS);',
  '  }, [editingLayout, pendingFocus, currentFocusKey, committedWorkspace, view]);',
  '',
  '  const finishWorkspaceDrop = useCallback((event: ReactPointerEvent<HTMLDivElement>, drag: WorkspaceDrag) => {'
));

replaceOnce('second pointer cancels hold', lines(
  '    if (pointersRef.current.size === 2) {',
  '      workspaceDragRef.current = null;'
), lines(
  '    if (pointersRef.current.size === 2) {',
  '      cancelHoldDrag(true);',
  '      workspaceDragRef.current = null;'
));

replaceOnce('hold move handler', lines(
  '    const workspaceDrag = workspaceDragRef.current;',
  '    if (',
  '      workspaceDrag &&'
), lines(
  '    const holdDrag = holdDragRef.current;',
  '    if (holdDrag && holdDrag.pointerId === event.pointerId && pointersRef.current.size === 1 && !editingLayout) {',
  '      const screenDistance = Math.hypot(',
  '        event.clientX - holdDrag.startScreen.x,',
  '        event.clientY - holdDrag.startScreen.y,',
  '      );',
  '      if (!holdDrag.armed) {',
  '        if (screenDistance > HOLD_CANCEL_DISTANCE) {',
  '          if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);',
  '          holdTimerRef.current = null;',
  '          holdDragRef.current = null;',
  '          suppressClickRef.current = true;',
  '        }',
  '        return;',
  '      }',
  '      if (screenDistance <= HOLD_CANCEL_DISTANCE && !holdDrag.moved) return;',
  '      const rect = stageRef.current?.getBoundingClientRect();',
  '      if (!rect) return;',
  '      const nextPoint = {',
  '        x: clamp((event.clientX - rect.left - view.x) / view.scale - holdDrag.offset.x, 90, WORLD_W - 90),',
  '        y: clamp((event.clientY - rect.top - view.y) / view.scale - holdDrag.offset.y, 90, WORLD_H - 90),',
  '      };',
  '      holdDrag.moved = true;',
  '      persistNodePosition(holdDrag.key, nextPoint);',
  '      suppressClickRef.current = true;',
  '      return;',
  '    }',
  '',
  '    const workspaceDrag = workspaceDragRef.current;',
  '    if (',
  '      workspaceDrag &&'
));

replaceOnce('hold pointer end', lines(
  '  const onPointerEndCapture = (event: ReactPointerEvent<HTMLDivElement>) => {',
  '    const workspaceDrag = workspaceDragRef.current;'
), lines(
  '  const onPointerEndCapture = (event: ReactPointerEvent<HTMLDivElement>) => {',
  '    const holdDrag = holdDragRef.current;',
  '    if (holdDrag && holdDrag.pointerId === event.pointerId) {',
  '      if (holdTimerRef.current !== null) {',
  '        window.clearTimeout(holdTimerRef.current);',
  '        holdTimerRef.current = null;',
  '      }',
  "      if (event.type === 'pointercancel' && holdDrag.moved) persistFocusWorkspace(holdDrag.originalWorkspace);",
  '      if (holdDrag.moved) suppressClickRef.current = true;',
  '      holdDragRef.current = null;',
  '      setDraggingWorkspaceKey(null);',
  '    }',
  '',
  '    const workspaceDrag = workspaceDragRef.current;'
));

replaceOnce(
  'node pointer down',
  "                  onPointerDown={editingLayout ? (event) => beginWorkspaceDrag(event, 'node', childKey, { x: child.x, y: child.y }) : undefined}",
  lines(
    '                  onPointerDown={(event) => {',
    "                    if (editingLayout) beginWorkspaceDrag(event, 'node', childKey, { x: child.x, y: child.y });",
    '                    else beginHoldDrag(event, childKey, { x: child.x, y: child.y });',
    '                  }}',
    '                  onContextMenu={(event) => event.preventDefault()}'
  )
);

replaceOnce(
  'ios callout suppression',
  '.personNode{min-width:92px;padding:7px 8px 8px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(17,17,15,.94);color:#d9d4ca;display:grid;justify-items:center;gap:5px;box-shadow:0 8px 20px rgba(0,0,0,.23);cursor:pointer}',
  '.personNode{min-width:92px;padding:7px 8px 8px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(17,17,15,.94);color:#d9d4ca;display:grid;justify-items:center;gap:5px;box-shadow:0 8px 20px rgba(0,0,0,.23);cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}'
);

await writeFile(path, source);
