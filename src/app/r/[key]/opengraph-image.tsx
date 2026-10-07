import { ImageResponse } from 'next/og';

export const alt =
  "You've been invited to VeInvite — Join. Verify. Earn B3TR.";
export const size = {
  width: 1200,
  height: 600,
};
export const contentType = 'image/png';

const LOGO_URL = 'https://veinvite.vercel.app/veinvite-logo-og.png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '600px',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          backgroundImage:
            'linear-gradient(135deg, #ffffff 0%, #fffdf7 66%, #f5f6fa 100%)',
          color: '#090b18',
        }}
      >
        <div
          style={{
            width: '68%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            padding: '54px 0 46px 64px',
            zIndex: 2,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img
              src={LOGO_URL}
              alt=""
              width="64"
              height="64"
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                marginRight: '18px',
              }}
            />
            <div
              style={{
                display: 'flex',
                fontSize: '48px',
                lineHeight: 1,
                fontWeight: 800,
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
              marginTop: '64px',
            }}
          >
            <div
              style={{
                display: 'flex',
                maxWidth: '700px',
                fontSize: '61px',
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing: '-2.8px',
              }}
            >
              You’ve been invited to VeInvite.
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: '24px',
                fontSize: '39px',
                lineHeight: 1.1,
                fontWeight: 800,
                color: '#f3ad08',
                letterSpacing: '-1.5px',
              }}
            >
              Join. Verify. Earn B3TR.
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: '14px',
                fontSize: '25px',
                lineHeight: 1.25,
                color: '#747989',
              }}
            >
              Complete missions and start earning rewards.
            </div>
          </div>
        </div>

        <div
          style={{
            width: '32%',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: '410px',
              height: '410px',
              borderRadius: '205px',
              backgroundColor: '#fff5d6',
              top: '88px',
              left: '-36px',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: '520px',
              height: '520px',
              borderRadius: '260px',
              border: '3px solid #ffd45c',
              top: '-160px',
              left: '110px',
            }}
          />
          <img
            src={LOGO_URL}
            alt=""
            width="292"
            height="292"
            style={{
              width: '292px',
              height: '292px',
              borderRadius: '70px',
              zIndex: 2,
            }}
          />
          <div
            style={{
              position: 'absolute',
              display: 'flex',
              top: '116px',
              right: '50px',
              color: '#ffc21b',
              fontSize: '74px',
              lineHeight: 1,
              zIndex: 3,
            }}
          >
            ✦
          </div>
          <div
            style={{
              position: 'absolute',
              display: 'flex',
              top: '190px',
              right: '22px',
              color: '#ffd977',
              fontSize: '40px',
              lineHeight: 1,
              zIndex: 3,
            }}
          >
            ✦
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            width: '330px',
            height: '160px',
            borderRadius: '50%',
            backgroundColor: '#fff0b8',
            left: '-92px',
            bottom: '-98px',
          }}
        />
      </div>
    ),
    size,
  );
}
