import { ImageResponse } from 'next/og';

export const alt = 'VeInvite — Invite friends through VeBetterDAO';
export const size = {
  width: 1200,
  height: 600,
};
export const contentType = 'image/png';

const LOGO_URL = 'https://veinvite.vercel.app/veinvite-logo.webp';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '600px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0b0b09',
          color: '#ffffff',
          padding: '64px 72px 54px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <img
            src={LOGO_URL}
            alt=""
            width="92"
            height="92"
            style={{
              width: '92px',
              height: '92px',
              borderRadius: '24px',
              marginRight: '26px',
            }}
          />
          <div
            style={{
              display: 'flex',
              fontSize: '64px',
              fontWeight: 700,
              letterSpacing: '-2px',
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
              fontSize: '70px',
              lineHeight: 1.02,
              fontWeight: 700,
              letterSpacing: '-2px',
              marginBottom: '24px',
            }}
          >
            Invite friends. Earn B3TR.
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: '31px',
              lineHeight: 1.25,
              color: '#d3d0c8',
            }}
          >
            Invite. Verify. Earn.
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
              alignSelf: 'flex-start',
              borderRadius: '8px',
              backgroundColor: '#141410',
              color: '#f4b728',
              fontSize: '22px',
              padding: '8px 14px',
              marginBottom: '18px',
            }}
          >
            VeInvite
          </div>
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: '8px',
              borderRadius: '999px',
              backgroundColor: '#f4b728',
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
