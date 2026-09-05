'use client';

import dynamic from 'next/dynamic';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { softFocusCloseDelay } from './SoftFocusMotion';
import { isLocale } from '@/lib/i18n/locales';
import {
  LEGAL_DOCUMENT_SHEET_OPEN_EVENT,
  type LegalDocumentReturnView,
  type LegalDocumentSheetOpenDetail,
} from '@/lib/legalDocumentSheet';
import type { LegalDocumentKind } from '@/lib/i18n/legalCopy';
import type { SupportedLocale } from '@/lib/i18n/locales';

const LegalDocumentSheet = dynamic(
  () =>
    import('./LegalDocumentSheet').then(
      (module) => module.LegalDocumentSheet,
    ),
  { ssr: false },
);

const HISTORY_MARKER = '__veinviteLegalSheet';
const ANALYTICS_VIEW_EVENT = 'veinvite-analytics-view';
const RETURN_VIEWS = new Set<LegalDocumentReturnView>([
  'home',
  'guide',
  'leaderboard',
  'settings',
]);

type SheetState = {
  kind: LegalDocumentKind;
  locale: SupportedLocale;
  returnView: LegalDocumentReturnView;
};

function isKind(value: unknown): value is LegalDocumentKind {
  return value === 'privacy' || value === 'terms';
}

function isReturnView(
  value: unknown,
): value is LegalDocumentReturnView {
  return (
    typeof value === 'string' &&
    RETURN_VIEWS.has(value as LegalDocumentReturnView)
  );
}

function readHistoryMarker(value: unknown): SheetState | null {
  if (!value || typeof value !== 'object') return null;
  const marker = (
    value as Record<string, unknown>
  )[HISTORY_MARKER];
  if (!marker || typeof marker !== 'object') return null;

  const candidate = marker as Record<string, unknown>;
  if (
    !isKind(candidate.kind) ||
    !isLocale(candidate.locale) ||
    !isReturnView(candidate.returnView)
  ) {
    return null;
  }

  return {
    kind: candidate.kind,
    locale: candidate.locale,
    returnView: candidate.returnView,
  };
}

function historyStateWithMarker(sheet: SheetState) {
  const current = window.history.state;
  const next =
    current && typeof current === 'object'
      ? { ...current }
      : {};
  return {
    ...next,
    [HISTORY_MARKER]: sheet,
  };
}

function reportAnalyticsView(
  view: LegalDocumentKind | LegalDocumentReturnView,
) {
  window.dispatchEvent(
    new CustomEvent(ANALYTICS_VIEW_EVENT, {
      detail: view,
    }),
  );
}

export function LegalDocumentSheetHost() {
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<SheetState | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const revealFrameRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearReveal = useCallback(() => {
    if (revealFrameRef.current === null) return;
    window.cancelAnimationFrame(revealFrameRef.current);
    revealFrameRef.current = null;
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const reveal = useCallback(() => {
    clearReveal();
    revealFrameRef.current = window.requestAnimationFrame(() => {
      revealFrameRef.current = null;
      setVisible(true);
    });
  }, [clearReveal]);

  const finishClose = useCallback(() => {
    clearCloseTimer();
    setSheet(null);
    sheetRef.current = null;
    setVisible(false);
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) {
      window.requestAnimationFrame(() => opener.focus());
    }
  }, [clearCloseTimer]);

  const beginClose = useCallback((
    returnView: LegalDocumentReturnView,
  ) => {
    clearReveal();
    clearCloseTimer();
    setVisible(false);
    reportAnalyticsView(returnView);
    closeTimerRef.current = window.setTimeout(
      finishClose,
      softFocusCloseDelay(),
    );
  }, [clearCloseTimer, clearReveal, finishClose]);

  const showSheet = useCallback((
    next: SheetState,
    historyMode: 'push' | 'replace' | 'none',
  ) => {
    clearCloseTimer();
    clearReveal();
    const existing = sheetRef.current;

    if (!existing) {
      openerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }

    const preserved: SheetState = existing
      ? {
          ...next,
          returnView: existing.returnView,
        }
      : next;

    if (historyMode === 'push') {
      window.history.pushState(
        historyStateWithMarker(preserved),
        '',
        window.location.href,
      );
    } else if (historyMode === 'replace') {
      window.history.replaceState(
        historyStateWithMarker(preserved),
        '',
        window.location.href,
      );
    }

    sheetRef.current = preserved;
    setSheet(preserved);
    reportAnalyticsView(preserved.kind);

    if (existing) {
      setVisible(true);
    } else {
      setVisible(false);
      reveal();
    }
  }, [clearCloseTimer, clearReveal, reveal]);

  const requestClose = useCallback(() => {
    const current = sheetRef.current;
    if (!current) return;

    if (readHistoryMarker(window.history.state)) {
      window.history.back();
      return;
    }

    beginClose(current.returnView);
  }, [beginClose]);

  useEffect(() => {
    document.documentElement.dataset.veinviteLegalSheetReady = 'true';

    const existingMarker = readHistoryMarker(window.history.state);
    if (existingMarker) {
      showSheet(existingMarker, 'none');
    }

    const onOpen = (event: Event) => {
      const detail = (
        event as CustomEvent<unknown>
      ).detail;
      if (!detail || typeof detail !== 'object') return;

      const candidate = detail as Partial<
        LegalDocumentSheetOpenDetail
      >;
      if (
        !isKind(candidate.kind) ||
        !isLocale(candidate.locale) ||
        !isReturnView(candidate.returnView)
      ) {
        return;
      }

      showSheet(
        {
          kind: candidate.kind,
          locale: candidate.locale,
          returnView: candidate.returnView,
        },
        sheetRef.current ? 'replace' : 'push',
      );
    };

    const onPopState = (event: PopStateEvent) => {
      const marker = readHistoryMarker(event.state);
      const current = sheetRef.current;

      if (marker) {
        showSheet(marker, 'none');
        return;
      }

      if (current) {
        beginClose(current.returnView);
      }
    };

    window.addEventListener(
      LEGAL_DOCUMENT_SHEET_OPEN_EVENT,
      onOpen,
    );
    window.addEventListener('popstate', onPopState);

    return () => {
      delete document.documentElement.dataset.veinviteLegalSheetReady;
      window.removeEventListener(
        LEGAL_DOCUMENT_SHEET_OPEN_EVENT,
        onOpen,
      );
      window.removeEventListener('popstate', onPopState);
      clearReveal();
      clearCloseTimer();
    };
  }, [
    beginClose,
    clearCloseTimer,
    clearReveal,
    showSheet,
  ]);

  if (!sheet) return null;

  return (
    <LegalDocumentSheet
      kind={sheet.kind}
      locale={sheet.locale}
      visible={visible}
      onRequestClose={requestClose}
    />
  );
}
