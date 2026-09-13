'use client';

import type { Locale } from '@/lib/i18n/locales';
import { QaNetworkRadialPlaygroundV45 } from '@/qa/QaNetworkRadialPlaygroundV45';

export function AppNetworkCanaryV45({ locale }: { locale: Locale }) {
  return (
    <section className="productionNetworkCanaryV45" data-locale={locale}>
      <QaNetworkRadialPlaygroundV45 />
      <style jsx global>{`
        .productionNetworkCanaryV45{width:100%;position:relative}
        .productionNetworkCanaryV45 .v37Page{min-height:0!important;padding:0 0 12px!important;background:transparent!important}
        .productionNetworkCanaryV45 .labHeader,
        .productionNetworkCanaryV45 .scenarioBar,
        .productionNetworkCanaryV45 .rules{display:none!important}
        .productionNetworkCanaryV45 .controlBar,
        .productionNetworkCanaryV45 .networkShell{width:min(calc(100% - 20px),960px)!important}
        @media(max-width:640px){
          .productionNetworkCanaryV45 .controlBar,
          .productionNetworkCanaryV45 .networkShell{width:calc(100% - 12px)!important}
        }
      `}</style>
    </section>
  );
}
