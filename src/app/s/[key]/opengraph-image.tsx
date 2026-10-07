import { ImageResponse } from 'next/og';

export const alt =
  'A friend earned B3TR with VeInvite — Join. Verify. Invite. Earn.';
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
                maxWidth: '690px',
                fontSize: '59px',
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing: '-2.7px',
              }}
            >
              A friend earned B3TR with VeInvite.
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
              Join. Verify. Invite. Earn.
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
              See how referrals turn into rewards.
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
            width="276"
            height="276"
            style={{
              width: '276px',
              height: '276px',
              borderRadius: '66px',
              zIndex: 2,
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: '104px',
              height: '104px',
              borderRadius: '52px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#ffd24a',
              border: '8px solid #fff3bf',
              color: '#a95f00',
              fontSize: '27px',
              fontWeight: 900,
              top: '136px',
              left: '-6px',
              zIndex: 3,
            }}
          >
            B3TR
          </div>
          <div
            style={{
              position: 'absolute',
              width: '76px',
              height: '76px',
              borderRadius: '38px',
              backgroundColor: '#ffd24a',
              border: '7px solid #fff3bf',
              right: '22px',
              bottom: '116px',
              zIndex: 3,
            }}
          />
          <div
            style={{
              position: 'absolute',
              display: 'flex',
              top: '112px',
              right: '44px',
              color: '#ffc21b',
              fontSize: '72px',
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
              top: '188px',
              right: '18px',
              color: '#ffd977',
              fontSize: '38px',
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
