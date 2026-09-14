'use client';

import { useLayoutEffect } from 'react';

import {
  getLocaleDirection,
  isLocale,
  type Locale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { NETWORK_CANVAS_CONTROL_COPY } from '@/lib/i18n/networkCanvasControlCopy';
import { NETWORK_EXPERIENCE_COPY } from '@/lib/i18n/networkExperienceCopy';
import { NETWORK_EXPLORE_COPY } from '@/lib/i18n/networkExploreCopy';
import { AppNetworkCanaryV69 } from './AppNetworkCanaryV69';

function resolveLocale(locale: Locale): SupportedLocale {
  return isLocale(locale) ? locale : 'en';
}

function NetworkLocalePresentationV70({ locale }: { locale: Locale }) {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    if (!root) return;

    const resolvedLocale = resolveLocale(locale);
    const direction = getLocaleDirection(resolvedLocale);
    const controls = NETWORK_CANVAS_CONTROL_COPY[resolvedLocale];
    const experience = NETWORK_EXPERIENCE_COPY[resolvedLocale];
    const explore = NETWORK_EXPLORE_COPY[resolvedLocale];
    let frame = 0;

    root.dataset.v70Direction = direction;

    const setPresentation = (element: HTMLElement | null, value: string) => {
      if (!element || !value) return;
      element.dataset.v65UiCopy = value;
      element.classList.add('v65LocalizedUiCopy');
      element.dir = direction;
    };

    const clearRootPresentation = (element: HTMLElement) => {
      if (element.dataset.v70RootLabel !== '1') return;
      delete element.dataset.v70RootLabel;
      delete element.dataset.v65UiCopy;
      element.classList.remove('v65LocalizedUiCopy');
      element.removeAttribute('dir');
    };

    const localizeRootIdentity = () => {
      root.querySelectorAll<HTMLElement>('.centerWrap > b,.identity > b,.crumbs button').forEach((element) => {
        const raw = element.textContent?.trim() ?? '';
        if (raw === 'YOU') {
          setPresentation(element, controls.you);
          element.dataset.v70RootLabel = '1';
          return;
        }
        clearRootPresentation(element);
      });
    };

    const localizeDirectionalActions = () => {
      const backArrow = direction === 'rtl' ? '→' : '←';
      const forwardArrow = direction === 'rtl' ? '←' : '→';

      root.querySelectorAll<HTMLElement>('.navActions > button').forEach((button) => {
        if (button.textContent?.trim() === '← Inviter') {
          setPresentation(button, `${backArrow} ${experience.invitedBy}`);
        }
      });

      const viewNetwork = root.querySelector<HTMLElement>('.profileCard .viewNetwork');
      if (viewNetwork?.textContent?.trim() === 'View this network →') {
        setPresentation(viewNetwork, `${explore.openNetwork} ${forwardArrow}`);
      }
    };

    const apply = () => {
      localizeRootIdentity();
      localizeDirectionalActions();
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    };

    apply();

    const observer = new MutationObserver(() => schedule());
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      delete root.dataset.v70Direction;
    };
  }, [locale]);

  return null;
}

export function AppNetworkCanaryV70({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV69 locale={locale} />
      <NetworkLocalePresentationV70 locale={locale} />
      <style jsx global>{`
        /* V70 owns only translated text presentation. It deliberately avoids
           person/slot/group coordinates, transforms, edge paths and persistence. */
        .productionNetworkCanaryV45 .networkTop {
          padding-block: 8px !important;
          padding-inline: 10px !important;
          gap: 8px !important;
        }

        .productionNetworkCanaryV45 .identity {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          padding-inline-start: 6px;
          padding-inline-end: 2px;
          row-gap: 4px !important;
          column-gap: 8px !important;
          align-items: baseline !important;
          justify-content: flex-start !important;
          text-align: start;
          line-height: 1.25;
        }

        .productionNetworkCanaryV45 .identity > :is(b, span) {
          min-width: 0;
          white-space: nowrap !important;
        }

        .productionNetworkCanaryV45 .identity > span:last-child {
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .productionNetworkCanaryV45 .v42PanelHead > div,
        .productionNetworkCanaryV45 .v42GroupRowMain,
        .productionNetworkCanaryV45 .profileCard > div {
          min-width: 0;
        }

        .productionNetworkCanaryV45 :is(
          .identity,
          .navActions,
          .canaryViewActions,
          .v42GroupPanel,
          .hint,
          .notice,
          .v42Notice,
          .profileCard
        ) .v65LocalizedUiCopy::after,
        .productionNetworkCanaryV45 :is(
          .hint.v65LocalizedUiCopy,
          .notice.v65LocalizedUiCopy
        )::after {
          line-height: inherit !important;
        }

        .productionNetworkCanaryV45 .navActions > button:not(.zoomValue),
        .productionNetworkCanaryV45 .v42GroupToolbarButton,
        .productionNetworkCanaryV45 .canaryViewActions button {
          height: auto !important;
          min-height: 32px !important;
          padding-block: 5px !important;
          padding-inline: 8px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          line-height: 1.25 !important;
          white-space: nowrap !important;
        }

        .productionNetworkCanaryV45 .navActions .zoomValue {
          height: auto !important;
          min-height: 32px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          line-height: 1 !important;
        }

        .productionNetworkCanaryV45 .v42GroupToolbarButton {
          margin-left: 0 !important;
          margin-right: 0 !important;
          margin-inline-start: auto !important;
        }

        .productionNetworkCanaryV45 .centerWrap > b,
        .productionNetworkCanaryV45 .centerWrap > small,
        .productionNetworkCanaryV45 .personNode > b,
        .productionNetworkCanaryV45 .personNode > small,
        .productionNetworkCanaryV45 .slotNode > b,
        .productionNetworkCanaryV45 .v42GroupHub > b,
        .productionNetworkCanaryV45 .v42GroupHub > small {
          white-space: nowrap !important;
        }

        .productionNetworkCanaryV45 .centerWrap > b,
        .productionNetworkCanaryV45 .centerWrap > small {
          text-align: center !important;
          unicode-bidi: plaintext;
        }

        .productionNetworkCanaryV45 .centerWrap > small {
          max-width: 220px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .productionNetworkCanaryV45 .personNode > small {
          max-width: 112px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .productionNetworkCanaryV45 .v42GroupHub {
          text-align: start !important;
        }

        .productionNetworkCanaryV45 .v42GroupHub > small {
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .productionNetworkCanaryV45 .v42GroupPanel {
          left: auto !important;
          right: auto !important;
          inset-inline-start: 10px !important;
          width: min(326px, calc(100% - 20px)) !important;
          max-width: calc(100% - 20px) !important;
          padding: 10px !important;
        }

        .productionNetworkCanaryV45 .v42PanelHead {
          align-items: flex-start !important;
          gap: 8px !important;
        }

        .productionNetworkCanaryV45 .v42PanelHead > div {
          flex: 1 1 auto;
          gap: 3px !important;
        }

        .productionNetworkCanaryV45 .v42PanelHead :is(b, small) {
          display: block;
          max-width: 100%;
          white-space: normal !important;
          line-height: 1.35 !important;
          text-align: start !important;
        }

        .productionNetworkCanaryV45 .v42PanelHead > button,
        .productionNetworkCanaryV45 .v42DeleteGroup {
          flex: 0 0 auto;
        }

        .productionNetworkCanaryV45 .v42CreateButton,
        .productionNetworkCanaryV45 .v42CreateActions button,
        .productionNetworkCanaryV45 .v42ManageGroup,
        .productionNetworkCanaryV45 .profileCard .viewNetwork {
          height: auto !important;
          min-height: 34px !important;
          padding-block: 6px !important;
          padding-inline: 8px !important;
          line-height: 1.3 !important;
          white-space: normal !important;
          text-align: center !important;
          overflow-wrap: normal;
          word-break: normal;
        }

        .productionNetworkCanaryV45 .v42GroupRow {
          grid-template-columns: minmax(0, 1fr) fit-content(104px) 30px !important;
          align-items: stretch !important;
          gap: 5px !important;
        }

        .productionNetworkCanaryV45 .v42GroupRowMain {
          height: auto !important;
          text-align: start !important;
          align-content: center;
        }

        .productionNetworkCanaryV45 .v42GroupRowMain > b {
          min-width: 0;
        }

        .productionNetworkCanaryV45 .v42GroupRowMain > small {
          white-space: normal !important;
          line-height: 1.3 !important;
          text-align: start !important;
        }

        .productionNetworkCanaryV45 .v42ManageGroup {
          max-width: 104px;
          align-self: stretch;
        }

        .productionNetworkCanaryV45 .v42SelectionCount {
          flex-wrap: wrap !important;
          align-items: baseline !important;
          column-gap: 6px !important;
          row-gap: 1px !important;
        }

        .productionNetworkCanaryV45 .v42SelectionCount > span {
          min-width: 0;
          line-height: 1.35 !important;
          text-align: start !important;
        }

        .productionNetworkCanaryV45 .v42GroupPanel input {
          text-align: start !important;
          padding-inline: 10px !important;
        }

        .productionNetworkCanaryV45 .v42CreateActions {
          align-items: stretch;
        }

        .productionNetworkCanaryV45 .v44NewGroupDrop,
        .productionNetworkCanaryV45 .v44CreateDropMore {
          height: auto !important;
          min-height: 46px !important;
          text-align: start !important;
        }

        .productionNetworkCanaryV45 .v44NewGroupDrop :is(b, small),
        .productionNetworkCanaryV45 .v44CreateDropMore :is(b, small),
        .productionNetworkCanaryV45 .v42EmptyGroups {
          white-space: normal !important;
          line-height: 1.35 !important;
          text-align: start !important;
        }

        .productionNetworkCanaryV45 .hint {
          width: max-content;
          max-width: min(88%, 440px) !important;
          box-sizing: border-box;
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
          text-align: center !important;
          line-height: 1.35 !important;
        }

        .productionNetworkCanaryV45 .notice,
        .productionNetworkCanaryV45 .v42Notice {
          max-width: calc(100% - 24px) !important;
          box-sizing: border-box;
          white-space: normal !important;
          text-overflow: clip !important;
          line-height: 1.35 !important;
          text-align: start !important;
        }

        .productionNetworkCanaryV45 .v42Notice > span {
          min-width: 0;
        }

        .productionNetworkCanaryV45 .v42Notice > button {
          flex: 0 0 auto;
          height: auto !important;
          min-height: 27px !important;
          padding-block: 4px !important;
        }

        .productionNetworkCanaryV45 .profileCard {
          right: auto !important;
          left: auto !important;
          inset-inline-end: 12px !important;
        }

        .productionNetworkCanaryV45 .profileCard .viewNetwork {
          width: 100%;
        }

        .productionNetworkCanaryV45[data-v70-direction='rtl'] .identity {
          direction: rtl;
        }

        .productionNetworkCanaryV45[data-v70-direction='rtl'] .navActions > button:has(+ .zoomValue) {
          margin-left: 0 !important;
          margin-right: 5px !important;
          border-radius: 3px 8px 8px 3px !important;
        }

        .productionNetworkCanaryV45[data-v70-direction='rtl'] .navActions .zoomValue + button {
          border-radius: 8px 3px 3px 8px !important;
        }

        .productionNetworkCanaryV45[data-v70-direction='rtl'] :is(
          .v42GroupRowMain,
          .v42PanelHead :is(b, small),
          .v42SelectionCount > span,
          .v44NewGroupDrop,
          .v44CreateDropMore,
          .v42EmptyGroups,
          .notice,
          .v42Notice
        ) {
          text-align: start !important;
        }

        html[data-locale-typography='arabic'] .productionNetworkCanaryV45 :is(
          .navActions > button:not(.zoomValue),
          .v42GroupToolbarButton,
          .canaryViewActions button,
          .v42CreateButton,
          .v42CreateActions button,
          .v42ManageGroup,
          .profileCard .viewNetwork
        ),
        html[data-locale-typography='indic'] .productionNetworkCanaryV45 :is(
          .navActions > button:not(.zoomValue),
          .v42GroupToolbarButton,
          .canaryViewActions button,
          .v42CreateButton,
          .v42CreateActions button,
          .v42ManageGroup,
          .profileCard .viewNetwork
        ) {
          min-height: 36px !important;
          padding-block: 7px !important;
          line-height: 1.45 !important;
        }

        html[lang='ur'] .productionNetworkCanaryV45 :is(
          .navActions > button:not(.zoomValue),
          .v42GroupToolbarButton,
          .canaryViewActions button,
          .v42CreateButton,
          .v42CreateActions button,
          .v42ManageGroup,
          .profileCard .viewNetwork
        ) {
          min-height: 38px !important;
          padding-block: 8px !important;
          line-height: 1.55 !important;
        }

        html[lang='ko'] .productionNetworkCanaryV45 :is(
          .v42PanelHead :is(b, small),
          .v42GroupRowMain > small,
          .v42SelectionCount > span,
          .v44NewGroupDrop :is(b, small),
          .v44CreateDropMore :is(b, small),
          .hint,
          .notice,
          .v42Notice
        ) {
          word-break: keep-all !important;
          overflow-wrap: normal !important;
        }

        html:is([lang='zh'],[lang='zh-tw'],[lang='ja']) .productionNetworkCanaryV45 :is(
          .v42PanelHead :is(b, small),
          .v42GroupRowMain > small,
          .v42SelectionCount > span,
          .v44NewGroupDrop :is(b, small),
          .v44CreateDropMore :is(b, small),
          .hint,
          .notice,
          .v42Notice
        ) {
          line-break: strict;
          word-break: normal !important;
          overflow-wrap: normal !important;
        }

        @media (max-width: 640px) {
          .productionNetworkCanaryV45 .networkTop {
            padding-inline: 9px !important;
          }

          .productionNetworkCanaryV45 .v42GroupPanel {
            inset-inline-start: 9px !important;
            width: calc(100% - 18px) !important;
            max-width: calc(100% - 18px) !important;
          }

          .productionNetworkCanaryV45 .profileCard {
            inset-inline-end: 9px !important;
          }

          .productionNetworkCanaryV45 .v42ManageGroup {
            max-width: 96px;
          }

          .productionNetworkCanaryV45 .hint {
            max-width: calc(100% - 28px) !important;
          }
        }

        @media (max-width: 380px) {
          .productionNetworkCanaryV45 .v42GroupRow {
            grid-template-columns: minmax(0, 1fr) fit-content(88px) 28px !important;
            gap: 4px !important;
          }

          .productionNetworkCanaryV45 .v42ManageGroup {
            max-width: 88px;
            padding-inline: 6px !important;
          }

          .productionNetworkCanaryV45 .v42CreateActions {
            gap: 5px !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .productionNetworkCanaryV45 .navActions > button,
          .productionNetworkCanaryV45 .v42GroupPanel,
          .productionNetworkCanaryV45 .profileCard {
            transition: none !important;
          }
        }
      `}</style>
    </>
  );
}
