'use client';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV75 } from './AppNetworkCanaryV75';

export function AppNetworkCanaryV76({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV75 locale={locale} />
      <style jsx global>{`
        .productionNetworkCanaryV45.v73ParentVisualOverlay.v75ParentReturnMotion .scene{
          animation:v76ParentReturnReveal 1180ms both!important
        }

        @keyframes v76ParentReturnReveal{
          0%{
            scale:1.05;
            animation-timing-function:cubic-bezier(.18,.82,.2,1)
          }
          61%{
            scale:1.003;
            animation-timing-function:linear
          }
          100%{scale:1}
        }

        @media(prefers-reduced-motion:reduce){
          .productionNetworkCanaryV45.v73ParentVisualOverlay.v75ParentReturnMotion .scene{
            animation:none!important;
            scale:1!important
          }
        }
      `}</style>
    </>
  );
}
