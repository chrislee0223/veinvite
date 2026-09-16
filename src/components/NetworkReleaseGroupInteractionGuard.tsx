'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type TouchDraftIntent = {
  wallet: string;
  wasSelected: boolean;
  at: number;
};

const TOUCH_DRAFT_WINDOW_MS = 900;

export function NetworkReleaseGroupInteractionGuard({
  children,
}: {
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const touchDraftRef = useRef<TouchDraftIntent | null>(null);

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

    const clearTouchDraftVisuals = () => {
      touchDraftRef.current = null;
      root.querySelectorAll<HTMLElement>('.releasePerson.releaseTouchDraftSelected, .releasePerson.releaseTouchDraftUnselected')
        .forEach((person) => {
          person.classList.remove('releaseTouchDraftSelected', 'releaseTouchDraftUnselected');
        });
    };

    const scheduleTouchDraftCleanupIfClosed = () => {
      window.requestAnimationFrame(() => {
        if (!groupEditorOpen()) clearTouchDraftVisuals();
      });
    };

    const onPointerDownCapture = (event: PointerEvent) => {
      if (!groupEditorOpen()) return;
      const person = event.target instanceof Element
        ? event.target.closest<HTMLElement>('.releasePerson[data-release-wallet]')
        : null;
      if (!person || !root.contains(person)) return;

      scheduleClear();
      if (event.pointerType !== 'touch') return;
      const wallet = person.dataset.releaseWallet?.toLowerCase() ?? '';
      if (!wallet) return;
      touchDraftRef.current = {
        wallet,
        wasSelected: person.classList.contains('releaseGroupDraftSelected') || person.classList.contains('releaseTouchDraftSelected'),
        at: performance.now(),
      };
    };

    const onClickCapture = (event: MouseEvent) => {
      const person = event.target instanceof Element
        ? event.target.closest<HTMLElement>('.releasePerson[data-release-wallet]')
        : null;
      if (person && root.contains(person) && groupEditorOpen()) {
        const wallet = person.dataset.releaseWallet?.toLowerCase() ?? '';
        const intent = touchDraftRef.current;
        if (
          wallet &&
          intent?.wallet === wallet &&
          performance.now() - intent.at <= TOUCH_DRAFT_WINDOW_MS
        ) {
          const nextSelected = !intent.wasSelected;
          person.classList.toggle('releaseTouchDraftSelected', nextSelected);
          person.classList.toggle('releaseTouchDraftUnselected', !nextSelected);
          touchDraftRef.current = null;
        }
      }

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
        clearTouchDraftVisuals();
        scheduleClear();
        return;
      }

      scheduleTouchDraftCleanupIfClosed();
    };

    const onPointerCancelCapture = (event: PointerEvent) => {
      if (event.pointerType === 'touch') touchDraftRef.current = null;
    };

    root.addEventListener('pointerdown', onPointerDownCapture, true);
    root.addEventListener('pointercancel', onPointerCancelCapture, true);
    root.addEventListener('click', onClickCapture, true);
    return () => {
      root.removeEventListener('pointerdown', onPointerDownCapture, true);
      root.removeEventListener('pointercancel', onPointerCancelCapture, true);
      root.removeEventListener('click', onClickCapture, true);
      if (clearFrame) window.cancelAnimationFrame(clearFrame);
      clearTouchDraftVisuals();
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
        .networkReleaseGroupInteractionGuard .networkReleaseGroupsBoundary.releaseGroupEditing .releasePerson.releaseTouchDraftUnselected {
          opacity: .42 !important;
          filter: saturate(.68) !important;
          z-index: 8 !important;
        }
        .networkReleaseGroupInteractionGuard .networkReleaseGroupsBoundary.releaseGroupEditing .releasePerson.releaseTouchDraftSelected {
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
