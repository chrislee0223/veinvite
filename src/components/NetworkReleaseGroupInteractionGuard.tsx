'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function NetworkReleaseGroupInteractionGuard({
  children,
}: {
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let clearFrame = 0;

    const clearCanvasSelection = () => {
      clearFrame = 0;
      if (!root.querySelector('.releasePerson.selected')) return;
      root.querySelector<HTMLButtonElement>('.releaseCenter[data-release-interactive="true"]')?.click();
    };

    const scheduleClear = () => {
      if (clearFrame) return;
      clearFrame = window.requestAnimationFrame(clearCanvasSelection);
    };

    const groupEditorOpen = () => Boolean(
      root.querySelector('.networkReleaseGroupsBoundary.releaseGroupEditing'),
    );

    const onPointerDownCapture = (event: PointerEvent) => {
      if (!groupEditorOpen()) return;
      const person = event.target instanceof Element
        ? event.target.closest('.releasePerson[data-release-wallet]')
        : null;
      if (person) scheduleClear();
    };

    const onClickCapture = (event: MouseEvent) => {
      const button = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('button')
        : null;
      if (!button || !root.contains(button)) return;

      const editButton = Boolean(
        button.closest('.releaseGroupRow') &&
        !button.classList.contains('releaseGroupRowMain') &&
        !button.classList.contains('danger'),
      );
      if (editButton || button.classList.contains('releaseCreateGroup')) {
        scheduleClear();
      }
    };

    root.addEventListener('pointerdown', onPointerDownCapture, true);
    root.addEventListener('click', onClickCapture, true);
    return () => {
      root.removeEventListener('pointerdown', onPointerDownCapture, true);
      root.removeEventListener('click', onClickCapture, true);
      if (clearFrame) window.cancelAnimationFrame(clearFrame);
    };
  }, []);

  return (
    <div ref={rootRef} className="networkReleaseGroupInteractionGuard">
      {children}
      <style jsx global>{`
        .networkReleaseGroupInteractionGuard .networkReleaseGroupsBoundary.releaseGroupEditing .releasePerson.releaseGroupDraftUnselected {
          opacity: .42 !important;
          filter: saturate(.68) !important;
        }
        .networkReleaseGroupInteractionGuard .networkReleaseGroupsBoundary.releaseGroupEditing .releasePerson.releaseGroupDraftSelected {
          opacity: 1 !important;
          filter: none !important;
          z-index: 12 !important;
        }
        .networkReleaseGroupInteractionGuard .networkReleaseGroupsBoundary.releaseGroupEditing .releasePerson {
          transition: opacity 110ms ease, filter 110ms ease !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .networkReleaseGroupInteractionGuard .networkReleaseGroupsBoundary.releaseGroupEditing .releasePerson {
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
