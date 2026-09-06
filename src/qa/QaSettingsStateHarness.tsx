'use client';

import { useEffect, useRef } from 'react';

import { AppSettings } from '@/components/AppSettings';
import type { SupportedLocale } from '@/lib/i18n/locales';

export type QaSettingsStateId =
  | 'SETTINGS-WALLET-DISCONNECTED'
  | 'SETTINGS-WALLET-CONNECTED'
  | 'SETTINGS-SWITCH-CONFIRM'
  | 'SETTINGS-DISCONNECT-CONFIRM'
  | 'SETTINGS-WALLET-PENDING'
  | 'SETTINGS-ACTION-ERROR'
  | 'SETTINGS-LANGUAGE-OPEN'
  | 'SETTINGS-LANGUAGE-SEARCH';

const QA_WALLET = '0x0000000000000000000000000000000000000a11';

type AutoAction =
  | 'switch-confirm'
  | 'disconnect-confirm'
  | 'action-error'
  | 'language-open'
  | 'language-search'
  | null;

function autoActionFor(stateId: QaSettingsStateId): AutoAction {
  if (stateId === 'SETTINGS-SWITCH-CONFIRM') return 'switch-confirm';
  if (stateId === 'SETTINGS-DISCONNECT-CONFIRM') return 'disconnect-confirm';
  if (stateId === 'SETTINGS-ACTION-ERROR') return 'action-error';
  if (stateId === 'SETTINGS-LANGUAGE-OPEN') return 'language-open';
  if (stateId === 'SETTINGS-LANGUAGE-SEARCH') return 'language-search';
  return null;
}

export function QaSettingsStateHarness({
  stateId,
  locale,
}: {
  stateId: QaSettingsStateId;
  locale: SupportedLocale;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const disconnected = stateId === 'SETTINGS-WALLET-DISCONNECTED';
  const pending = stateId === 'SETTINGS-WALLET-PENDING';
  const action = autoActionFor(stateId);

  useEffect(() => {
    if (!action) return;

    let cancelled = false;
    let frame = 0;
    let requestId = 0;
    let stage = 0;

    const attempt = () => {
      if (cancelled) return;
      const root = rootRef.current;
      if (!root) return;

      if (action === 'switch-confirm') {
        const button = root.querySelector<HTMLButtonElement>('.primarySettingAction');
        if (button && !button.disabled) {
          button.click();
          return;
        }
      } else if (action === 'disconnect-confirm') {
        const button = root.querySelector<HTMLButtonElement>('.secondarySettingAction');
        if (button && !button.disabled) {
          button.click();
          return;
        }
      } else if (action === 'action-error') {
        if (stage === 0) {
          const button = root.querySelector<HTMLButtonElement>('.primarySettingAction');
          if (button && !button.disabled) {
            button.click();
            stage = 1;
          }
        } else {
          const confirm = root.querySelector<HTMLButtonElement>('.confirmationConfirm');
          if (confirm && !confirm.disabled) {
            confirm.click();
            return;
          }
        }
      } else if (action === 'language-open' || action === 'language-search') {
        if (stage === 0) {
          const trigger = root.querySelector<HTMLButtonElement>('.languagePickerTrigger');
          if (trigger) {
            trigger.click();
            if (action === 'language-open') return;
            stage = 1;
          }
        } else {
          const input = root.querySelector<HTMLInputElement>('.languageSearch input');
          if (input) {
            const setter = Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              'value',
            )?.set;
            setter?.call(input, 'zzzz-no-match');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return;
          }
        }
      }

      frame += 1;
      if (frame < 120) requestId = window.requestAnimationFrame(attempt);
    };

    requestId = window.requestAnimationFrame(attempt);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(requestId);
    };
  }, [action]);

  const failWalletAction = stateId === 'SETTINGS-ACTION-ERROR';

  return (
    <div
      ref={rootRef}
      data-qa-settings-state={stateId}
      style={{
        minHeight: '100dvh',
        boxSizing: 'border-box',
        padding: '22px 18px 118px',
        background: '#080807',
        color: '#fff',
      }}
    >
      <AppSettings
        locale={locale}
        wallet={disconnected ? null : QA_WALLET}
        isWalletActionPending={pending}
        onLocaleChange={() => {}}
        onConnect={() => {}}
        onConnectAnother={async () => {
          if (failWalletAction) throw new Error('QA wallet action failure');
        }}
        onDisconnect={async () => {
          if (failWalletAction) throw new Error('QA wallet action failure');
        }}
      />
    </div>
  );
}
