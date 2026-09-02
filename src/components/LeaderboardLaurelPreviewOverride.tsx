export function LeaderboardLaurelPreviewOverride() {
  return (
    <style jsx global>{`
      /*
       * Preview-only refinement of the approved podium reference.
       * Each side is the same fuller laurel branch; the right branch is an
       * exact mirror. The number owns the fixed optical center on every device.
       */
      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue {
        width:64px !important;
        height:32px !important;
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
        width:17px !important;
        height:29px !important;
        background:currentColor !important;
        -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 32'%3E%3Cpath d='M15.3 2.1C11.2 6.2 7.9 11.5 6.1 17.2C4.8 21.4 4.9 25.9 7.2 29.8' fill='none' stroke='black' stroke-width='1.45' stroke-linecap='round'/%3E%3Cg fill='black'%3E%3Cellipse cx='14.2' cy='3.7' rx='1.8' ry='3.05' transform='rotate(42 14.2 3.7)'/%3E%3Cellipse cx='11.9' cy='6.9' rx='1.75' ry='3' transform='rotate(35 11.9 6.9)'/%3E%3Cellipse cx='9.9' cy='10.4' rx='1.7' ry='2.95' transform='rotate(29 9.9 10.4)'/%3E%3Cellipse cx='8.1' cy='14.1' rx='1.68' ry='2.9' transform='rotate(21 8.1 14.1)'/%3E%3Cellipse cx='6.9' cy='18.1' rx='1.66' ry='2.85' transform='rotate(12 6.9 18.1)'/%3E%3Cellipse cx='6.3' cy='22.1' rx='1.63' ry='2.8' transform='rotate(1 6.3 22.1)'/%3E%3Cellipse cx='6.5' cy='25.8' rx='1.6' ry='2.72' transform='rotate(-13 6.5 25.8)'/%3E%3Cellipse cx='7.7' cy='28.8' rx='1.55' ry='2.55' transform='rotate(-28 7.7 28.8)'/%3E%3Cellipse cx='11.6' cy='5.1' rx='1.28' ry='2.35' transform='rotate(-41 11.6 5.1)'/%3E%3Cellipse cx='9.1' cy='8.9' rx='1.25' ry='2.28' transform='rotate(-34 9.1 8.9)'/%3E%3Cellipse cx='7.2' cy='13' rx='1.22' ry='2.2' transform='rotate(-25 7.2 13)'/%3E%3Cellipse cx='5.9' cy='17.3' rx='1.18' ry='2.12' transform='rotate(-15 5.9 17.3)'/%3E%3Cellipse cx='5.2' cy='21.6' rx='1.14' ry='2.02' transform='rotate(-3 5.2 21.6)'/%3E%3C/g%3E%3C/svg%3E") center / contain no-repeat !important;
        mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 32'%3E%3Cpath d='M15.3 2.1C11.2 6.2 7.9 11.5 6.1 17.2C4.8 21.4 4.9 25.9 7.2 29.8' fill='none' stroke='black' stroke-width='1.45' stroke-linecap='round'/%3E%3Cg fill='black'%3E%3Cellipse cx='14.2' cy='3.7' rx='1.8' ry='3.05' transform='rotate(42 14.2 3.7)'/%3E%3Cellipse cx='11.9' cy='6.9' rx='1.75' ry='3' transform='rotate(35 11.9 6.9)'/%3E%3Cellipse cx='9.9' cy='10.4' rx='1.7' ry='2.95' transform='rotate(29 9.9 10.4)'/%3E%3Cellipse cx='8.1' cy='14.1' rx='1.68' ry='2.9' transform='rotate(21 8.1 14.1)'/%3E%3Cellipse cx='6.9' cy='18.1' rx='1.66' ry='2.85' transform='rotate(12 6.9 18.1)'/%3E%3Cellipse cx='6.3' cy='22.1' rx='1.63' ry='2.8' transform='rotate(1 6.3 22.1)'/%3E%3Cellipse cx='6.5' cy='25.8' rx='1.6' ry='2.72' transform='rotate(-13 6.5 25.8)'/%3E%3Cellipse cx='7.7' cy='28.8' rx='1.55' ry='2.55' transform='rotate(-28 7.7 28.8)'/%3E%3Cellipse cx='11.6' cy='5.1' rx='1.28' ry='2.35' transform='rotate(-41 11.6 5.1)'/%3E%3Cellipse cx='9.1' cy='8.9' rx='1.25' ry='2.28' transform='rotate(-34 9.1 8.9)'/%3E%3Cellipse cx='7.2' cy='13' rx='1.22' ry='2.2' transform='rotate(-25 7.2 13)'/%3E%3Cellipse cx='5.9' cy='17.3' rx='1.18' ry='2.12' transform='rotate(-15 5.9 17.3)'/%3E%3Cellipse cx='5.2' cy='21.6' rx='1.14' ry='2.02' transform='rotate(-3 5.2 21.6)'/%3E%3C/g%3E%3C/svg%3E") center / contain no-repeat !important;
      }

      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::before {
        left:0 !important;
        transform:translateY(-50%) !important;
        transform-origin:center !important;
      }

      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::after {
        right:0 !important;
        transform:translateY(-50%) scaleX(-1) !important;
        transform-origin:center !important;
      }

      @media (max-width:420px) {
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue {
          width:58px !important;
          height:29px !important;
          font-size:.98rem !important;
        }
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::before,
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::after {
          width:15px !important;
          height:26px !important;
        }
      }

      @media (max-width:360px) {
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue {
          width:54px !important;
          height:27px !important;
          font-size:.94rem !important;
        }
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::before,
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::after {
          width:14px !important;
          height:24px !important;
        }
      }
    `}</style>
  );
}
