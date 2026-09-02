export function LeaderboardLaurelPreviewOverride() {
  return (
    <style jsx global>{`
      /*
       * Preview-only refinement of the approved podium reference.
       * The laurel uses one clean row of separated leaves on a thin curved stem,
       * then mirrors that exact branch on the right. The number remains the
       * fixed optical center on every viewport.
       */
      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue {
        width:60px !important;
        height:30px !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        justify-self:center !important;
        position:relative !important;
        box-sizing:border-box !important;
        padding:0 !important;
        border:0 !important;
        border-radius:0 !important;
        background:transparent !important;
        box-shadow:none !important;
        font-size:1.02rem !important;
        font-weight:900 !important;
        line-height:1 !important;
        letter-spacing:0 !important;
        font-variant-numeric:tabular-nums !important;
      }

      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::before,
      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::after {
        content:'' !important;
        position:absolute !important;
        top:50% !important;
        width:16px !important;
        height:27px !important;
        background:currentColor !important;
        -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 30'%3E%3Cpath d='M14.3 2.3C11 6.5 8.2 11.5 6.8 17.2C5.9 20.9 5.9 24.7 7.1 28.1' fill='none' stroke='black' stroke-width='.8' stroke-linecap='round'/%3E%3Cg fill='black'%3E%3Cellipse cx='13.5' cy='3.5' rx='.95' ry='1.85' transform='rotate(43 13.5 3.5)'/%3E%3Cellipse cx='11.3' cy='7.3' rx='.95' ry='1.85' transform='rotate(37 11.3 7.3)'/%3E%3Cellipse cx='9.4' cy='11.3' rx='.95' ry='1.85' transform='rotate(31 9.4 11.3)'/%3E%3Cellipse cx='7.9' cy='15.4' rx='.95' ry='1.85' transform='rotate(24 7.9 15.4)'/%3E%3Cellipse cx='6.9' cy='19.5' rx='.95' ry='1.85' transform='rotate(16 6.9 19.5)'/%3E%3Cellipse cx='6.6' cy='23.6' rx='.95' ry='1.85' transform='rotate(6 6.6 23.6)'/%3E%3Cellipse cx='7.2' cy='27.1' rx='.95' ry='1.8' transform='rotate(-10 7.2 27.1)'/%3E%3C/g%3E%3C/svg%3E") center / contain no-repeat !important;
        mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 30'%3E%3Cpath d='M14.3 2.3C11 6.5 8.2 11.5 6.8 17.2C5.9 20.9 5.9 24.7 7.1 28.1' fill='none' stroke='black' stroke-width='.8' stroke-linecap='round'/%3E%3Cg fill='black'%3E%3Cellipse cx='13.5' cy='3.5' rx='.95' ry='1.85' transform='rotate(43 13.5 3.5)'/%3E%3Cellipse cx='11.3' cy='7.3' rx='.95' ry='1.85' transform='rotate(37 11.3 7.3)'/%3E%3Cellipse cx='9.4' cy='11.3' rx='.95' ry='1.85' transform='rotate(31 9.4 11.3)'/%3E%3Cellipse cx='7.9' cy='15.4' rx='.95' ry='1.85' transform='rotate(24 7.9 15.4)'/%3E%3Cellipse cx='6.9' cy='19.5' rx='.95' ry='1.85' transform='rotate(16 6.9 19.5)'/%3E%3Cellipse cx='6.6' cy='23.6' rx='.95' ry='1.85' transform='rotate(6 6.6 23.6)'/%3E%3Cellipse cx='7.2' cy='27.1' rx='.95' ry='1.8' transform='rotate(-10 7.2 27.1)'/%3E%3C/g%3E%3C/svg%3E") center / contain no-repeat !important;
      }

      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::before {
        left:1px !important;
        transform:translateY(-50%) !important;
        transform-origin:center !important;
      }

      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::after {
        right:1px !important;
        transform:translateY(-50%) scaleX(-1) !important;
        transform-origin:center !important;
      }

      /*
       * A ranked current wallet stays in the normal table geometry but gets a
       * restrained translucent bar so the user can immediately locate themself.
       * No extra label or column is introduced, so alignment is unchanged.
       */
      .leaderboardPage .rankRow.current {
        background:linear-gradient(
          90deg,
          rgba(244,183,40,.13) 0%,
          rgba(244,183,40,.055) 48%,
          rgba(244,183,40,.09) 100%
        ) !important;
        box-shadow:
          inset 3px 0 0 rgba(244,183,40,.72),
          inset 0 0 0 1px rgba(244,183,40,.13) !important;
        border-radius:10px !important;
      }

      .leaderboardPage .rankRow.current .walletText,
      .leaderboardPage .rankRow.current .rankMetric b {
        color:#fff8e7 !important;
      }

      @media (max-width:420px) {
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue {
          width:55px !important;
          height:28px !important;
          font-size:.98rem !important;
        }
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::before,
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::after {
          width:14px !important;
          height:24px !important;
        }
      }

      @media (max-width:360px) {
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue {
          width:51px !important;
          height:26px !important;
          font-size:.94rem !important;
        }
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::before,
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::after {
          width:13px !important;
          height:22px !important;
        }
      }
    `}</style>
  );
}
