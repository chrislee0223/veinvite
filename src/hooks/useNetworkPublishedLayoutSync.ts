'use client';

import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

import {
  networkCanvasChildPoint,
  networkCanvasInviteSlotPoint,
  normalizeNetworkWallet as keyWallet,
} from '@/lib/networkCanvasGeometry';
import type {
  NetworkData,
} from '@/lib/networkDataClient';
import {
  materializeNetworkWorkspaceForPublish,
  shouldAdoptPublishedNetworkWorkspace,
} from '@/lib/networkPublishedLayout';
import {
  NetworkLayoutPublishError,
  publishNetworkLayout,
  readPublishedRevisionMap,
  writePublishedRevisionMap,
  type NetworkPublishedRevisionMap,
} from '@/lib/networkPublishedLayoutClient';
import {
  serializeNetworkWorkspaceStore,
  withFocusWorkspace,
  workspaceForFocus,
  type NetworkFocusWorkspace,
  type NetworkWorkspaceStore,
} from '@/lib/networkWorkspace';
import {
  workspaceStorageKey,
} from '@/lib/networkAppClient';

type SlotLike = {
  slot: number;
};

export function useNetworkPublishedLayoutSync({
  wallet,
  currentData,
  currentFocusKey,
  isMobile,
  inviteSlots,
  workspaceStore,
  setWorkspaceStore,
  cacheRef,
  setCacheVersion,
  setRootData,
  setWorkspaceNotice,
  noticeTimerRef,
  layoutSavedCopy,
  publicNetworkCopy,
  syncFailedCopy,
}: {
  wallet: string | null;
  currentData: NetworkData | null;
  currentFocusKey: string;
  isMobile: boolean;
  inviteSlots: SlotLike[];
  workspaceStore: NetworkWorkspaceStore;
  setWorkspaceStore: Dispatch<
    SetStateAction<NetworkWorkspaceStore>
  >;
  cacheRef: MutableRefObject<
    Map<string, NetworkData>
  >;
  setCacheVersion: Dispatch<
    SetStateAction<number>
  >;
  setRootData: Dispatch<
    SetStateAction<NetworkData | null>
  >;
  setWorkspaceNotice: Dispatch<
    SetStateAction<string>
  >;
  noticeTimerRef: MutableRefObject<
    number | null
  >;
  layoutSavedCopy: string;
  publicNetworkCopy: string;
  syncFailedCopy: string;
}) {
  const workspaceStoreRef =
    useRef<NetworkWorkspaceStore>(
      workspaceStore,
    );
  const publishedRevisionsRef =
    useRef<NetworkPublishedRevisionMap>({});
  const publishQueueRef =
    useRef<Promise<void>>(
      Promise.resolve(),
    );
  const publishableFocusRef =
    useRef<Set<string>>(new Set());

  const resetSyncState = useCallback((
    rootWallet: string | null,
    storedWorkspace: NetworkWorkspaceStore,
  ) => {
    workspaceStoreRef.current =
      storedWorkspace;
    publishedRevisionsRef.current =
      rootWallet
        ? readPublishedRevisionMap(
            rootWallet,
          )
        : {};
    publishQueueRef.current =
      Promise.resolve();
    publishableFocusRef.current =
      new Set();
  }, []);

  useEffect(() => {
    if (
      !wallet ||
      !currentFocusKey ||
      currentData
        ?.publicLayoutPublishingEnabled !==
        true ||
      !currentData.publishedLayout
    ) {
      return;
    }

    const snapshot =
      currentData.publishedLayout;
    const localRevision =
      publishedRevisionsRef
        .current[currentFocusKey] ?? 0;

    setWorkspaceStore((current) => {
      const localWorkspace =
        workspaceForFocus(
          current,
          currentFocusKey,
        );
      const shouldAdopt =
        shouldAdoptPublishedNetworkWorkspace({
          localWorkspace,
          localRevision,
          publishedRevision:
            snapshot.revision,
        });

      if (!shouldAdopt) {
        return current;
      }

      const next =
        withFocusWorkspace(
          current,
          currentFocusKey,
          snapshot.workspace,
        );
      workspaceStoreRef.current = next;

      try {
        window.localStorage.setItem(
          workspaceStorageKey(wallet),
          serializeNetworkWorkspaceStore(
            next,
          ),
        );
      } catch {
        // A published server copy still
        // protects this layout.
      }

      const revisions = {
        ...publishedRevisionsRef.current,
        [currentFocusKey]:
          snapshot.revision,
      };
      publishedRevisionsRef.current =
        revisions;
      writePublishedRevisionMap(
        wallet,
        revisions,
      );

      return next;
    });
  }, [
    wallet,
    currentFocusKey,
    currentData
      ?.publicLayoutPublishingEnabled,
    currentData?.publishedLayout,
    setWorkspaceStore,
  ]);

  const materializeForPublish =
    useCallback((
      workspace:
        NetworkFocusWorkspace,
    ) => {
      if (!currentData) {
        return workspace;
      }

      const childPoints =
        currentData.children.map(
          (child, index) => {
            const key =
              keyWallet(child.wallet);
            const fallback =
              networkCanvasChildPoint(
                child.wallet,
                index,
                isMobile,
              );
            const saved =
              workspace.positions[key];

            return {
              key,
              x:
                saved?.x ??
                fallback.x,
              y:
                saved?.y ??
                fallback.y,
            };
          },
        );

      const slotPoints =
        keyWallet(
          currentData.focusWallet,
        ) ===
        keyWallet(
          currentData.rootWallet,
        )
          ? inviteSlots.map(
              (slot) => {
                const key =
                  `slot:${slot.slot}`;
                const fallback =
                  networkCanvasInviteSlotPoint(
                    slot.slot - 1,
                  );
                const saved =
                  workspace.positions[
                    key
                  ];

                return {
                  key,
                  x:
                    saved?.x ??
                    fallback.x,
                  y:
                    saved?.y ??
                    fallback.y,
                };
              },
            )
          : [];

      return materializeNetworkWorkspaceForPublish(
        {
          workspace,
          childPoints,
          slotPoints,
        },
      );
    }, [
      currentData,
      inviteSlots,
      isMobile,
    ]);

  const setNotice =
    useCallback((
      value: string,
      duration: number,
    ) => {
      setWorkspaceNotice(value);
      if (
        noticeTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          noticeTimerRef.current,
        );
      }
      noticeTimerRef.current =
        window.setTimeout(() => {
          noticeTimerRef.current =
            null;
          setWorkspaceNotice('');
        }, duration);
    }, [
      noticeTimerRef,
      setWorkspaceNotice,
    ]);

  const queuePublishedWorkspace =
    useCallback((
      workspace:
        NetworkFocusWorkspace,
    ) => {
      if (
        !wallet ||
        !currentData ||
        !currentFocusKey ||
        currentData
          .publicLayoutPublishingEnabled !==
          true ||
        (
          !currentData.publishedLayout &&
          !publishableFocusRef.current.has(
            currentFocusKey,
          )
        )
      ) {
        return;
      }

      const rootWallet =
        keyWallet(
          currentData.rootWallet,
        );
      const focusKey =
        currentFocusKey;
      const fallbackRevision =
        currentData.publishedLayout
          ?.revision ?? 0;
      const publishWorkspace =
        materializeForPublish(
          workspace,
        );

      publishQueueRef.current =
        publishQueueRef.current
          .catch(() => undefined)
          .then(async () => {
            const expectedRevision =
              publishedRevisionsRef
                .current[focusKey] ??
              fallbackRevision;

            try {
              const snapshot =
                await publishNetworkLayout({
                  rootWallet,
                  focusWallet:
                    focusKey,
                  expectedRevision,
                  workspace:
                    publishWorkspace,
                });

              const revisions = {
                ...publishedRevisionsRef
                  .current,
                [focusKey]:
                  snapshot.revision,
              };
              publishedRevisionsRef.current =
                revisions;
              writePublishedRevisionMap(
                rootWallet,
                revisions,
              );

              const cached =
                cacheRef.current.get(
                  focusKey,
                );
              if (cached) {
                cacheRef.current.set(
                  focusKey,
                  {
                    ...cached,
                    publishedLayout:
                      snapshot,
                  },
                );
                setCacheVersion(
                  (value) =>
                    value + 1,
                );
              }

              if (
                focusKey === rootWallet
              ) {
                setRootData(
                  (current) =>
                    current &&
                    keyWallet(
                      current.focusWallet,
                    ) === focusKey
                      ? {
                          ...current,
                          publishedLayout:
                            snapshot,
                        }
                      : current,
                );
              }

              setNotice(
                `${layoutSavedCopy} · ${publicNetworkCopy}`,
                1600,
              );
            } catch (error) {
              if (
                error instanceof
                  NetworkLayoutPublishError &&
                error.code ===
                  'PUBLIC_LAYOUT_DISABLED'
              ) {
                return;
              }

              console.warn(
                'Network layout remained local because public sync failed.',
                error,
              );
              setNotice(
                `${layoutSavedCopy} · ${syncFailedCopy}`,
                2200,
              );
            }
          });
    }, [
      wallet,
      currentData,
      currentFocusKey,
      materializeForPublish,
      cacheRef,
      setCacheVersion,
      setRootData,
      setNotice,
      layoutSavedCopy,
      publicNetworkCopy,
      syncFailedCopy,
    ]);

  const persistFocusWorkspace =
    useCallback((
      workspace:
        NetworkFocusWorkspace,
    ) => {
      if (
        !wallet ||
        !currentFocusKey
      ) {
        return;
      }

      setWorkspaceStore(
        (current) => {
          const next =
            withFocusWorkspace(
              current,
              currentFocusKey,
              workspace,
            );
          workspaceStoreRef.current =
            next;

          try {
            window.localStorage.setItem(
              workspaceStorageKey(
                wallet,
              ),
              serializeNetworkWorkspaceStore(
                next,
              ),
            );
          } catch {
            // Runtime state still keeps
            // the local layout.
          }

          return next;
        },
      );

      queuePublishedWorkspace(
        workspace,
      );
    }, [
      wallet,
      currentFocusKey,
      setWorkspaceStore,
      queuePublishedWorkspace,
    ]);

  const updateWorkspaceRuntime =
    useCallback((
      update: (
        workspace:
          NetworkFocusWorkspace,
      ) => NetworkFocusWorkspace,
    ) => {
      if (!currentFocusKey) {
        return;
      }

      setWorkspaceStore(
        (current) => {
          const focusWorkspace =
            workspaceForFocus(
              current,
              currentFocusKey,
            );
          const nextWorkspace =
            update(focusWorkspace);
          if (
            nextWorkspace ===
            focusWorkspace
          ) {
            return current;
          }

          const next =
            withFocusWorkspace(
              current,
              currentFocusKey,
              nextWorkspace,
            );
          workspaceStoreRef.current =
            next;
          return next;
        },
      );
    }, [
      currentFocusKey,
      setWorkspaceStore,
    ]);

  const flushWorkspaceStore =
    useCallback(() => {
      if (!wallet) {
        return;
      }

      const current =
        workspaceStoreRef.current;

      try {
        window.localStorage.setItem(
          workspaceStorageKey(wallet),
          serializeNetworkWorkspaceStore(
            current,
          ),
        );
      } catch {
        // Runtime state still keeps
        // the local layout.
      }

      if (currentFocusKey) {
        queuePublishedWorkspace(
          workspaceForFocus(
            current,
            currentFocusKey,
          ),
        );
      }
    }, [
      wallet,
      currentFocusKey,
      queuePublishedWorkspace,
    ]);

  const markCurrentFocusPublishable =
    useCallback(() => {
      if (currentFocusKey) {
        publishableFocusRef.current.add(
          currentFocusKey,
        );
      }
    }, [currentFocusKey]);

  return {
    resetSyncState,
    markCurrentFocusPublishable,
    persistFocusWorkspace,
    updateWorkspaceRuntime,
    flushWorkspaceStore,
  };
}
