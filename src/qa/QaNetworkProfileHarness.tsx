'use client';

import { AppNetwork } from '@/components/AppNetwork';
import { QaWalletLauncherOverrideProvider } from '@/components/WalletControl';
import type { Locale } from '@/lib/i18n/locales';

export const QA_NETWORK_PROFILE_WALLET =
  '0x1111111111111111111111111111111111111111';

export function QaNetworkProfileHarness({
  locale,
}: {
  locale: Locale;
}) {
  return (
    <QaWalletLauncherOverrideProvider
      value={{ wallet: QA_NETWORK_PROFILE_WALLET }}
    >
      <main className="qaNetworkProfileShell">
        <AppNetwork locale={locale} />
        <style jsx>{`
          .qaNetworkProfileShell {
            width:min(100%,520px);
            height:calc(100svh - 24px);
            min-height:0;
            margin:12px auto;
            display:flex;
            padding:0 10px;
            box-sizing:border-box;
          }
          @media(max-width:560px) {
            .qaNetworkProfileShell {
              width:100%;
              height:100svh;
              margin:0;
              padding:12px 10px;
            }
          }
        `}</style>
      </main>
    </QaWalletLauncherOverrideProvider>
  );
}
