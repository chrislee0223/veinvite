import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { GuideUiPreview } from '@/components/GuideUiPreview';
import { InfiniteReferralCanvasPreview } from '@/components/InfiniteReferralCanvasPreview';
import { InviteRejectionPreview } from '@/components/InviteRejectionPreview';
import { LeaderboardUiPreview } from '@/components/LeaderboardUiPreview';
import { NotificationUiPreview } from '@/components/NotificationUiPreview';
import { UiTestLab } from '@/components/UiTestLab';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite UI Test Lab',
  robots: {
    index: false,
    follow: false,
  },
};

export default function UiTestPage() {
  const allowed =
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview';

  if (!allowed) {
    notFound();
  }

  return (
    <>
      <div
        style={{
          width: 'min(calc(100% - 32px), 1120px)',
          boxSizing: 'border-box',
          margin: '18px auto 0',
          padding: '11px 14px',
          border: '1px solid rgba(244,183,40,.2)',
          borderRadius: '14px',
          background: 'rgba(244,183,40,.07)',
          color: '#d9d4c8',
          fontSize: '12px',
          lineHeight: 1.55,
          textAlign: 'center',
        }}
      >
        <strong style={{ color: '#f4c85a' }}>PRODUCTION PARITY</strong>
        {' · '}
        이 Preview는 실제 앱의 최신 UI·다국어 문구·모바일 여백 기준과 같은 내용을 확인하는 용도입니다.
      </div>

      <UiTestLab />
      <NotificationUiPreview />
      <GuideUiPreview />
      <LeaderboardUiPreview />
      <InfiniteReferralCanvasPreview />
      <InviteRejectionPreview />

      <section className="legalPreviewLinks">
        <span>LEGAL NAVIGATION</span>
        <h2>약관 · 개인정보처리방침 뒤로가기 확인</h2>
        <p>
          아래 실제 Legal 페이지를 열면 상단에 뒤로가기 버튼이 표시됩니다.
          Settings에서 진입한 경우 Settings로, 직접 URL로 진입한 경우 홈으로 돌아가는 흐름을 확인합니다.
        </p>
        <div>
          <Link href="/privacy?from=settings">개인정보처리방침 열기</Link>
          <Link href="/terms?from=settings">이용약관 열기</Link>
        </div>
      </section>

      <style>{`
        .legalPreviewLinks {
          width:min(calc(100% - 32px),560px);
          box-sizing:border-box;
          margin:28px auto 80px;
          padding:20px;
          border:1px solid rgba(255,205,80,.16);
          border-radius:21px;
          background:rgba(255,255,255,.035);
          color:#f7f3e8;
        }
        .legalPreviewLinks > span {
          color:#f4b728;
          font-size:.66rem;
          font-weight:950;
          letter-spacing:.1em;
        }
        .legalPreviewLinks h2 {
          margin:7px 0 0;
          font-size:1.05rem;
          letter-spacing:-.025em;
        }
        .legalPreviewLinks p {
          margin:9px 0 0;
          color:#8f8a80;
          font-size:.75rem;
          line-height:1.6;
        }
        .legalPreviewLinks div {
          margin-top:15px;
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:9px;
        }
        .legalPreviewLinks a {
          min-height:48px;
          padding:0 12px;
          display:flex;
          align-items:center;
          justify-content:center;
          border:1px solid rgba(255,205,80,.2);
          border-radius:14px;
          background:rgba(244,183,40,.08);
          color:#f4c85a;
          font-size:.78rem;
          font-weight:900;
          text-align:center;
          text-decoration:none;
        }
        @media (max-width:420px) {
          .legalPreviewLinks div {
            grid-template-columns:1fr;
          }
        }
      `}</style>
    </>
  );
}
