'use client';

import {
  useEffect,
  useState,
} from 'react';

import { Brand } from './Brand';
import { ENTRY_REJECTION_COPY } from '@/lib/i18n/entryRejectionCopy';
import {
  isLocale,
  type Locale,
} from '@/lib/i18n/locales';

function readDocumentLocale(): Locale {
  const value = document.documentElement.lang;
  return isLocale(value) ? value : 'en';
}

export function InviteRejectionPreview() {
  const [locale, setLocale] = useState<Locale>('en');

  useEffect(() => {
    const sync = () => setLocale(readDocumentLocale());
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
    });

    const handleLanguageChange = () => sync();
    window.addEventListener(
      'veinvite-language-change',
      handleLanguageChange,
    );

    return () => {
      observer.disconnect();
      window.removeEventListener(
        'veinvite-language-change',
        handleLanguageChange,
      );
    };
  }, []);

  const copy = ENTRY_REJECTION_COPY[locale];

  return (
    <section className="rejectionLab" lang={locale}>
      <div className="rejectionHeading">
        <div>
          <span>INVITEE UX · SAFE REJECTION</span>
          <h2>초대 불가 사유 미리보기</h2>
        </div>
        <small>실제 판정 규칙 상세 비공개</small>
      </div>

      <p className="rejectionDescription">
        위 테스트 패널에서 언어를 바꾸면 이 화면도 같은 언어로 바뀝니다.
        실제 앱의 기존 활성 사용자 거절 문구와 동일한 문구를 사용합니다.
      </p>

      <div className="phonePreview">
        <header>
          <Brand compact />
        </header>

        <div className="errorSurface">
          <div className="errorIcon" aria-hidden="true">×</div>
          <h3>{copy.title}</h3>

          <div className="reasonCard">
            <strong>{copy.reasonLabel}</strong>
            <p>{copy.reason}</p>
          </div>

          <p className="helpText">{copy.help}</p>

          <button type="button">VeInvite</button>
        </div>
      </div>

      <div className="safetyNote">
        <strong>공개하지 않는 정보</strong>
        <span>
          보상/투표 중 어떤 기록이 원인이었는지, 확인 라운드·블록·거래번호,
          Sybil 판정 규칙과 임계값은 사용자 화면에 표시하지 않습니다.
        </span>
      </div>

      <style jsx>{`
        .rejectionLab {
          width:min(100%,760px);
          box-sizing:border-box;
          margin:24px auto 0;
          padding:24px;
          border:1px solid rgba(255,255,255,.08);
          border-radius:24px;
          background:#0d0d0d;
          color:#f8f6ef;
        }
        .rejectionHeading {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:16px;
        }
        .rejectionHeading span {
          color:#f4b728;
          font-size:.7rem;
          font-weight:950;
          letter-spacing:.1em;
        }
        .rejectionHeading h2 {
          margin:6px 0 0;
          font-size:1.25rem;
          line-height:1.25;
        }
        .rejectionHeading small {
          padding:7px 10px;
          border-radius:999px;
          background:rgba(244,183,40,.1);
          color:#f4c85a;
          font-size:.68rem;
          font-weight:850;
          white-space:nowrap;
        }
        .rejectionDescription {
          margin:12px 0 0;
          color:#9f9b92;
          font-size:.82rem;
          line-height:1.65;
        }
        .phonePreview {
          width:min(100%,430px);
          box-sizing:border-box;
          margin:22px auto 0;
          padding:16px;
          border:1px solid rgba(255,255,255,.08);
          border-radius:26px;
          background:#080807;
        }
        .phonePreview header {
          display:flex;
          align-items:center;
          min-height:42px;
        }
        .errorSurface {
          padding:28px 4px 12px;
          text-align:center;
        }
        .errorIcon {
          width:52px;
          height:52px;
          display:grid;
          place-items:center;
          margin:0 auto;
          border:1px solid rgba(244,183,40,.28);
          border-radius:50%;
          background:rgba(244,183,40,.08);
          color:#f4c85a;
          font-size:1.55rem;
          font-weight:900;
        }
        .errorSurface h3 {
          margin:16px auto 0;
          max-width:340px;
          font-size:1.35rem;
          line-height:1.28;
          text-wrap:balance;
        }
        .reasonCard {
          margin:18px auto 0;
          padding:15px 16px;
          border:1px solid rgba(255,255,255,.08);
          border-radius:16px;
          background:#12120f;
          text-align:left;
        }
        .reasonCard strong {
          display:block;
          color:#f4c85a;
          font-size:.72rem;
          letter-spacing:.02em;
        }
        .reasonCard p,
        .helpText {
          overflow-wrap:normal;
          word-break:normal;
          text-wrap:pretty;
        }
        .reasonCard p {
          margin:7px 0 0;
          color:#d1cdc4;
          font-size:.86rem;
          line-height:1.65;
        }
        .helpText {
          margin:14px auto 0;
          max-width:340px;
          color:#8f8b82;
          font-size:.78rem;
          line-height:1.6;
        }
        .errorSurface button {
          width:100%;
          min-height:46px;
          margin-top:20px;
          border:1px solid rgba(244,183,40,.28);
          border-radius:14px;
          background:#17150f;
          color:#f4c85a;
          font:inherit;
          font-weight:900;
        }
        .safetyNote {
          display:grid;
          gap:5px;
          margin-top:18px;
          padding:13px 14px;
          border-radius:15px;
          background:rgba(255,255,255,.035);
        }
        .safetyNote strong {
          font-size:.76rem;
          color:#dad6cd;
        }
        .safetyNote span {
          color:#858177;
          font-size:.74rem;
          line-height:1.55;
        }
        .rejectionLab:lang(ko) :where(h2,h3,p,span,strong,small) {
          word-break:keep-all;
        }
        .rejectionLab:lang(zh),
        .rejectionLab:lang(ja) {
          line-break:strict;
        }
        @media (max-width:560px) {
          .rejectionLab {
            padding:20px 16px;
            border-radius:0;
            border-left:0;
            border-right:0;
          }
          .rejectionHeading {
            display:grid;
          }
          .rejectionHeading small {
            width:fit-content;
          }
          .phonePreview {
            padding:16px;
          }
        }
      `}</style>
    </section>
  );
}
