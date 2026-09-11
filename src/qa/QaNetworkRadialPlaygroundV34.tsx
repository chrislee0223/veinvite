'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { QaNetworkRadialPlaygroundV33 } from './QaNetworkRadialPlaygroundV33';

type Camera = { x: number; y: number };
type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  stage: HTMLElement;
  moved: boolean;
} | null;
type BackPinch = { startDistance: number; ready: boolean } | null;

const CAMERA_STORAGE_KEY = 'veinvite:qa:radial-v34:camera';
const DEFAULT_CAMERA: Camera = { x: 0, y: 0 };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function touchDistance(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function QaNetworkRadialPlaygroundV34() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<Camera>(DEFAULT_CAMERA);
  const cameraByContextRef = useRef<Record<string, Camera>>({});
  const activeContextRef = useRef('');
  const panRef = useRef<PanState>(null);
  const backChargeRef = useRef({ charge: 0, lastAt: 0 });
  const backPinchRef = useRef<BackPinch>(null);
  const backBusyRef = useRef(false);
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const [panning, setPanning] = useState(false);

  const setCameraSafe = (next: Camera, stage?: HTMLElement | null) => {
    const targetStage = stage ?? rootRef.current?.querySelector<HTMLElement>('.stage') ?? null;
    if (!targetStage) {
      cameraRef.current = next;
      setCamera(next);
      return;
    }
    const rect = targetStage.getBoundingClientRect();
    const maxX = Math.max(420, rect.width * 1.05);
    const maxY = Math.max(380, rect.height * 1.05);
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

  const currentZoom = () => {
    const text = rootRef.current?.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
    const value = Number.parseInt(text, 10);
    return Number.isFinite(value) ? Math.max(.01, value / 100) : 1;
  };

  const resetZoom = () => {
    window.setTimeout(() => rootRef.current?.querySelector<HTMLButtonElement>('.zoomValue')?.click(), 40);
  };

  const findInviterButton = () => Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('.navActions>button') ?? [])
    .find((button) => button.textContent?.includes('Inviter')) ?? null;

  const triggerBack = () => {
    if (backBusyRef.current) return false;
    const inviter = findInviterButton();
    if (!inviter || inviter.disabled) return false;
    backBusyRef.current = true;
    inviter.click();
    resetZoom();
    window.setTimeout(() => { backBusyRef.current = false; }, 900);
    return true;
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

    const syncContext = () => {
      const nextKey = readContextKey();
      if (!nextKey || nextKey === activeContextRef.current) return;
      if (activeContextRef.current) cameraByContextRef.current[activeContextRef.current] = cameraRef.current;
      activeContextRef.current = nextKey;
      const restored = cameraByContextRef.current[nextKey] ?? DEFAULT_CAMERA;
      setCameraSafe(restored);
      try { window.localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(cameraByContextRef.current)); } catch { /* QA only */ }
    };

    const frame = window.requestAnimationFrame(syncContext);
    const observer = new MutationObserver(syncContext);
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      if (activeContextRef.current) cameraByContextRef.current[activeContextRef.current] = cameraRef.current;
      try { window.localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(cameraByContextRef.current)); } catch { /* QA only */ }
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const isStageBackground = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const stage = target.closest('.stage') as HTMLElement | null;
      if (!stage || !root.contains(stage) || stage.classList.contains('editMode')) return null;
      if (target.closest('button,input,aside,.ringNode,.centerWrap,.parentNode,.traveler,.emptyHint,.arrivalNotice,.editNotice,.debugPanel,.v33SearchPanel,.v33ZoomCue')) return null;
      return stage;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const stage = isStageBackground(event.target);
      if (!stage) return;
      panRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: cameraRef.current.x,
        originY: cameraRef.current.y,
        stage,
        moved: false,
      };
      try { stage.setPointerCapture(event.pointerId); } catch { /* no-op */ }
    };

    const onPointerMove = (event: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      const dx = event.clientX - pan.startX;
      const dy = event.clientY - pan.startY;
      if (!pan.moved && Math.hypot(dx, dy) < 3) return;
      pan.moved = true;
      event.preventDefault();
      setPanning(true);
      setCameraSafe({ x: pan.originX + dx, y: pan.originY + dy }, pan.stage);
    };

    const finishPan = (event: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      try { pan.stage.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
      panRef.current = null;
      setPanning(false);
      if (activeContextRef.current) {
        cameraByContextRef.current[activeContextRef.current] = cameraRef.current;
        try { window.localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(cameraByContextRef.current)); } catch { /* QA only */ }
      }
    };

    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('pointermove', onPointerMove, true);
    root.addEventListener('pointerup', finishPan, true);
    root.addEventListener('pointercancel', finishPan, true);
    return () => {
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('pointermove', onPointerMove, true);
      root.removeEventListener('pointerup', finishPan, true);
      root.removeEventListener('pointercancel', finishPan, true);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onWheel = (event: WheelEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const stage = target?.closest('.stage') as HTMLElement | null;
      if (!stage || !root.contains(stage) || stage.classList.contains('editMode') || Math.abs(event.deltaY) < 1) return;

      const center = root.querySelector<HTMLElement>('.identity b')?.textContent?.trim() ?? 'YOU';
      const percent = Math.round(currentZoom() * 100);
      const now = Date.now();
      if (now - backChargeRef.current.lastAt > 700) backChargeRef.current.charge = 0;
      backChargeRef.current.lastAt = now;

      if (event.deltaY > 0 && center !== 'YOU') {
        const threshold = window.innerWidth <= 640 ? 82 : 80;
        if (percent <= threshold) {
          backChargeRef.current.charge += Math.min(.55, Math.max(.22, Math.abs(event.deltaY) / 180));
          if (backChargeRef.current.charge >= .68 && triggerBack()) {
            event.preventDefault();
            event.stopPropagation();
            backChargeRef.current.charge = 0;
            return;
          }
        } else {
          backChargeRef.current.charge = 0;
        }
      } else if (event.deltaY < 0) {
        backChargeRef.current.charge = 0;
      }

      const rect = stage.getBoundingClientRect();
      const pointer = { x: event.clientX - (rect.left + rect.width / 2), y: event.clientY - (rect.top + rect.height / 2) };
      const oldZoom = currentZoom();
      const oldCamera = cameraRef.current;
      window.requestAnimationFrame(() => {
        const nextZoom = currentZoom();
        if (Math.abs(nextZoom - oldZoom) < .001 || backBusyRef.current) return;
        const worldX = (pointer.x - oldCamera.x) / oldZoom;
        const worldY = (pointer.y - oldCamera.y) / oldZoom;
        setCameraSafe({ x: pointer.x - worldX * nextZoom, y: pointer.y - worldY * nextZoom }, stage);
      });
    };

    root.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => root.removeEventListener('wheel', onWheel, true);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const stage = event.target instanceof Element ? event.target.closest('.stage') : null;
      if (!stage || !root.contains(stage) || stage.classList.contains('editMode')) return;
      backPinchRef.current = { startDistance: Math.max(1, touchDistance(event.touches[0], event.touches[1])), ready: false };
    };

    const onTouchMove = (event: TouchEvent) => {
      const pinch = backPinchRef.current;
      if (!pinch || event.touches.length !== 2) return;
      const center = root.querySelector<HTMLElement>('.identity b')?.textContent?.trim() ?? 'YOU';
      if (center === 'YOU') return;
      const ratio = touchDistance(event.touches[0], event.touches[1]) / pinch.startDistance;
      if (ratio <= .78) pinch.ready = true;
    };

    const finishPinch = (event: TouchEvent) => {
      const pinch = backPinchRef.current;
      if (!pinch || event.touches.length >= 2) return;
      backPinchRef.current = null;
      if (!pinch.ready) return;
      if (triggerBack()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    root.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    root.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
    root.addEventListener('touchend', finishPinch, { capture: true, passive: false });
    root.addEventListener('touchcancel', finishPinch, { capture: true, passive: false });
    return () => {
      root.removeEventListener('touchstart', onTouchStart, true);
      root.removeEventListener('touchmove', onTouchMove, true);
      root.removeEventListener('touchend', finishPinch, true);
      root.removeEventListener('touchcancel', finishPinch, true);
    };
  }, []);

  const resetCameraFromYou = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    if (!target || target.textContent?.trim() !== '◎ YOU') return;
    setCameraSafe(DEFAULT_CAMERA);
    window.setTimeout(resetZoom, 0);
  };

  const cameraStyle = {
    '--cameraX': `${camera.x}px`,
    '--cameraY': `${camera.y}px`,
  } as CSSProperties;

  return (
    <div ref={rootRef} className={`v34Root ${panning ? 'cameraPanning' : ''}`} style={cameraStyle} onPointerDownCapture={resetCameraFromYou}>
      <QaNetworkRadialPlaygroundV33 />
      <style jsx global>{`
        .v34Root .labHeader>div:first-child::before{content:'RADIAL NETWORK PLAYGROUND · V34'!important}
        .v34Root .labHeader>div:first-child::after{content:'Free camera · focal zoom · faster zoom-out back · clean transitions'!important}
        .v34Root .scene{transform:translate3d(var(--cameraX),var(--cameraY),0) scale(var(--sceneScale))!important;transform-origin:50% 50%!important}
        .v34Root .stage{touch-action:none;cursor:grab}
        .v34Root.cameraPanning .stage{cursor:grabbing}
        .v34Root.cameraPanning .scene{transition:none!important}
        .v34Root .stage.phase-depart .ringLayer,.v34Root .stage.phase-depart .edges{opacity:0!important;pointer-events:none!important}
        .v34Root .stage.phase-depart .centerWrap{opacity:0!important;animation:none!important;pointer-events:none!important}
        .v34Root .traveler{z-index:40!important}
        .v34Root .ringNode.person.searchHit .ringCircle{animation:none!important;transform:scale(1)!important;box-shadow:0 0 34px rgba(244,183,40,.18)!important}
        .v34Root .ringNode.person.searchHit .floatInner{animation:none!important}
        @media(max-width:640px){.v34Root .stage{touch-action:none}}
        @media(prefers-reduced-motion:reduce){.v34Root .scene{transition:none!important}}
      `}</style>
    </div>
  );
}
