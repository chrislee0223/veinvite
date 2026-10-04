import { ImageResponse } from 'next/og';

export const alt = 'VeInvite — Invite friends through VeBetterDAO';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 78px',
          background:
            'radial-gradient(circle at 82% 14%, rgba(244,183,40,.30), transparent 34%), #080807',
          color: '#ffffff',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            fontSize: 34,
            fontWeight: 800,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              background: '#f4b728',
            }}
          />
          VeInvite
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div
            style={{
              maxWidth: 930,
              fontSize: 72,
              lineHeight: 1.04,
              letterSpacing: '-0.04em',
              fontWeight: 800,
            }}
          >
            Invite friends.
            <br />
            Earn B3TR.
          </div>
          <div
            style={{
              maxWidth: 800,
              fontSize: 30,
              lineHeight: 1.35,
              color: '#c5c0b5',
            }}
          >
            Verified onboarding for VeBetterDAO.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
