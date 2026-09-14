'use client';

import { useLayoutEffect } from 'react';

import {
  getLocaleDirection,
  isLocale,
  type Locale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { NETWORK_CANVAS_CONTROL_COPY } from '@/lib/i18n/networkCanvasControlCopy';
import { getNetworkCanaryInteractionCopy } from '@/lib/i18n/networkCanaryInteractionCopy';
import {
  formatNetworkCanaryUiCopy,
  NETWORK_CANARY_UI_COPY,
} from '@/lib/i18n/networkCanaryUiCopy';
import { NETWORK_COPY } from '@/lib/i18n/networkCopy';
import { NETWORK_EXPERIENCE_COPY } from '@/lib/i18n/networkExperienceCopy';
import { NETWORK_EXPLORE_COPY } from '@/lib/i18n/networkExploreCopy';
import { AppNetworkCanaryV64 } from './AppNetworkCanaryV64';

const FALLBACK_COPY_SIZE = '.44rem';
const EMPTY_GROUP_COPY_SIZE = '.37rem';

function resolveLocale(locale: Locale): SupportedLocale {
  return isLocale(locale) ? locale : 'en';
}

function NetworkCanaryLocalizationV65({ locale }: { locale: Locale }) {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    if (!root) return;

    const resolvedLocale = resolveLocale(locale);
    const copy = NETWORK_CANARY_UI_COPY[resolvedLocale];
    const controls = NETWORK_CANVAS_CONTROL_COPY[resolvedLocale];
    const experience = NETWORK_EXPERIENCE_COPY[resolvedLocale];
    const network = NETWORK_COPY[resolvedLocale];
    const explore = NETWORK_EXPLORE_COPY[resolvedLocale];
    const interaction = getNetworkCanaryInteractionCopy(resolvedLocale);
    const direction = getLocaleDirection(resolvedLocale);
    const numberFormat = new Intl.NumberFormat(resolvedLocale);
    let uiFrame = 0;

    const count = (value: string | number) => {
      const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? numberFormat.format(parsed) : String(value);
    };
    const format = (template: string, values: Record<string, string | number>) =>
      formatNetworkCanaryUiCopy(template, values);

    // Some mature V42/V44 group handlers intentionally still read their
    // original English textContent to decide create/save/cancel state. Keep
    // that source text untouched and paint localized copy through ::after.
    // This separates presentation from interaction semantics and prevents a
    // locale change from breaking group creation or draft recovery.
    const paintCopy = (element: HTMLElement | null, value: string, aria = false) => {
      if (!element || !value) return;
      if (!element.style.getPropertyValue('--v65-ui-copy-size')) {
        const measured = window.getComputedStyle(element).fontSize;
        const size = measured && measured !== '0px'
          ? measured
          : element.classList.contains('v42EmptyGroups')
            ? EMPTY_GROUP_COPY_SIZE
            : FALLBACK_COPY_SIZE;
        element.style.setProperty('--v65-ui-copy-size', size);
      }
      if (element.dataset.v65UiCopy !== value) element.dataset.v65UiCopy = value;
      if (!element.classList.contains('v65LocalizedUiCopy')) {
        element.classList.add('v65LocalizedUiCopy');
      }
      element.dir = direction;
      if (aria || element instanceof HTMLButtonElement) {
        const accessible = value.replace(/^[◎✦＋✓←\s]+/, '').trim() || value;
        if (element.getAttribute('aria-label') !== accessible) {
          element.setAttribute('aria-label', accessible);
        }
      }
    };

    const setPlaceholder = (input: HTMLInputElement | null) => {
      if (!input) return;
      input.dir = direction;
      if (input.placeholder !== copy.groupName) input.placeholder = copy.groupName;
    };

    const localizeDropLabel = (element: HTMLElement) => {
      const value = element.dataset.v61DropLabel;
      if (!value) return;

      const variants: Array<[string, (group: string) => string]> = [
        ['Already in ', interaction.alreadyIn],
        ['Release to move to ', interaction.releaseMove],
        ['Release to add to ', interaction.releaseAdd],
      ];

      for (const [prefix, formatter] of variants) {
        if (!value.startsWith(prefix)) continue;
        const groupName = value.slice(prefix.length).trim();
        if (!groupName) return;
        const localized = formatter(groupName);
        if (localized !== value) element.dataset.v61DropLabel = localized;
        return;
      }
    };

    const localizeStatusLabel = (
      element: HTMLElement,
      dataKey: 'v61AcceptedLabel' | 'v63VerifiedLabel',
    ) => {
      const value = element.dataset[dataKey];
      if (!value) return;
      const localized = value === '✓ Moved'
        ? interaction.moved
        : value === '✓ Added'
          ? interaction.added
          : null;
      if (localized && localized !== value) element.dataset[dataKey] = localized;
    };

    const localizeToast = (element: HTMLElement) => {
      if (!element.classList.contains('v63GestureToast')) return;
      const value = element.textContent?.trim() ?? '';
      const localized = value === 'Couldn’t save this position.'
        ? interaction.saveError
        : value === 'Couldn’t confirm the group move.'
          ? interaction.confirmMoveError
          : null;
      element.dir = direction;
      if (localized && localized !== value) element.textContent = localized;
    };

    const localizeGroupStatus = (element: HTMLElement) => {
      const value = element.textContent?.trim() ?? '';
      const match = value.match(/^(\d+) people · (.+)$/);
      if (!match) return;
      const people = format(copy.peopleCount, { count: count(match[1]) });
      const status = match[2] === 'release to add'
        ? copy.releaseAdd
        : match[2] === 'empty · ready for drop'
          ? copy.emptyReady
          : match[2] === 'collapsed'
            ? copy.collapsed
            : match[2] === 'expanded'
              ? copy.expanded
              : null;
      if (status) paintCopy(element, `${people} · ${status}`);
    };

    const localizeGroupHub = (element: HTMLElement) => {
      const value = element.textContent?.trim() ?? '';
      if (value === 'release to add') {
        paintCopy(element, copy.releaseAdd);
        return;
      }
      const match = value.match(/^(\d+) people · (ready|tap to open|tap to close)$/);
      if (!match) return;
      const people = format(copy.peopleCount, { count: count(match[1]) });
      const status = match[2] === 'ready'
        ? copy.emptyReady
        : match[2] === 'tap to open'
          ? copy.collapsed
          : copy.expanded;
      paintCopy(element, `${people} · ${status}`);
    };

    const localizeSelectionCount = (element: HTMLElement) => {
      const value = element.textContent?.trim() ?? '';
      const selected = value.match(/^(\d+) selected/);
      if (selected) {
        const selectedText = format(copy.selectedCount, { count: count(selected[1]) });
        const moving = value.match(/· (\d+) will move here on create$/);
        paintCopy(
          element,
          moving
            ? `${selectedText} · ${format(copy.willMoveCount, { count: count(moving[1]) })}`
            : value.includes('optional')
              ? `${selectedText} · ${copy.optional}`
              : `${selectedText} · ${copy.dragOrTap}`,
        );
        return;
      }
      const saved = value.match(/^(\d+) people after save/);
      if (saved) {
        paintCopy(
          element,
          `${format(copy.peopleCount, { count: count(saved[1]) })} · ${copy.zeroAllowed}`,
        );
      }
    };

    const localizeStats = (element: HTMLElement) => {
      const value = element.textContent?.trim() ?? '';
      let match = value.match(/^Direct (\d+)$/);
      if (match) {
        paintCopy(element, `${experience.direct} ${count(match[1])}`);
        return;
      }
      match = value.match(/^Network (\d+)$/);
      if (match) {
        paintCopy(element, `${network.navLabel} ${count(match[1])}`);
        return;
      }
      match = value.match(/^(\d+) groups$/);
      if (match) {
        paintCopy(element, format(copy.groupsCount, { count: count(match[1]) }));
        return;
      }
      if (value === 'All on one canvas') {
        paintCopy(element, copy.allCanvas);
        return;
      }
      match = value.match(/^(\d+) direct · (\d+) (?:network|net)$/);
      if (match) {
        paintCopy(
          element,
          `${experience.direct} ${count(match[1])} · ${network.navLabel} ${count(match[2])}`,
        );
      }
    };

    const localizeNoticeMessage = (message: string) => {
      if (message === 'New friend is joining…') return copy.newFriendJoining;
      if (message === 'Verified · adding to this network') return copy.verifiedAdding;
      if (message === 'New node added') return copy.newNodeAdded;
      if (message === 'Layout edit on · drag to move') return `${copy.editLayout} · ${copy.hintEdit}`;
      if (message === 'Group updated') return `✓ ${copy.save}`;

      const prefixRules: Array<[string, (name: string) => string]> = [
        ['Already in ', (name) => interaction.alreadyIn(name)],
        ['Moved to ', (name) => `${interaction.moved} · ${name}`],
        ['Added to ', (name) => `${interaction.added} · ${name}`],
        ['Removed from ', (name) => `${copy.removeFromGroup} · ${name}`],
      ];
      for (const [prefix, formatter] of prefixRules) {
        if (message.startsWith(prefix)) return formatter(message.slice(prefix.length).trim());
      }

      let match = message.match(/^(.*) created · (\d+) people$/);
      if (match) {
        return `✓ ${match[1]} · ${format(copy.peopleCount, { count: count(match[2]) })}`;
      }
      match = message.match(/^(.*) created · empty$/);
      if (match) return `✓ ${match[1]} · ${copy.empty}`;
      match = message.match(/^(.*) removed · people kept$/);
      if (match) return `✓ ${match[1]} · ${copy.removed}`;
      return null;
    };

    const localizeNotice = (element: HTMLElement) => {
      const raw = element.textContent?.trim() ?? '';
      const message = raw.startsWith('✦ ') ? raw.slice(2).trim() : raw;
      const localized = localizeNoticeMessage(message);
      if (localized) paintCopy(element, localized);
    };

    const localizeUi = () => {
      paintCopy(root.querySelector<HTMLElement>('.v42GroupToolbarButton'), `▦ ${copy.groups}`);

      const canaryActions = root.querySelectorAll<HTMLElement>('.canaryViewActions button');
      if (canaryActions[0]) paintCopy(canaryActions[0], `◎ ${controls.you}`);
      if (canaryActions[1]) paintCopy(canaryActions[1], copy.fit);
      const canaryActionRoot = root.querySelector<HTMLElement>('.canaryViewActions');
      if (canaryActionRoot) canaryActionRoot.setAttribute('aria-label', network.navLabel);

      root.querySelectorAll<HTMLElement>('.navActions > button').forEach((button) => {
        const value = button.textContent?.trim() ?? '';
        if (value === '✦ Edit layout') paintCopy(button, `✦ ${copy.editLayout}`);
        else if (value === '✓ Done') paintCopy(button, `✓ ${copy.done}`);
        else if (value === 'Reset') paintCopy(button, copy.reset);
        else if (value === '← Inviter') paintCopy(button, `← ${experience.invitedBy}`);
      });

      const zoomValue = root.querySelector<HTMLElement>('.zoomValue');
      if (zoomValue) zoomValue.setAttribute('title', `${controls.zoomOut} / ${controls.zoomIn}`);

      root.querySelectorAll<HTMLElement>('.identity span,.centerWrap small,.personNode small,.profileCard p').forEach(localizeStats);
      root.querySelectorAll<HTMLElement>('.identity b,.centerWrap b,.crumbs button').forEach((element) => {
        if (element.textContent?.trim() === 'YOU') paintCopy(element, controls.you);
      });

      root.querySelectorAll<HTMLElement>('.slotNode b').forEach((element) => {
        const value = element.textContent?.trim();
        if (value === 'Joining') paintCopy(element, copy.joining);
        else if (value === 'Available') paintCopy(element, copy.available);
      });

      const viewNetwork = root.querySelector<HTMLElement>('.profileCard .viewNetwork');
      if (viewNetwork) paintCopy(viewNetwork, `${explore.openNetwork} →`);
      const profileClose = root.querySelector<HTMLElement>('.profileCard > div button');
      if (profileClose) profileClose.setAttribute('aria-label', controls.close);

      const hint = root.querySelector<HTMLElement>('.hint');
      if (hint) {
        const value = hint.textContent?.trim() ?? '';
        if (value === 'Drag freely · tap background to finish') paintCopy(hint, copy.hintEdit);
        else if (value === 'Zoom in or tap +N to unfold · zoom out to group again') paintCopy(hint, copy.hintCluster);
        else if (value === 'Hold a node to edit · drag canvas · pinch to zoom') paintCopy(hint, copy.hintView);
      }

      const panel = root.querySelector<HTMLElement>('.v42GroupPanel');
      if (panel) {
        const heading = panel.querySelector<HTMLElement>('.v42PanelHead b');
        const headingValue = heading?.textContent?.trim() ?? '';
        if (headingValue === 'My groups') paintCopy(heading, copy.myGroups);
        else if (headingValue === 'Create group') paintCopy(heading, copy.createGroup);
        else if (headingValue.startsWith('Edit ')) {
          const name = headingValue.slice(5).trim();
          paintCopy(heading, `${name} · ${copy.edit}`);
        }

        const headSmall = panel.querySelector<HTMLElement>('.v42PanelHead small');
        const headValue = headSmall?.textContent?.trim() ?? '';
        const saved = headValue.match(/^(\d+) saved here$/);
        if (saved) paintCopy(headSmall, format(copy.savedCount, { count: count(saved[1]) }));
        else if (headValue === 'People are optional') paintCopy(headSmall, copy.optional);
        else if (headValue === 'Tap people to add or remove') paintCopy(headSmall, copy.tapAddRemove);

        panel.querySelectorAll<HTMLElement>('.v42PanelHead > button').forEach((button) => {
          button.setAttribute('aria-label', controls.close);
        });
        panel.querySelectorAll<HTMLInputElement>('input').forEach(setPlaceholder);

        const createButton = panel.querySelector<HTMLElement>('.v42CreateButton');
        if (createButton) paintCopy(createButton, `＋ ${copy.createGroup}`);
        panel.querySelectorAll<HTMLElement>('.v42ManageGroup').forEach((button) => paintCopy(button, copy.edit));
        panel.querySelectorAll<HTMLElement>('.v42DeleteGroup').forEach((button) => {
          const name = button.closest('.v42GroupRow')?.querySelector<HTMLElement>('.v42GroupRowMain b')?.textContent?.trim();
          button.setAttribute('aria-label', name ? `${copy.removeFromGroup}: ${name}` : copy.removeFromGroup);
        });
        panel.querySelectorAll<HTMLElement>('.v42GroupRowMain small').forEach(localizeGroupStatus);

        const emptyGroups = panel.querySelector<HTMLElement>('.v42EmptyGroups');
        if (emptyGroups) paintCopy(emptyGroups, copy.noGroups);

        panel.querySelectorAll<HTMLElement>('.v42SelectionCount span').forEach(localizeSelectionCount);
        panel.querySelectorAll<HTMLElement>('.v42CreateActions button').forEach((button) => {
          const value = button.textContent?.trim() ?? '';
          if (value === 'Cancel') paintCopy(button, copy.cancel);
          else if (value === 'Create') paintCopy(button, copy.create);
          else if (value === 'Save changes') paintCopy(button, copy.save);
        });

        const newGroupDrop = panel.querySelector<HTMLElement>('.v44NewGroupDrop');
        if (newGroupDrop) {
          newGroupDrop.setAttribute('aria-label', copy.createGroup);
          const bold = newGroupDrop.querySelector<HTMLElement>('b');
          const small = newGroupDrop.querySelector<HTMLElement>('small');
          const boldValue = bold?.textContent?.trim() ?? '';
          const smallValue = small?.textContent?.trim() ?? '';
          if (boldValue === '＋ Create your first group' || boldValue === '＋ New group') {
            paintCopy(bold, `＋ ${copy.createGroup}`);
          } else if (boldValue === 'Zoom in first') {
            paintCopy(bold, copy.zoomFirst);
          }
          if (smallValue === 'Release to start with this person') paintCopy(small, copy.releaseAdd);
          else if (smallValue) paintCopy(small, copy.dropPersonOrTap);
        }

        const createDrop = panel.querySelector<HTMLElement>('.v44CreateDropMore');
        if (createDrop) {
          createDrop.setAttribute('aria-label', copy.addPeople);
          const bold = createDrop.querySelector<HTMLElement>('b');
          const small = createDrop.querySelector<HTMLElement>('small');
          if (bold?.textContent?.trim() === 'Release to add') paintCopy(bold, copy.releaseAdd);
          else if (bold) paintCopy(bold, `＋ ${copy.addPeople}`);
          if (small) paintCopy(small, copy.dragOrTap);
        }

        panel.querySelectorAll<HTMLElement>('.v44SelectedChip').forEach((chip) => {
          const title = chip.getAttribute('title');
          if (title === 'Will move from another group') chip.setAttribute('title', copy.move);
          else if (title === 'Remove from selection') chip.setAttribute('title', copy.removeFromGroup);
          const moveLabel = chip.querySelector<HTMLElement>('i');
          if (moveLabel?.textContent?.trim() === 'move') paintCopy(moveLabel, copy.move);
        });
        const noSelection = panel.querySelector<HTMLElement>('.v44NoSelection');
        if (noSelection) paintCopy(noSelection, copy.noPeopleSelected);
      }

      root.querySelectorAll<HTMLElement>('.v42GroupHub small').forEach(localizeGroupHub);

      const removeZone = root.querySelector<HTMLElement>('.v42RemoveZone');
      if (removeZone) {
        paintCopy(removeZone.querySelector<HTMLElement>('b'), copy.removeFromGroup);
        const small = removeZone.querySelector<HTMLElement>('small');
        if (small?.textContent?.trim() === 'Release here') paintCopy(small, copy.releaseHere);
        else if (small) paintCopy(small, copy.dragUngroup);
      }

      const groupNotice = root.querySelector<HTMLElement>('.v42Notice span');
      if (groupNotice) localizeNotice(groupNotice);
      const undoButton = root.querySelector<HTMLElement>('.v42Notice button');
      if (undoButton?.textContent?.trim() === 'Undo') paintCopy(undoButton, copy.undo);

      const baseNotice = root.querySelector<HTMLElement>('.notice');
      if (baseNotice) localizeNotice(baseNotice);
    };

    const localizeElement = (element: Element) => {
      if (!(element instanceof HTMLElement)) return;
      if (element.hasAttribute('data-v61-drop-label')) localizeDropLabel(element);
      if (element.hasAttribute('data-v61-accepted-label')) {
        localizeStatusLabel(element, 'v61AcceptedLabel');
      }
      if (element.hasAttribute('data-v63-verified-label')) {
        localizeStatusLabel(element, 'v63VerifiedLabel');
      }
      localizeToast(element);
      element.querySelectorAll<HTMLElement>(
        '[data-v61-drop-label],[data-v61-accepted-label],[data-v63-verified-label],.v63GestureToast',
      ).forEach((child) => {
        if (child.hasAttribute('data-v61-drop-label')) localizeDropLabel(child);
        if (child.hasAttribute('data-v61-accepted-label')) {
          localizeStatusLabel(child, 'v61AcceptedLabel');
        }
        if (child.hasAttribute('data-v63-verified-label')) {
          localizeStatusLabel(child, 'v63VerifiedLabel');
        }
        localizeToast(child);
      });
    };

    const scheduleUiLocalization = () => {
      if (uiFrame) return;
      uiFrame = window.requestAnimationFrame(() => {
        uiFrame = 0;
        localizeUi();
      });
    };

    localizeElement(root);
    localizeUi();

    const observer = new MutationObserver((mutations) => {
      let needsUi = false;
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          if (mutation.target instanceof Element) localizeElement(mutation.target);
          needsUi = true;
          continue;
        }
        if (mutation.type === 'characterData') {
          const parent = mutation.target.parentElement;
          if (parent) localizeToast(parent);
          needsUi = true;
          continue;
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) localizeElement(node);
        });
        needsUi = true;
      }
      if (needsUi) scheduleUiLocalization();
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'data-v61-drop-label',
        'data-v61-accepted-label',
        'data-v63-verified-label',
        'class',
      ],
    });

    return () => {
      observer.disconnect();
      if (uiFrame) window.cancelAnimationFrame(uiFrame);
    };
  }, [locale]);

  return null;
}

export function AppNetworkCanaryV65({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV64 locale={locale} />
      <NetworkCanaryLocalizationV65 locale={locale} />
      <style jsx global>{`
        .productionNetworkCanaryV45 .v65LocalizedUiCopy.v65LocalizedUiCopy {
          font-size: 0 !important;
        }

        .productionNetworkCanaryV45 .v65LocalizedUiCopy.v65LocalizedUiCopy::after {
          content: attr(data-v65-ui-copy) !important;
          display: inline;
          font-size: var(--v65-ui-copy-size, .44rem) !important;
          font-family: inherit;
          font-weight: inherit;
          font-style: inherit;
          line-height: 1.25;
          letter-spacing: normal;
          text-transform: none;
          color: inherit;
          direction: inherit;
          unicode-bidi: plaintext;
          white-space: inherit;
        }

        .productionNetworkCanaryV45 .v42EmptyGroups.v65LocalizedUiCopy::after {
          content: attr(data-v65-ui-copy) !important;
          font-size: var(--v65-ui-copy-size, .37rem) !important;
          color: #6e675c !important;
        }

        .productionNetworkCanaryV45 .v42GroupPanel input,
        .productionNetworkCanaryV45 .v42GroupPanel .v65LocalizedUiCopy,
        .productionNetworkCanaryV45 .v42GroupHub .v65LocalizedUiCopy,
        .productionNetworkCanaryV45 .v42Notice .v65LocalizedUiCopy,
        .productionNetworkCanaryV45 .notice.v65LocalizedUiCopy {
          text-align: start;
        }

        .productionNetworkCanaryV45 .v42PanelHead b.v65LocalizedUiCopy::after,
        .productionNetworkCanaryV45 .v42PanelHead small.v65LocalizedUiCopy::after,
        .productionNetworkCanaryV45 .v42GroupRowMain small.v65LocalizedUiCopy::after,
        .productionNetworkCanaryV45 .v42GroupHub small.v65LocalizedUiCopy::after,
        .productionNetworkCanaryV45 .v44NewGroupDrop small.v65LocalizedUiCopy::after,
        .productionNetworkCanaryV45 .v44CreateDropMore small.v65LocalizedUiCopy::after,
        .productionNetworkCanaryV45 .hint.v65LocalizedUiCopy::after {
          white-space: normal;
        }

        .productionNetworkCanaryV45 .v42GroupToolbarButton.v65LocalizedUiCopy::after,
        .productionNetworkCanaryV45 .navActions button.v65LocalizedUiCopy::after,
        .productionNetworkCanaryV45 .canaryViewActions button.v65LocalizedUiCopy::after,
        .productionNetworkCanaryV45 .v42CreateActions button.v65LocalizedUiCopy::after,
        .productionNetworkCanaryV45 .v42ManageGroup.v65LocalizedUiCopy::after {
          white-space: nowrap;
        }

        .productionNetworkCanaryV45 .v42GroupHub.v61DropPreview::after,
        .productionNetworkCanaryV45 .v42GroupRow.v61DropPreview::after,
        .productionNetworkCanaryV45 .v42GroupHub.v61GroupAccepted::after,
        .productionNetworkCanaryV45 .v42GroupRow.v61GroupAccepted::after,
        .productionNetworkCanaryV45 .v42GroupHub.v63VerifiedTransfer::after,
        .productionNetworkCanaryV45 .v42GroupRow.v63VerifiedTransfer::after {
          direction: inherit;
          unicode-bidi: plaintext;
          max-width: min(190px, 72vw);
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
          line-height: 1.25;
          text-align: start;
        }

        .productionNetworkCanaryV45 .v63GestureToast {
          width: max-content;
          max-width: calc(100% - 24px);
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
          text-align: center;
          line-height: 1.35;
        }
      `}</style>
    </>
  );
}
