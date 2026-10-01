'use client';

import {
  useEffect,
  type MutableRefObject,
} from 'react';

export function usePublicNetworkSlotRetry<T>({
  ready,
  focusKey,
  slotAvailabilityKnown,
  root,
  retryAttemptedRef,
  retryControllerRef,
  fetchFocus,
  commit,
}: {
  ready: boolean;
  focusKey: string;
  slotAvailabilityKnown:
    | boolean
    | undefined;
  root: string;
  retryAttemptedRef:
    MutableRefObject<Set<string>>;
  retryControllerRef:
    MutableRefObject<
      AbortController | null
    >;
  fetchFocus: (
    rootWallet: string,
    focusWallet: string,
    signal: AbortSignal,
  ) => Promise<T>;
  commit: (value: T) => void;
}) {
  useEffect(() => {
    if (
      !ready ||
      !focusKey ||
      slotAvailabilityKnown !== false
    ) {
      return;
    }

    if (
      retryAttemptedRef.current.has(
        focusKey,
      )
    ) {
      return;
    }
    retryAttemptedRef.current.add(
      focusKey,
    );

    const controller =
      new AbortController();
    retryControllerRef.current?.abort();
    retryControllerRef.current =
      controller;

    const timer =
      window.setTimeout(async () => {
        try {
          const refreshed =
            await fetchFocus(
              root,
              focusKey,
              controller.signal,
            );
          if (
            !controller.signal.aborted
          ) {
            commit(refreshed);
          }
        } catch {
          // Slot availability is optional display metadata.
        } finally {
          if (
            retryControllerRef.current ===
            controller
          ) {
            retryControllerRef.current =
              null;
          }
        }
      }, 650);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (
        retryControllerRef.current ===
        controller
      ) {
        retryControllerRef.current =
          null;
      }
    };
  }, [
    ready,
    focusKey,
    slotAvailabilityKnown,
    root,
    retryAttemptedRef,
    retryControllerRef,
    fetchFocus,
    commit,
  ]);
}
