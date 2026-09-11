'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { QaNetworkRadialPlaygroundV34 } from './QaNetworkRadialPlaygroundV34';

type Camera = { x: number; y: number };
type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  stage: HTMLElement;
  capture: HTMLElement;
  fromNode: boolean;
  moved: boolean;
} | null;
type WheelIntent = {
  candidate: HTMLButtonElement | null;
  label: string;
  enterCharge: number;
  backCharge: number;
  lastAt: number;
};
type PinchState = {
  startDistance: number;
  lastDistance: number;
  midpointX: number;
  midpointY: number;
  candidate: HTMLButtonElement | null;
  readyEnter: boolean;
  readyBack: boolean;
} | null;

const CAMERA_STORAGE_KEY = 'veinvite:qa:radial-v35:camera';
const DEFAULT_CAMERA: Camera = { x: 0, y: 0 };
const PAN_THRESHOLD = 10;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distance(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function QaNetworkRadialPlaygroundV35() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<Camera>(DEFAULT_CAMERA);
  const cameraByContextRef = useRef<Record<string, Camera>>({});
  const activeContextRef = useRef('');
  const panRef = useRef<PanState>(null);
  const wheelRef = useRef<WheelIntent>({ candidate: null, label: '', enterCharge: 0, backCharge: 0, lastAt: 0 });
  const pinchRef = useRef<PinchState>(null);
  const navigationLockRef = useRef(false);
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const [panning, setPanning] = useState(false);

  const currentZoom = () => {
    const text = rootRef.current?.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
    const value = Number.parseInt(text, 10);
    return Number.isFinite(value) ? Math.max(.01, value / 100) : 1;
  };

  const setCameraSafe = (next: Camera, stage?: HTMLElement | null) => {
    const targetStage = stage ?? rootRef.current?.querySelector<HTMLElement>('.stage') ?? null;
    if (!targetStage) {
      cameraRef.current = next;
      setCamera(next);
      return;
    }
    const rect = targetStage.getBoundingClientRect();
    const maxX = Math.max(720, rect.width * 1.8);
    const maxY = Math.max(620, rect.height * 1.65);
    const resolved = { x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
    cameraRef.current = resolved;
    setCamera(resolved);
  };

  const readContextKey = () => {
    const root = rootRef.current;
    if (!root) return '';
    const scenario = root.querySelector<HTMLElement>('.scenarioBar button.active b')?.textContent?.trim() ?? '30명';
    const center = root.querySelector<HTMLElement>('.identity b')?.textContent?.trim() ?? 'YOU';
    return `${scenario}|${center}`;
  };

  const saveCamera = () => {
    if (!activeContextRef.current) return;
    cameraByContextRef.current[activeContextRef.current] = cameraRef.current;
    try { window.localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(cameraByContextRef.current)); } catch { /* QA only */ }
  };

  const clearWheelTarget = () => {
    const state = wheelRef.current;
    state.candidate?.classList.remove('zoomTarget');
    state.candidate = null;
    state.label = '';
    state.enterCharge = 0;
  };

  const personAt = (x: number, y: number) => {
    const root = rootRef.current;
    if (!root) return null;
    const direct = document.elementFromPoint(x, y)?.closest('button.ringNode.person') as HTMLButtonElement | null;
    if (direct && root.contains(direct)) return direct;
    let best: HTMLButtonElement | null = null;
    let bestDistance = 92;
    for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('button.ringNode.person'))) {
      const rect = button.getBoundingClientRect();
      const next = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
      if (next < bestDistance) {
        best = button;
        bestDistance = next;
      }
    }
    return best;
  };

  const zoomButton = (direction: 'in' | 'out') => {
    const buttons = rootRef.current?.querySelectorAll<HTMLButtonElement>('.zoomControls button');
    const button = direction === 'in' ? buttons?.[2] : buttons?.[0];
    if (!button || button.disabled) return false;
    button.click();
    return true;
  };

  const resetZoom = () => rootRef.current?.querySelector<HTMLButtonElement>('.zoomValue')?.click();

  const triggerEnter = (button: HTMLButtonElement) => {
    if (navigationLockRef.current || button.disabled) return false;
    navigationLockRef.current = true;
    clearWheelTarget();
    button.click();
    window.setTimeout(() => resetZoom(), 560);
    window.setTimeout(() => { navigationLockRef.current = false; }, 920);
    return true;
  };

  const triggerBack = () => {
    if (navigationLockRef.current) return false;
    const inviter = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('.navActions>button') ?? [])
      .find((button) => button.textContent?.includes('Inviter'));
    if (!inviter || inviter.disabled) return false;
    navigationLockRef.current = true;
    clearWheelTarget();
    inviter.click();
    window.setTimeout(() => resetZoom(), 560);
    window.setTimeout(() => { navigationLockRef.current = false; }, 920);
    return true;
  };

  const adjustFocalCamera = (stage: HTMLElement, clientX: number, clientY: number, oldZoom: number, oldCamera: Camera) => {
    const rect = stage.getBoundingClientRect();
    const pointerX = clientX - (rect.left + rect.width / 2);
    const pointerY = clientY - (rect.top + rect.height / 2);
    window.requestAnimationFrame(() => {
      const nextZoom = currentZoom();
      if (Math.abs(nextZoom - oldZoom) < .001 || navigationLockRef.current) return;
      const worldX = (pointerX - oldCamera.x) / oldZoom;
      const worldY = (pointerY - oldCamera.y) / oldZoom;
      setCameraSafe({ x: pointerX - worldX * nextZoom, y: pointerY - worldY * nextZoom }, stage);
    });
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CAMERA_STORAGE_KEY);
      if (raw) cameraByContextRef.current = JSON.parse(raw) as Record<string, Camera>;
    } catch {
      cameraByContextRef.current = {};
    }
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sync = () => {
      const key = readContextKey();
      if (!key || key === activeContextRef.current) return;
      if (activeContextRef.current) cameraByContextRef.current[activeContextRef.current] = cameraRef.current;
      activeContextRef.current = key;
      setCameraSafe(cameraByContextRef.current[key] ?? DEFAULT_CAMERA);
      try { window.localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(cameraByContextRef.current)); } catch { /* QA only */ }
    };
    const frame = window.requestAnimationFrame(sync);
    const observer = new MutationObserver(sync);
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      saveCamera();
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const stageFrom = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const stage = target.closest('.stage') as HTMLElement | null;
      return stage && root.contains(stage) ? stage : null;
    };

    const isTransitioning = (stage: HTMLElement) => stage.classList.contains('phase-depart') || stage.classList.contains('phase-arrive') || navigationLockRef.current;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const youButton = target?.closest('button');
      if (youButton?.textContent?.trim() === '◎ YOU') {
        setCameraSafe(DEFAULT_CAMERA);
        window.setTimeout(resetZoom, 0);
        return;
      }
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const stage = stageFrom(event.target);
      if (!stage) return;
      if (isTransitioning(stage)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (stage.classList.contains('editMode')) return;
      const node = target?.closest('button.ringNode') as HTMLButtonElement | null;
      const blocked = target?.closest('input,aside,.parentNode,.traveler,.emptyHint,.arrivalNotice,.editNotice,.debugPanel,.v33SearchPanel,.v33ZoomCue');
      if (blocked) return;
      const capture = node ?? stage;
      panRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: cameraRef.current.x,
        originY: cameraRef.current.y,
        stage,
        capture,
        fromNode: Boolean(node),
        moved: false,
      };
      try { capture.setPointerCapture(event.pointerId); } catch { /* no-op */ }
      // Background pan is owned here. Node presses continue so short tap / long-press edit still work.
      if (!node) event.stopPropagation();
    };

    const onPointerMove = (event: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      if (pan.stage.classList.contains('editMode') && pan.fromNode && !pan.moved) {
        panRef.current = null;
        setPanning(false);
        return;
      }
      const dx = event.clientX - pan.startX;
      const dy = event.clientY - pan.startY;
      if (!pan.moved && Math.hypot(dx, dy) < PAN_THRESHOLD) return;
      pan.moved = true;
      event.preventDefault();
      setPanning(true);
      setCameraSafe({ x: pan.originX + dx, y: pan.originY + dy }, pan.stage);
      // Do not stop propagation for a node: V31 sees the movement and suppresses its click/hold.
      if (!pan.fromNode) event.stopPropagation();
    };

    const finishPan = (event: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      try { pan.capture.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
      panRef.current = null;
      setPanning(false);
      if (pan.moved) saveCamera();
      if (!pan.fromNode) event.stopPropagation();
    };

    const onWheel = (event: WheelEvent) => {
      const stage = stageFrom(event.target);
      if (!stage || Math.abs(event.deltaY) < 1) return;
      event.preventDefault();
      event.stopPropagation();
      if (stage.classList.contains('editMode') || isTransitioning(stage)) return;

      const oldZoom = currentZoom();
      const oldCamera = cameraRef.current;
      const direction = event.deltaY < 0 ? 'in' : 'out';
      const now = Date.now();
      const state = wheelRef.current;
      if (now - state.lastAt > 800) {
        clearWheelTarget();
        state.backCharge = 0;
      }
      state.lastAt = now;

      if (direction === 'in') {
        state.backCharge = 0;
        const candidate = personAt(event.clientX, event.clientY);
        const label = candidate?.querySelector('b')?.textContent?.trim() ?? '';
        if (!candidate || candidate.disabled) {
          clearWheelTarget();
        } else if (state.label !== label) {
          clearWheelTarget();
          state.candidate = candidate;
          state.label = label;
          candidate.classList.add('zoomTarget');
        }
        zoomButton('in');
        adjustFocalCamera(stage, event.clientX, event.clientY, oldZoom, oldCamera);
        const percent = Math.round(oldZoom * 100);
        const threshold = window.innerWidth <= 640 ? 98 : 108;
        if (state.candidate && percent >= threshold) {
          state.enterCharge += Math.min(.58, Math.max(.24, Math.abs(event.deltaY) / 150));
          if (state.enterCharge >= .92) triggerEnter(state.candidate);
        }
        return;
      }

      clearWheelTarget();
      const center = root.querySelector<HTMLElement>('.identity b')?.textContent?.trim() ?? 'YOU';
      zoomButton('out');
      adjustFocalCamera(stage, event.clientX, event.clientY, oldZoom, oldCamera);
      if (center === 'YOU') {
        state.backCharge = 0;
        return;
      }
      const percent = Math.round(oldZoom * 100);
      if (percent <= 88) {
        state.backCharge += Math.min(.58, Math.max(.26, Math.abs(event.deltaY) / 170));
        if (state.backCharge >= .62 && triggerBack()) state.backCharge = 0;
      } else {
        state.backCharge = 0;
      }
    };

    const cancelPressedNode = () => {
      const pressed = root.querySelector<HTMLButtonElement>('.ringNode.pressing');
      if (!pressed) return;
      try { pressed.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: -1, pointerType: 'touch' })); } catch { /* no-op */ }
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const stage = stageFrom(event.target);
      if (!stage || stage.classList.contains('editMode') || isTransitioning(stage)) return;
      cancelPressedNode();
      const a = event.touches[0];
      const b = event.touches[1];
      const midpointX = (a.clientX + b.clientX) / 2;
      const midpointY = (a.clientY + b.clientY) / 2;
      pinchRef.current = {
        startDistance: Math.max(1, distance(a, b)),
        lastDistance: Math.max(1, distance(a, b)),
        midpointX,
        midpointY,
        candidate: personAt(midpointX, midpointY),
        readyEnter: false,
        readyBack: false,
      };
      pinchRef.current.candidate?.classList.add('zoomTarget');
      event.stopPropagation();
    };

    const onTouchMove = (event: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length !== 2) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      const a = event.touches[0];
      const b = event.touches[1];
      const nextDistance = Math.max(1, distance(a, b));
      const ratio = nextDistance / pinch.startDistance;
      const stepRatio = nextDistance / pinch.lastDistance;
      const midpointX = (a.clientX + b.clientX) / 2;
      const midpointY = (a.clientY + b.clientY) / 2;

      if (stepRatio >= 1.09 || stepRatio <= .91) {
        const oldZoom = currentZoom();
        const oldCamera = cameraRef.current;
        zoomButton(stepRatio > 1 ? 'in' : 'out');
        adjustFocalCamera(panRef.current?.stage ?? (stageFrom(event.target) as HTMLElement), midpointX, midpointY, oldZoom, oldCamera);
        pinch.lastDistance = nextDistance;
      }
      if (pinch.candidate && ratio >= 1.42) pinch.readyEnter = true;
      const center = root.querySelector<HTMLElement>('.identity b')?.textContent?.trim() ?? 'YOU';
      if (center !== 'YOU' && ratio <= .78) pinch.readyBack = true;
    };

    const finishPinch = (event: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length >= 2) return;
      pinch.candidate?.classList.remove('zoomTarget');
      pinchRef.current = null;
      event.stopPropagation();
      if (pinch.readyEnter && pinch.candidate && !pinch.candidate.disabled) triggerEnter(pinch.candidate);
      else if (pinch.readyBack) triggerBack();
    };

    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('pointermove', onPointerMove, true);
    root.addEventListener('pointerup', finishPan, true);
    root.addEventListener('pointercancel', finishPan, true);
    root.addEventListener('wheel', onWheel, { capture: true, passive: false });
    root.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    root.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    root.addEventListener('touchend', finishPinch, { capture: true, passive: true });
    root.addEventListener('touchcancel', finishPinch, { capture: true, passive: true });
    return () => {
      clearWheelTarget();
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('pointermove', onPointerMove, true);
      root.removeEventListener('pointerup', finishPan, true);
      root.removeEventListener('pointercancel', finishPan, true);
      root.removeEventListener('wheel', onWheel, true);
      root.removeEventListener('touchstart', onTouchStart, true);
      root.removeEventListener('touchmove', onTouchMove, true);
      root.removeEventListener('touchend', finishPinch, true);
      root.removeEventListener('touchcancel', finishPinch, true);
    };
  }, []);

  const cameraStyle = {
    '--camera35X': `${camera.x}px`,
    '--camera35Y': `${camera.y}px`,
  } as CSSProperties;

  return (
    <div ref={rootRef} className={`v35Root ${panning ? 'cameraPanning35' : ''}`} style={cameraStyle}>
      <QaNetworkRadialPlaygroundV34 />
      <style jsx global>{`
        .v35Root .labHeader>div:first-child::before{content:'RADIAL NETWORK PLAYGROUND · V35'!important}
        .v35Root .labHeader>div:first-child::after{content:'Unified gestures · drag from nodes · restored search pulse · transition lock'!important}
        .v35Root .scene{transform:translate3d(var(--camera35X),var(--camera35Y),0) scale(var(--sceneScale))!important;transform-origin:50% 50%!important}
        .v35Root .stage{cursor:grab;touch-action:none!important}
        .v35Root .ringNode{cursor:grab}
        .v35Root .stage.editMode .ringNode{cursor:move}
        .v35Root.cameraPanning35 .stage,.v35Root.cameraPanning35 .ringNode{cursor:grabbing!important}
        .v35Root.cameraPanning35 .scene{transition:none!important}

        /* Search opens without browser zoom, while the located person gets the original visual pulse back. */
        .v35Root .v33SearchPanel input{font-size:16px!important}
        .v35Root .ringNode.person.searchHit .floatInner{animation:v35SearchPulse 1.55s ease-in-out 1!important}
        .v35Root .ringNode.person.searchHit .ringCircle{border-color:rgba(244,183,40,.95)!important;box-shadow:0 0 40px rgba(244,183,40,.22)!important}
        @keyframes v35SearchPulse{0%,100%{transform:scale(1)}35%{transform:scale(1.13)}65%{transform:scale(1.05)}}

        @media(prefers-reduced-motion:reduce){
          .v35Root .ringNode.person.searchHit .floatInner{animation:none!important}
          .v35Root .scene{transition:none!important}
        }
      `}</style>
    </div>
  );
}
