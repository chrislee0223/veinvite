'use client';

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Brand } from './Brand';

/**
 * InviteeClient remains fully mounted and authoritative for invite progress,
 * mission reconciliation and errors. This boundary changes only first-paint
 * visibility: it keeps the stable brand surface until the first meaningful
 * invite screen is resolved, then releases once and never re-arms.
 */
export function InviteInitialVisualBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [released, setReleased] = useState(false);

  useEffect(() => {
    if (released) {
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;

    const cancelLandingRelease = () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      firstFrame = 0;
      secondFrame = 0;
    };

    const release = () => {
      cancelLandingRelease();
      setReleased(true);
    };

    const hasResolvedScreen = () => {
      const root = rootRef.current;
      if (!root) {
        return false;
      }

      return Boolean(
        root.querySelector(
          [
            '.continueButton',
            '.appShell',
            '.reviewIcon',
            '.errorIcon',
            '.walletVisual',
            '.successCircle',
            '.spinnerLarge',
          ].join(','),
        ),
      );
    };

    const hasLoadedLanding = () =>
      Boolean(
        rootRef.current?.querySelector(
          'button.startButton:not(:disabled)',
        ),
      );

    const inspect = () => {
      if (hasResolvedScreen()) {
        release();
        return;
      }

      if (!hasLoadedLanding() || firstFrame) {
        return;
      }

      // InviteeClient can commit a loaded landing and then move an already
      // participating wallet to missions/review in its passive effect. Give
      // that effect two paint opportunities before accepting landing as final.
      firstFrame = window.requestAnimationFrame(() => {
        firstFrame = 0;
        secondFrame = window.requestAnimationFrame(() => {
          secondFrame = 0;

          if (hasResolvedScreen() || hasLoadedLanding()) {
            release();
          }
        });
      });
    };

    const observer = new MutationObserver(() => {
      cancelLandingRelease();
      inspect();
    });

    if (rootRef.current) {
      observer.observe(rootRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'class'],
      });
    }

    inspect();

    return () => {
      observer.disconnect();
      cancelLandingRelease();
    };
  }, [released]);

  return (
    <div
      ref={rootRef}
      data-veinvite-invite-initial-visual={
        released ? 'released' : 'pending'
      }
      style={{
        minHeight: '100dvh',
        position: 'relative',
      }}
    >
      <div
        style={{
          visibility: released ? 'visible' : 'hidden',
        }}
        aria-hidden={released ? undefined : true}
      >
        {children}
      </div>

      {!released ? (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 30,
            display: 'grid',
            placeItems: 'center',
            background:
              'radial-gradient(circle at 50% 38%, rgba(244,183,40,0.10), transparent 32%), #080807',
          }}
        >
          <Brand compact />
        </div>
      ) : null}
    </div>
  );
}
