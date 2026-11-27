'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

// DOM-only scroll anchoring; never performs network requests or wallet actions.
export function useNotificationHistoryScrollAnchor(
  visible: boolean,
  content: unknown,
  clock: number,
  receiptActive: boolean,
) {
  const scrollPositionRef = useRef(0);
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollAnchorRef = useRef<{ id: string; offset: number } | null>(null);
  const captureScrollAnchor = useCallback((node: HTMLDivElement) => {
    const top = node.getBoundingClientRect().top;
    const first = Array.from(node.querySelectorAll<HTMLElement>('[data-history-id]'))
      .find(row => row.getBoundingClientRect().bottom > top);
    scrollAnchorRef.current = node.scrollTop > 2 && first?.dataset.historyId
      ? { id: first.dataset.historyId, offset: first.getBoundingClientRect().top - top } : null;
    scrollPositionRef.current = node.scrollTop;
  }, []);
  const restoreHistoryScroll = useCallback((node: HTMLDivElement | null) => {
    historyScrollRef.current = node;
    if (node) node.scrollTop = scrollPositionRef.current;
  }, []);

  const resetScrollAnchor = useCallback(() => {
    scrollPositionRef.current = 0;
    scrollAnchorRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const node = historyScrollRef.current;
    if (!node) return;
    const anchor = scrollAnchorRef.current;
    if (anchor) {
      const row = Array.from(node.querySelectorAll<HTMLElement>('[data-history-id]'))
        .find(element => element.dataset.historyId === anchor.id);
      if (row) node.scrollTop += row.getBoundingClientRect().top - node.getBoundingClientRect().top - anchor.offset;
    }
    captureScrollAnchor(node);
  }, [content, visible, clock, receiptActive, captureScrollAnchor]);
  return { captureScrollAnchor, restoreHistoryScroll, resetScrollAnchor };
}
