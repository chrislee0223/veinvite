import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/components/AppNetwork.tsx';
let source = await readFile(path, 'utf8');
const lines = (...items) => items.join('\n');

function replaceOnce(label, from, to) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  source = source.replace(from, to);
}

replaceOnce('group drop function', lines(
  '  const finishWorkspaceDrop = useCallback((event: ReactPointerEvent<HTMLDivElement>, drag: WorkspaceDrag) => {',
  "    if (drag.kind !== 'node' || event.type !== 'pointerup') return;",
  '',
  '    const stage = stageRef.current;',
  '    if (stage) {',
  "      const targets = Array.from(stage.querySelectorAll<HTMLElement>('[data-group-drop-id]'));",
  '      const target = targets.find((element) => {',
  '        const rect = element.getBoundingClientRect();',
  '        return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;',
  '      });',
  '      const targetId = target?.dataset.groupDropId;',
  '      if (targetId) {',
  '        setDraftWorkspace((current) => current ? moveWorkspaceMemberToGroup(current, drag.key, targetId) : current);',
  '        return;',
  '      }',
  '    }',
  '',
  '    if (!groupDraft) return;',
  '    const drop = groupDropRef.current?.getBoundingClientRect();',
  '    if (!drop) return;',
  '    const inside = event.clientX >= drop.left && event.clientX <= drop.right && event.clientY >= drop.top && event.clientY <= drop.bottom;',
  '    if (!inside || groupDraft.members.includes(drag.key)) return;',
  '    setGroupingWallet(drag.key);',
  '    if (groupingTimerRef.current !== null) window.clearTimeout(groupingTimerRef.current);',
  '    groupingTimerRef.current = window.setTimeout(() => {',
  '      groupingTimerRef.current = null;',
  '      setGroupDraft((current) => {',
  '        if (!current || current.members.includes(drag.key)) return current;',
  '        return { ...current, members: [...current.members, drag.key] };',
  '      });',
  '      setGroupingWallet(null);',
  '    }, GROUP_DROP_MS);',
  '  }, [groupDraft]);'
), lines(
  '  const finishWorkspaceDrop = useCallback((event: ReactPointerEvent<HTMLDivElement>, drag: WorkspaceDrag) => {',
  "    if (drag.kind !== 'node' || event.type !== 'pointerup') return;",
  '',
  '    const draftRect = groupDropRef.current?.getBoundingClientRect();',
  '    const insideDraft = Boolean(',
  '      groupDraft &&',
  '      draftRect &&',
  '      event.clientX >= draftRect.left &&',
  '      event.clientX <= draftRect.right &&',
  '      event.clientY >= draftRect.top &&',
  '      event.clientY <= draftRect.bottom',
  '    );',
  '    if (insideDraft && groupDraft && !groupDraft.members.includes(drag.key)) {',
  '      setGroupingWallet(drag.key);',
  '      if (groupingTimerRef.current !== null) window.clearTimeout(groupingTimerRef.current);',
  '      groupingTimerRef.current = window.setTimeout(() => {',
  '        groupingTimerRef.current = null;',
  '        setGroupDraft((current) => {',
  '          if (!current || current.members.includes(drag.key)) return current;',
  '          return { ...current, members: [...current.members, drag.key] };',
  '        });',
  '        setGroupingWallet(null);',
  '      }, GROUP_DROP_MS);',
  '      return;',
  '    }',
  '',
  '    const stage = stageRef.current;',
  '    if (!stage) return;',
  '    const rect = stage.getBoundingClientRect();',
  '    const worldPoint = {',
  '      x: (event.clientX - rect.left - view.x) / view.scale,',
  '      y: (event.clientY - rect.top - view.y) / view.scale,',
  '    };',
  '    const targetGroup = nearestVisibleGroup(worldPoint);',
  '    if (!targetGroup) return;',
  '    setDraftWorkspace((current) => current',
  '      ? moveWorkspaceMemberToGroup(current, drag.key, targetGroup.id)',
  '      : current);',
  '  }, [groupDraft, view, nearestVisibleGroup]);'
));

if (/querySelectorAll<HTMLElement>\('\[data-group-drop-id\]'\)/.test(source)) {
  throw new Error('DOM group hit-test remained after coordinate-owned patch');
}

await writeFile(path, source);
