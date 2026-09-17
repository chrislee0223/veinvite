import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/components/AppNetwork.tsx';
let source = await readFile(path, 'utf8');
const lines = (...items) => items.join('\n');

function replaceOnce(label, from, to) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  source = source.replace(from, to);
}

replaceOnce('multi-level back guard', lines(
  "      if (direction === 'back') {",
  '        const exactParentView = returnViewByChildRef.current.get(current);',
  '        setView(',
  '          exactParentView ??',
  '          viewByFocusRef.current.get(target) ??',
  '          centeredView(stageSize, 1),',
  '        );',
  '      } else {'
), lines(
  "      if (direction === 'back') {",
  '        const immediateParent = currentData.breadcrumb[currentData.breadcrumb.length - 2] ?? null;',
  '        const exactParentView = immediateParent && keyWallet(immediateParent) === target',
  '          ? returnViewByChildRef.current.get(current)',
  '          : undefined;',
  '        setView(',
  '          exactParentView ??',
  '          viewByFocusRef.current.get(target) ??',
  '          centeredView(stageSize, 1),',
  '        );',
  '      } else {'
));

replaceOnce('camera controls', lines(
  '  const centerNetwork = useCallback(() => {',
  '    if (stageSize.width <= 0 || stageSize.height <= 0) return;',
  '    setCameraTransition(true);',
  '    setView(centeredView(stageSize, 1));',
  '    window.setTimeout(() => setCameraTransition(false), 240);',
  '  }, [stageSize]);'
), lines(
  '  const centerNetwork = useCallback(() => {',
  '    if (stageSize.width <= 0 || stageSize.height <= 0) return;',
  '    setCameraTransition(true);',
  '    setView((current) => ({',
  '      x: stageSize.width / 2 - FOCUS_X * current.scale,',
  '      y: Math.max(88, stageSize.height * 0.32) - FOCUS_Y * current.scale,',
  '      scale: current.scale,',
  '    }));',
  '    window.setTimeout(() => setCameraTransition(false), 240);',
  '  }, [stageSize]);',
  '',
  '  const returnToYou = useCallback(() => {',
  '    if (!currentData || pendingFocus || editingLayout) return;',
  '    if (keyWallet(currentData.focusWallet) !== keyWallet(currentData.rootWallet)) {',
  "      void moveToFocus(currentData.rootWallet, 'back');",
  '      return;',
  '    }',
  '    centerNetwork();',
  '  }, [currentData, pendingFocus, editingLayout, moveToFocus, centerNetwork]);',
  '',
  '  const fitNetwork = useCallback(() => {',
  '    if (stageSize.width <= 0 || stageSize.height <= 0) return;',
  '    const points: Point[] = [',
  '      { x: FOCUS_X, y: FOCUS_Y },',
  '      ...visibleChildren.map((child) => ({ x: child.x, y: child.y })),',
  '      ...visibleGroups.map((group) => ({ x: group.x, y: group.y })),',
  '    ];',
  '    for (let index = 0; index < emptySlotCount; index += 1) {',
  '      points.push({ x: FOCUS_X + (index === 0 ? -95 : 95), y: FOCUS_Y + 184 });',
  '    }',
  '    const minX = Math.min(...points.map((point) => point.x));',
  '    const maxX = Math.max(...points.map((point) => point.x));',
  '    const minY = Math.min(...points.map((point) => point.y));',
  '    const maxY = Math.max(...points.map((point) => point.y));',
  '    const contentWidth = Math.max(220, maxX - minX + 190);',
  '    const contentHeight = Math.max(220, maxY - minY + 190);',
  '    const scale = clamp(',
  '      Math.min(1, (stageSize.width - 34) / contentWidth, (stageSize.height - 50) / contentHeight),',
  '      MIN_SCALE,',
  '      MAX_SCALE,',
  '    );',
  '    const centerX = (minX + maxX) / 2;',
  '    const centerY = (minY + maxY) / 2;',
  '    setCameraTransition(true);',
  '    setView({',
  '      x: stageSize.width / 2 - centerX * scale,',
  '      y: stageSize.height / 2 - centerY * scale,',
  '      scale,',
  '    });',
  '    window.setTimeout(() => setCameraTransition(false), 240);',
  '  }, [stageSize, visibleChildren, visibleGroups, emptySlotCount]);'
));

replaceOnce('view controls', lines(
  '        <div className="viewControls" data-no-pan="true">',
  '          <button type="button" onClick={centerNetwork} aria-label={c.centerNetwork} title={c.centerNetwork}>◎</button>',
  '          <button type="button" onClick={() => zoomByButton(1)} aria-label={c.zoomIn} title={c.zoomIn}>+</button>',
  '          <button type="button" onClick={() => zoomByButton(-1)} aria-label={c.zoomOut} title={c.zoomOut}>−</button>',
  '        </div>'
), lines(
  '        <div className="viewControls" data-no-pan="true">',
  '          <button type="button" onClick={returnToYou} aria-label={c.you} title={c.you}>◎</button>',
  '          <button type="button" className="fitButton" onClick={fitNetwork}>{w.fit}</button>',
  '          <button type="button" onClick={() => zoomByButton(1)} aria-label={c.zoomIn} title={c.zoomIn}>+</button>',
  '          <button type="button" onClick={() => zoomByButton(-1)} aria-label={c.zoomOut} title={c.zoomOut}>−</button>',
  '        </div>'
));

replaceOnce(
  'view control grid',
  '.viewControls{position:absolute;z-index:55;right:10px;bottom:10px;display:grid;grid-template-columns:repeat(3,34px);gap:5px}',
  '.viewControls{position:absolute;z-index:55;right:10px;bottom:10px;display:grid;grid-template-columns:34px auto 34px 34px;gap:5px}'
);

replaceOnce(
  'fit button style',
  '.viewControls button,.pager button{height:34px;',
  '.viewControls .fitButton{width:auto;min-width:38px;padding:0 7px;font-size:.48rem}.viewControls button,.pager button{height:34px;'
);

await writeFile(path, source);
