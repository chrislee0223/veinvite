'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV63 } from './AppNetworkCanaryV63';

function NetworkIOSSelectionGuardV64() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!root || !stage) return;

    const isEditable = (target: EventTarget | Node | null) => {
      const element = target instanceof Element
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;
      return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
    };

    const clearStageSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
      const anchor = selection.anchorNode;
      if (!anchor || !stage.contains(anchor) || isEditable(document.activeElement)) return;
      selection.removeAllRanges();
    };

    const blockNativeSelection = (event: Event) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!target || !stage.contains(target) || isEditable(target)) return;
      if (event.cancelable) event.preventDefault();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      const target = event.target instanceof Node ? event.target : null;
      if (!target || !stage.contains(target) || isEditable(target)) return;
      clearStageSelection();
    };

    const onSelectionChange = () => {
      clearStageSelection();
    };

    root.addEventListener('selectstart', blockNativeSelection, true);
    root.addEventListener('contextmenu', blockNativeSelection, true);
    root.addEventListener('dragstart', blockNativeSelection, true);
    root.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('selectionchange', onSelectionChange);

    return () => {
      root.removeEventListener('selectstart', blockNativeSelection, true);
      root.removeEventListener('contextmenu', blockNativeSelection, true);
      root.removeEventListener('dragstart', blockNativeSelection, true);
      root.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, []);

  return null;
}

export function AppNetworkCanaryV64({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV63 locale={locale} />
      <NetworkIOSSelectionGuardV64 />
      <style jsx global>{`
        /* The Network is an interactive canvas, not selectable document text.
           iOS Safari/WebViews otherwise show native selection handles and the
           Copy / Look Up / Translate callout during long-press or drag. */
        .productionNetworkCanaryV45 .stage,
        .productionNetworkCanaryV45 .stage * {
          -webkit-user-select: none !important;
          user-select: none !important;
          -webkit-touch-callout: none !important;
        }

        /* Keep real editor controls fully editable/selectable. */
        .productionNetworkCanaryV45 .stage input,
        .productionNetworkCanaryV45 .stage textarea,
        .productionNetworkCanaryV45 .stage select,
        .productionNetworkCanaryV45 .stage [contenteditable="true"] {
          -webkit-user-select: text !important;
          user-select: text !important;
          -webkit-touch-callout: default !important;
        }
      `}</style>
    </>
  );
}
