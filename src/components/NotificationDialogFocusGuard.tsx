'use client';

import { useEffect } from 'react';

const DIALOG_SELECTOR =
  '.notificationRoot [role="dialog"][aria-modal="true"]';
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Last-mile keyboard guard for the shared in-app notification dialog.
 *
 * Settings and cancellation dialogs already own local focus traps. The
 * notification surface historically focused its confirmation button but did
 * not keep Tab navigation inside the aria-modal dialog or restore the opener
 * after it closed. Keeping this guard outside the notification data component
 * makes the accessibility protection apply to every notification kind without
 * changing acknowledgement/reward behavior.
 */
export function NotificationDialogFocusGuard() {
  useEffect(() => {
    let activeDialog: HTMLElement | null = null;
    let previousFocus: HTMLElement | null = null;

    const focusables = (dialog: HTMLElement) =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );

    const activate = (dialog: HTMLElement) => {
      if (activeDialog === dialog) return;

      activeDialog = dialog;
      previousFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      window.requestAnimationFrame(() => {
        const items = focusables(dialog);
        const current = document.activeElement;
        if (!dialog.contains(current) && items[0]) {
          items[0].focus();
        }
      });
    };

    const deactivate = () => {
      if (!activeDialog) return;

      const restoreTarget = previousFocus;
      activeDialog = null;
      previousFocus = null;

      if (restoreTarget?.isConnected) {
        window.requestAnimationFrame(() => restoreTarget.focus());
      }
    };

    const sync = () => {
      const next = document.querySelector<HTMLElement>(DIALOG_SELECTOR);
      if (next) activate(next);
      else deactivate();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !activeDialog) return;

      const items = focusables(activeDialog);
      if (items.length === 0) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;

      if (event.shiftKey) {
        if (current === first || !activeDialog.contains(current)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (current === last || !activeDialog.contains(current)) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!activeDialog) return;
      const target = event.target;
      if (target instanceof Node && activeDialog.contains(target)) return;

      const first = focusables(activeDialog)[0];
      (first ?? activeDialog).focus();
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-modal', 'role'],
    });

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);
    sync();

    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      deactivate();
    };
  }, []);

  return null;
}