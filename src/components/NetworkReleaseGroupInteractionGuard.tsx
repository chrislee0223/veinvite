'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type TouchDraftIntent = {
  wallet: string;
  wasSelected: boolean;
  at: number;
};

type FrozenPerson = {
  person: HTMLElement;
  previousVisibility: string;
  clone: HTMLElement;
};

const TOUCH_DRAFT_WINDOW_MS = 900;
const COMMIT_FREEZE_FRAMES = 4;

export function NetworkReleaseGroupInteractionGuard({
  children,
}: {
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const touchDraftRef = useRef<TouchDraftIntent | null>(null);
  const lastPointerTypeRef = useRef('');

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let clearFrame = 0;
    let commitFrame = 0;
    let frozenPeople: FrozenPerson[] = [];

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

    const clearCommitFreeze = () => {
      if (commitFrame) {
        window.cancelAnimationFrame(commitFrame);
        commitFrame = 0;
      }
      frozenPeople.forEach(({ person, previousVisibility, clone }) => {
        if (person.isConnected) person.style.visibility = previousVisibility;
        clone.remove();
      });
      frozenPeople = [];
    };

    const releaseCommitFreezeAfterFrames = (remaining: number) => {
      if (remaining <= 0) {
        clearCommitFreeze();
        return;
      }
      commitFrame = window.requestAnimationFrame(() => {
        commitFrame = 0;
        releaseCommitFreezeAfterFrames(remaining - 1);
      });
    };

    const freezeMobileCommit = () => {
      const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
      if (lastPointerTypeRef.current !== 'touch' && !coarsePointer) return;
      clearCommitFreeze();

      const people = Array.from(root.querySelectorAll<HTMLElement>('.releasePerson[data-release-wallet]'));
      people.forEach((person) => {
        const computed = window.getComputedStyle(person);
        if (computed.display === 'none' || computed.visibility === 'hidden' || Number.parseFloat(computed.opacity || '1') <= 0.01) return;
        const rect = person.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const clone = person.cloneNode(true) as HTMLElement;
        clone.removeAttribute('id');
        clone.setAttribute('aria-hidden', 'true');
        clone.style.position = 'fixed';
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        clone.style.margin = '0';
        clone.style.transform = 'none';
        clone.style.transition = 'none';
        clone.style.animation = 'none';
        clone.style.pointerEvents = 'none';
        clone.style.visibility = 'visible';
        clone.style.opacity = computed.opacity;
        clone.style.filter = computed.filter;
        clone.style.zIndex = '2147483000';
        document.body.appendChild(clone);

        const previousVisibility = person.style.visibility;
        person.style.visibility = 'hidden';
        frozenPeople.push({ person, previousVisibility, clone });
      });

      if (frozenPeople.length) releaseCommitFreezeAfterFrames(COMMIT_FREEZE_FRAMES);
    };

    const scheduleTouchDraftCleanupIfClosed = () => {
      window.requestAnimationFrame(() => {
        if (!groupEditorOpen()) clearTouchDraftVisuals();
      });
    };

    const onPointerDownCapture = (event: PointerEvent) => {
      lastPointerTypeRef.current = event.pointerType || '';
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

      if (groupEditorOpen() && button.matches('.releaseGroupActions .primary')) {
        freezeMobileCommit();
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
      clearCommitFreeze();
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
