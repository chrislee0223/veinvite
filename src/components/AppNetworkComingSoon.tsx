import { NETWORK_COPY } from '@/lib/i18n/networkCopy';
import {
  getLocaleDirection,
  type Locale,
  type SupportedLocale,
} from '@/lib/i18n/locales';

export function AppNetworkComingSoon({ locale }: { locale: Locale }) {
  const supportedLocale = locale as SupportedLocale;
  const t = NETWORK_COPY[supportedLocale] ?? NETWORK_COPY.en;

  return (
    <section
      className="networkPage"
      lang={supportedLocale}
      dir={getLocaleDirection(supportedLocale)}
    >
      <div className="networkCard">
        <div className="networkVisual" aria-hidden="true">
          <span className="node root" />
          <span className="node left" />
          <span className="node right" />
          <span className="line leftLine" />
          <span className="line rightLine" />
        </div>
        <span className="status">{t.status}</span>
        <h1>{t.title}</h1>
        <p>{t.description}</p>
      </div>

      <style jsx>{`
        .networkPage {
          width:min(100%,520px);
          min-width:0;
          margin:0 auto;
          padding-bottom:12px;
        }
        .networkCard {
          min-width:0;
          min-height:420px;
          padding:42px 26px;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          box-sizing:border-box;
          border:1px solid rgba(255,205,80,.14);
          border-radius:28px;
          background:
            radial-gradient(circle at 50% 25%,rgba(244,183,40,.12),transparent 34%),
            rgba(255,255,255,.028);
          text-align:center;
        }
        .networkVisual {
          position:relative;
          width:126px;
          height:86px;
          margin-bottom:22px;
        }
        .node {
          position:absolute;
          z-index:2;
          width:24px;
          height:24px;
          border:2px solid rgba(255,211,92,.72);
          border-radius:50%;
          background:#15130e;
          box-shadow:0 0 20px rgba(244,183,40,.12);
        }
        .node.root { top:0; left:50%; transform:translateX(-50%); background:#f4b728; border-color:#ffd86f; }
        .node.left { left:14px; bottom:0; }
        .node.right { right:14px; bottom:0; }
        .line {
          position:absolute;
          z-index:1;
          top:23px;
          width:64px;
          height:2px;
          background:linear-gradient(90deg,rgba(244,183,40,.68),rgba(244,183,40,.16));
          transform-origin:0 50%;
        }
        .leftLine { left:61px; transform:rotate(136deg); }
        .rightLine { left:65px; transform:rotate(44deg); }
        .status {
          min-width:0;
          max-width:100%;
          padding:6px 10px;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          box-sizing:border-box;
          border:1px solid rgba(255,205,80,.18);
          border-radius:999px;
          background:rgba(244,183,40,.07);
          color:#f5c857;
          font-size:.62rem;
          font-weight:950;
          line-height:1.25;
          letter-spacing:.08em;
          text-align:center;
          white-space:normal;
          overflow-wrap:normal;
          word-break:normal;
          hyphens:none;
          text-wrap:balance;
        }
        h1 {
          max-width:430px;
          margin:16px 0 0;
          color:#f8f4ea;
          font-size:clamp(1.7rem,7vw,2.35rem);
          line-height:1.08;
          letter-spacing:-.045em;
          text-wrap:balance;
          overflow-wrap:normal;
          word-break:normal;
          hyphens:none;
        }
        p {
          max-width:430px;
          margin:14px 0 0;
          color:#938f87;
          font-size:.82rem;
          line-height:1.65;
          overflow-wrap:normal;
          word-break:normal;
          hyphens:none;
          text-wrap:pretty;
        }
        :global(html[lang='ko']) .networkCard :is(.status,h1,p) {
          word-break:keep-all;
          overflow-wrap:normal;
        }
        :global(html:is([lang='zh'],[lang='zh-tw'],[lang='ja'])) .networkCard {
          line-break:strict;
          word-break:normal;
        }
        :global(html:is([data-locale-typography='arabic'],[data-locale-typography='indic'])) .networkCard h1 {
          line-height:1.25;
        }
        :global(html[lang='ur']) .networkCard h1 {
          line-height:1.35;
        }
        :global(html:is([data-locale-typography='arabic'],[data-locale-typography='indic'],[data-locale-typography='cjk'])) .status {
          letter-spacing:0;
        }
        :global(html[data-locale-typography='arabic']) .status,
        :global(html[data-locale-typography='indic']) .status {
          line-height:1.48;
        }
        :global(html[lang='ur']) .status {
          line-height:1.6;
        }
        @media (max-width:420px) {
          .networkCard {
            min-height:390px;
            padding:34px 20px;
            border-radius:24px;
          }
        }
      `}</style>
    </section>
  );
}
