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
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#080807',
          color: '#ffffff',
          padding: '68px 76px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              borderRadius: '8px',
              backgroundColor: '#f4b728',
              marginRight: '16px',
            }}
          />
          <div
            style={{
              display: 'flex',
              fontSize: '34px',
              fontWeight: 800,
            }}
          >
            VeInvite
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: '76px',
              lineHeight: 1.02,
              fontWeight: 800,
              marginBottom: '24px',
            }}
          >
            Invite friends. Earn B3TR.
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: '30px',
              lineHeight: 1.3,
              color: '#c5c0b5',
            }}
          >
            Verified onboarding for VeBetterDAO.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: '24px',
            color: '#f4b728',
          }}
        >
          veinvite.vercel.app
        </div>
      </div>
    ),
    size,
  );
}
