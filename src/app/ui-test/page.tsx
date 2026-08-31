import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { InviteRejectionPreview } from '@/components/InviteRejectionPreview';
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
        이 Preview는 실제 앱에 반영되는 최신 UI·다국어 문구·모바일 여백 기준과 같은 내용을 확인하는 용도입니다.
      </div>
      <UiTestLab />
      <InviteRejectionPreview />
    </>
  );
}
