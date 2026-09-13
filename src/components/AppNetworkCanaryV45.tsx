'use client';

import type { Locale } from '@/lib/i18n/locales';
import { QaNetworkRadialPlaygroundV45 } from '@/qa/QaNetworkRadialPlaygroundV45';

export function AppNetworkCanaryV45({ locale }: { locale: Locale }) {
  return (
    <section className="productionNetworkCanaryV45" data-locale={locale}>
      <div className="canaryBadge" aria-label="Private Network canary">
        <b>PRIVATE CANARY</b>
        <span>V45 baseline</span>
      </div>
      <QaNetworkRadialPlaygroundV45 />
      <style jsx global>{`
        .productionNetworkCanaryV45{width:100%;position:relative}
        .productionNetworkCanaryV45 .canaryBadge{width:min(calc(100% - 20px),960px);box-sizing:border-box;margin:0 auto 7px;padding:6px 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid rgba(244,183,40,.16);border-radius:10px;background:rgba(244,183,40,.035);color:#8f7d4b}
        .productionNetworkCanaryV45 .canaryBadge b{font-size:.43rem;letter-spacing:.08em;color:#c9a94f}.productionNetworkCanaryV45 .canaryBadge span{font-size:.4rem;color:#716852}
        .productionNetworkCanaryV45 .v37Page{min-height:0!important;padding:0 0 12px!important;background:transparent!important}
        .productionNetworkCanaryV45 .labHeader,
        .productionNetworkCanaryV45 .scenarioBar,
        .productionNetworkCanaryV45 .rules{display:none!important}
        .productionNetworkCanaryV45 .controlBar,
        .productionNetworkCanaryV45 .networkShell{width:min(calc(100% - 20px),960px)!important}
        @media(max-width:640px){
          .productionNetworkCanaryV45 .canaryBadge{width:calc(100% - 12px)}
          .productionNetworkCanaryV45 .controlBar,
          .productionNetworkCanaryV45 .networkShell{width:calc(100% - 12px)!important}
        }
      `}</style>
    </section>
  );
}
