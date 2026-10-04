'use client';

import { useState } from 'react';

import {
  countryFlagAssetUrl,
  normalizeIsoCountryCode,
} from '@/lib/countryCodes';


export function CountryFlag({ countryCode }: { countryCode: string }) {
  const normalized = countryCode.trim().toUpperCase();
  const isoCountryCode = normalizeIsoCountryCode(normalized);
  const [failedCode, setFailedCode] = useState<string | null>(null);
  const imageFailed = failedCode === normalized;
  const showUnknown = !isoCountryCode || imageFailed;

  return (
    <span
      className={`countryFlag${showUnknown ? ' countryFlagUnknownFrame' : ''}`}
      aria-hidden="true"
    >
      {isoCountryCode && !imageFailed ? (
        <img
          className="countryFlagImage"
          src={countryFlagAssetUrl(isoCountryCode)}
          alt=""
          draggable={false}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedCode(normalized)}
        />
      ) : (
        <span className="countryFlagUnknown">
          <svg
            className="countryFlagUnknownIcon"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="8.25" />
            <path d="M3.75 12h16.5" />
            <path d="M12 3.75c2.1 2.25 3.2 5 3.2 8.25S14.1 18 12 20.25" />
            <path d="M12 3.75C9.9 6 8.8 8.75 8.8 12S9.9 18 12 20.25" />
            <path d="M5.4 7.25h13.2M5.4 16.75h13.2" />
          </svg>
        </span>
      )}

      <style jsx>{`
        .countryFlag {
          width:28px;
          height:19px;
          flex:0 0 28px;
          display:grid;
          place-items:center;
          overflow:hidden;
          border-radius:4px;
          background:transparent;
          box-shadow:0 0 0 1px rgba(255,255,255,.12);
        }
        .countryFlagImage {
          width:100%;
          height:100%;
          display:block;
          object-fit:contain;
        }
        .countryFlagUnknownFrame {
          background:
            linear-gradient(145deg,rgba(255,255,255,.085),rgba(255,255,255,.025)),
            rgba(16,16,15,.96);
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.045),
            0 0 0 1px rgba(255,255,255,.12);
        }
        .countryFlagUnknown {
          width:100%;
          height:100%;
          display:grid;
          place-items:center;
        }
        .countryFlagUnknownIcon {
          width:15px;
          height:15px;
          display:block;
          color:#aaa59b;
          stroke:currentColor;
          stroke-width:1.35;
          stroke-linecap:round;
          stroke-linejoin:round;
          vector-effect:non-scaling-stroke;
        }
        @media (max-width:430px) {
          .countryFlag {
            width:25px;
            height:17px;
            flex-basis:25px;
          }
        }
      `}</style>
    </span>
  );
}
