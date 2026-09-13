'use client';

import { useEffect, useRef } from 'react';

import { QaNetworkRadialPlaygroundV44 } from './QaNetworkRadialPlaygroundV44';

const POSITION_STORAGE_KEY = 'veinvite:qa:radial-v37:positions-v2';
const MAX_GROUP_NAME = 24;

function activeScenarioId(root: HTMLElement) {
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
  return map[label] ?? '';
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

function uniqueGroupName(rawName: string, existingNames: string[]) {
  const raw = rawName.trim().slice(0, MAX_GROUP_NAME);
  if (!raw) return raw;
  const used = new Set(existingNames.map(normalized).filter(Boolean));
  if (!used.has(normalized(raw))) return raw;

  for (let suffixNumber = 2; suffixNumber < 10000; suffixNumber += 1) {
    const suffix = ` (${suffixNumber})`;
    const baseLength = Math.max(1, MAX_GROUP_NAME - suffix.length);
    const base = raw.slice(0, baseLength).trimEnd() || raw.slice(0, 1);
    const candidate = `${base}${suffix}`.slice(0, MAX_GROUP_NAME);
    if (!used.has(normalized(candidate))) return candidate;
  }

  return `${raw.slice(0, MAX_GROUP_NAME - 4)} (2)`;
}

function syncPersistedManualMarkers(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>('.stage');
  const editing = Boolean(stage?.classList.contains('editMode'));
  const compact = window.innerWidth <= 640;
  const device = compact ? 'mobile' : 'desktop';
  const scenario = activeScenarioId(root);

  let keys: string[] = [];
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      keys = Object.keys(parsed);
    }
  } catch {
    keys = [];
  }

  root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]').forEach((node) => {
    const id = node.dataset.nodeId;
    if (!id) return;
    const persisted = keys.some((key) =>
      (!scenario || key.startsWith(`${scenario}|`)) &&
      key.includes(`|${device}|person|${id}`),
    );

    if (persisted) {
      node.dataset.v39Manual = '1';
      node.dataset.v45PersistedManual = '1';
      return;
    }

    if (!editing && node.dataset.v45PersistedManual === '1') {
      delete node.dataset.v45PersistedManual;
      delete node.dataset.v39Manual;
    }
  });
}

function protectGroupNameBeforeSubmit(root: HTMLElement, button: HTMLButtonElement) {
  const panel = button.closest<HTMLElement>('.v42GroupPanel');
  if (!panel) return;
  const label = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  if (label !== 'Create' && label !== 'Save changes') return;
  const input = panel.querySelector<HTMLInputElement>('input');
  if (!input) return;

  const raw = input.value.trim();
  if (!raw) return;

  const names = Array.from(root.querySelectorAll<HTMLElement>('.v42GroupRowMain b'))
    .map((item) => item.textContent?.trim() ?? '')
    .filter(Boolean);

  if (label === 'Save changes') {
    const heading = panel.querySelector<HTMLElement>('.v42PanelHead b')?.textContent?.trim() ?? '';
    const originalName = heading.replace(/^Edit\s+/, '');
    const ownIndex = names.findIndex((name) => name === originalName);
    if (ownIndex >= 0) names.splice(ownIndex, 1);
  }

  const next = uniqueGroupName(raw, names);
  if (next !== input.value) setInputValue(input, next);
}

export function QaNetworkRadialPlaygroundV45() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => {
      frameRef.current = null;
      syncPersistedManualMarkers(root);
      const title = root.querySelector<HTMLElement>('.labHeader strong');
      const subtitle = root.querySelector<HTMLElement>('.labHeader > div:first-child span');
      if (title && title.textContent !== 'RADIAL NETWORK PLAYGROUND · V45') title.textContent = 'RADIAL NETWORK PLAYGROUND · V45';
      if (subtitle && subtitle.textContent !== 'Stability pass · saved layout safety · safer group naming · lighter rendering') {
        subtitle.textContent = 'Stability pass · saved layout safety · safer group naming · lighter rendering';
      }
    };

    const schedule = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(sync);
    };

    const onClickCapture = (event: MouseEvent) => {
      const button = event.target instanceof Element
        ? event.target.closest('button') as HTMLButtonElement | null
        : null;
      if (!button || !root.contains(button)) return;
      protectGroupNameBeforeSubmit(root, button);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    root.addEventListener('click', onClickCapture, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('storage', schedule);
    sync();

    return () => {
      observer.disconnect();
      root.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('storage', schedule);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div ref={rootRef} className="v45StabilityRoot">
      <QaNetworkRadialPlaygroundV44 />
      <style jsx global>{`
        .v45StabilityRoot .personNode{will-change:auto!important}
        .v45StabilityRoot .stage.editMode .personNode{will-change:transform!important}
        .v45StabilityRoot .v42GroupPanel,
        .v45StabilityRoot .v44NewGroupDrop,
        .v45StabilityRoot .v42GroupHub{backface-visibility:hidden}
        @media(prefers-reduced-motion:reduce){
          .v45StabilityRoot .personNode{will-change:auto!important}
        }
      `}</style>
    </div>
  );
}
