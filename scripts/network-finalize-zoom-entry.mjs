import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/components/AppNetwork.tsx';
let source = await readFile(path, 'utf8');
const lines = (...items) => items.join('\n');

function replaceOnce(label, from, to) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  source = source.replace(from, to);
}

replaceOnce('pinch candidate', lines(
  '    if (pointersRef.current.size === 2) {',
  '      cancelHoldDrag(true);',
  '      workspaceDragRef.current = null;',
  '      setDraggingWorkspaceKey(null);',
  '      const [a, b] = Array.from(pointersRef.current.values());',
  '      const center = midpoint(a, b);',
  '      const startView = view;',
  '      pinchRef.current = {',
  '        startDistance: Math.max(1, distance(a, b)),',
  '        startCenter: center,',
  '        startView,',
  '        worldAnchor: {',
  '          x: (center.x - (stageRef.current?.getBoundingClientRect().left ?? 0) - startView.x) / startView.scale,',
  '          y: (center.y - (stageRef.current?.getBoundingClientRect().top ?? 0) - startView.y) / startView.scale,',
  '        },',
  '      };'
), lines(
  '    if (pointersRef.current.size === 2) {',
  '      cancelHoldDrag(true);',
  '      workspaceDragRef.current = null;',
  '      setDraggingWorkspaceKey(null);',
  '      const [a, b] = Array.from(pointersRef.current.values());',
  '      const center = midpoint(a, b);',
  '      const startView = view;',
  '      const stageRect = stageRef.current?.getBoundingClientRect();',
  '      const worldAnchor = {',
  '        x: (center.x - (stageRect?.left ?? 0) - startView.x) / startView.scale,',
  '        y: (center.y - (stageRect?.top ?? 0) - startView.y) / startView.scale,',
  '      };',
  '      pinchRef.current = {',
  '        startDistance: Math.max(1, distance(a, b)),',
  '        startCenter: center,',
  '        startView,',
  '        worldAnchor,',
  '      };',
  '      pinchCandidateWalletRef.current = editingLayout',
  '        ? null',
  '        : nearestVisibleChild(worldAnchor)?.wallet ?? null;',
  '      pinchEnterIntentRef.current = null;'
));

replaceOnce('pinch intent', lines(
  '      if (!editingLayout && rawScale < MIN_SCALE * 0.88 && currentData && currentData.breadcrumb.length > 1) {',
  '        pinchReturnIntentRef.current = true;',
  '      }',
  '      suppressClickRef.current = true;'
), lines(
  '      if (',
  '        !editingLayout &&',
  '        pinchCandidateWalletRef.current &&',
  '        rawScale >= Math.max(NODE_ENTER_SCALE, pinch.startView.scale * 1.18)',
  '      ) {',
  '        pinchEnterIntentRef.current = pinchCandidateWalletRef.current;',
  '      }',
  '      if (!editingLayout && rawScale < MIN_SCALE * 0.88 && currentData && currentData.breadcrumb.length > 1) {',
  '        pinchReturnIntentRef.current = true;',
  '      }',
  '      suppressClickRef.current = true;'
));

replaceOnce('pinch release ownership', lines(
  '    if (pointersRef.current.size === 1) {',
  '      const [remainingId, remainingPoint] = Array.from(pointersRef.current.entries())[0];',
  '      panPointerRef.current = { id: remainingId, point: remainingPoint, allowed: false };',
  '      pinchRef.current = null;',
  '      if (pinchReturnIntentRef.current) {',
  '        pinchReturnIntentRef.current = false;',
  '        returnToParent();',
  '      }',
  '      return;',
  '    }',
  '    if (pointersRef.current.size === 0) {',
  '      panPointerRef.current = null;',
  '      pinchRef.current = null;',
  '      if (pinchReturnIntentRef.current) {',
  '        pinchReturnIntentRef.current = false;',
  '        returnToParent();',
  '      }'
), lines(
  '    if (pointersRef.current.size === 1) {',
  '      const [remainingId, remainingPoint] = Array.from(pointersRef.current.entries())[0];',
  '      panPointerRef.current = { id: remainingId, point: remainingPoint, allowed: false };',
  '      return;',
  '    }',
  '    if (pointersRef.current.size === 0) {',
  '      panPointerRef.current = null;',
  '      const enterWallet = pinchEnterIntentRef.current;',
  '      const returnIntent = pinchReturnIntentRef.current;',
  '      pinchRef.current = null;',
  '      pinchCandidateWalletRef.current = null;',
  '      pinchEnterIntentRef.current = null;',
  '      pinchReturnIntentRef.current = false;',
  '      if (enterWallet && !editingLayout) {',
  "        void moveToFocus(enterWallet, 'forward');",
  '      } else if (returnIntent) {',
  '        returnToParent();',
  '      }'
));

replaceOnce('wheel node entry', lines(
  '    if (event.deltaY <= 0 || view.scale > MIN_SCALE + 0.01) {',
  '      wheelReturnDistanceRef.current = 0;',
  '    }',
  '    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };',
  '    const factor = event.deltaY < 0 ? 1.09 : 0.91;',
  '    zoomAt(point, view.scale * factor);'
), lines(
  '    if (event.deltaY <= 0 || view.scale > MIN_SCALE + 0.01) {',
  '      wheelReturnDistanceRef.current = 0;',
  '    }',
  '    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };',
  '    const factor = event.deltaY < 0 ? 1.09 : 0.91;',
  '    const nextScale = view.scale * factor;',
  '    if (!editingLayout && event.deltaY < 0) {',
  '      const worldPoint = {',
  '        x: (point.x - view.x) / view.scale,',
  '        y: (point.y - view.y) / view.scale,',
  '      };',
  '      const candidate = nearestVisibleChild(worldPoint);',
  '      if (candidate && nextScale >= NODE_ENTER_SCALE) {',
  '        const candidateKey = keyWallet(candidate.wallet);',
  '        if (wheelEnterWalletRef.current === candidateKey) {',
  '          wheelEnterDistanceRef.current += Math.abs(event.deltaY);',
  '        } else {',
  '          wheelEnterWalletRef.current = candidateKey;',
  '          wheelEnterDistanceRef.current = Math.abs(event.deltaY);',
  '        }',
  '        if (wheelEnterDistanceRef.current >= WHEEL_ENTER_DISTANCE) {',
  '          wheelEnterDistanceRef.current = 0;',
  '          wheelEnterWalletRef.current = null;',
  "          void moveToFocus(candidate.wallet, 'forward');",
  '          return;',
  '        }',
  '      } else {',
  '        wheelEnterDistanceRef.current = 0;',
  '        wheelEnterWalletRef.current = null;',
  '      }',
  '    } else {',
  '      wheelEnterDistanceRef.current = 0;',
  '      wheelEnterWalletRef.current = null;',
  '    }',
  '    zoomAt(point, nextScale);'
));

await writeFile(path, source);
