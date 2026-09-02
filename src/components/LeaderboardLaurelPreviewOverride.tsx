export function LeaderboardLaurelPreviewOverride() {
  return (
    <style jsx global>{`
      /*
       * Preview-only podium treatment based on the approved laurel reference.
       * One branch is drawn from separated pointed leaves on a light curved stem;
       * the right branch is an exact mirror. The rank number owns the optical
       * center so desktop and mobile keep the same alignment.
       */
      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue {
        width:66px !important;
        height:31px !important;
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
        width:20px !important;
        height:29px !important;
        background:currentColor !important;
        -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 34'%3E%3Cpath d='M17.8 2.3C13.4 6.2 10 11 7.9 16.5C6.1 21.2 6.2 26.9 9 31.8' fill='none' stroke='black' stroke-width='.72' stroke-linecap='round'/%3E%3Cg fill='black'%3E%3Cpath d='M17.7 2.3C14.7 2.7 12.9 4.2 12.3 6.6C15.1 6.2 17.1 4.7 17.7 2.3Z'/%3E%3Cpath d='M14.9 5.4C11.9 5.8 10.1 7.2 9.5 9.6C12.4 9.2 14.3 7.8 14.9 5.4Z'/%3E%3Cpath d='M12.5 9C9.6 9.4 7.8 10.9 7.3 13.2C10.1 12.8 12 11.4 12.5 9Z'/%3E%3Cpath d='M10.4 13C7.7 13.5 6 15 5.6 17.3C8.3 16.8 10 15.4 10.4 13Z'/%3E%3Cpath d='M8.9 17.4C6.3 18 4.8 19.6 4.6 21.9C7.1 21.3 8.7 19.7 8.9 17.4Z'/%3E%3Cpath d='M8 22C5.6 22.8 4.3 24.5 4.4 26.8C6.8 26 8.1 24.3 8 22Z'/%3E%3Cpath d='M8.1 26.5C5.9 27.5 4.8 29.3 5.2 31.5C7.4 30.5 8.5 28.7 8.1 26.5Z'/%3E%3Cpath d='M15.2 4.2C15.3 6.5 16.5 8 18.8 8.8C18.6 6.5 17.5 4.9 15.2 4.2Z'/%3E%3Cpath d='M12.4 7.8C12.5 10.1 13.7 11.6 15.9 12.4C15.8 10.1 14.6 8.5 12.4 7.8Z'/%3E%3Cpath d='M10.1 11.9C10.2 14.2 11.4 15.7 13.6 16.5C13.5 14.2 12.3 12.6 10.1 11.9Z'/%3E%3Cpath d='M8.4 16.3C8.6 18.5 9.8 20 12 20.7C11.8 18.5 10.6 17 8.4 16.3Z'/%3E%3Cpath d='M7.4 20.9C7.7 23.1 8.9 24.5 11.1 25.1C10.8 22.9 9.6 21.5 7.4 20.9Z'/%3E%3Cpath d='M7.3 25.4C7.7 27.6 9 28.9 11.2 29.4C10.8 27.2 9.5 25.9 7.3 25.4Z'/%3E%3C/g%3E%3C/svg%3E") center / contain no-repeat !important;
        mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 34'%3E%3Cpath d='M17.8 2.3C13.4 6.2 10 11 7.9 16.5C6.1 21.2 6.2 26.9 9 31.8' fill='none' stroke='black' stroke-width='.72' stroke-linecap='round'/%3E%3Cg fill='black'%3E%3Cpath d='M17.7 2.3C14.7 2.7 12.9 4.2 12.3 6.6C15.1 6.2 17.1 4.7 17.7 2.3Z'/%3E%3Cpath d='M14.9 5.4C11.9 5.8 10.1 7.2 9.5 9.6C12.4 9.2 14.3 7.8 14.9 5.4Z'/%3E%3Cpath d='M12.5 9C9.6 9.4 7.8 10.9 7.3 13.2C10.1 12.8 12 11.4 12.5 9Z'/%3E%3Cpath d='M10.4 13C7.7 13.5 6 15 5.6 17.3C8.3 16.8 10 15.4 10.4 13Z'/%3E%3Cpath d='M8.9 17.4C6.3 18 4.8 19.6 4.6 21.9C7.1 21.3 8.7 19.7 8.9 17.4Z'/%3E%3Cpath d='M8 22C5.6 22.8 4.3 24.5 4.4 26.8C6.8 26 8.1 24.3 8 22Z'/%3E%3Cpath d='M8.1 26.5C5.9 27.5 4.8 29.3 5.2 31.5C7.4 30.5 8.5 28.7 8.1 26.5Z'/%3E%3Cpath d='M15.2 4.2C15.3 6.5 16.5 8 18.8 8.8C18.6 6.5 17.5 4.9 15.2 4.2Z'/%3E%3Cpath d='M12.4 7.8C12.5 10.1 13.7 11.6 15.9 12.4C15.8 10.1 14.6 8.5 12.4 7.8Z'/%3E%3Cpath d='M10.1 11.9C10.2 14.2 11.4 15.7 13.6 16.5C13.5 14.2 12.3 12.6 10.1 11.9Z'/%3E%3Cpath d='M8.4 16.3C8.6 18.5 9.8 20 12 20.7C11.8 18.5 10.6 17 8.4 16.3Z'/%3E%3Cpath d='M7.4 20.9C7.7 23.1 8.9 24.5 11.1 25.1C10.8 22.9 9.6 21.5 7.4 20.9Z'/%3E%3Cpath d='M7.3 25.4C7.7 27.6 9 28.9 11.2 29.4C10.8 27.2 9.5 25.9 7.3 25.4Z'/%3E%3C/g%3E%3C/svg%3E") center / contain no-repeat !important;
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

      /* Highlight the connected wallet with fill only: no outline, no left rule. */
      .leaderboardPage .rankRow.current,
      .leaderboardPage .rankRow.current:hover,
      .leaderboardPage .rankRow.current:focus,
      .leaderboardPage .rankRow.current:focus-visible {
        background:linear-gradient(
          90deg,
          rgba(244,183,40,.10) 0%,
          rgba(244,183,40,.055) 52%,
          rgba(244,183,40,.08) 100%
        ) !important;
        border:0 !important;
        outline:0 !important;
        box-shadow:none !important;
        border-radius:10px !important;
      }

      .leaderboardPage .rankRow.current::before,
      .leaderboardPage .rankRow.current::after {
        border:0 !important;
        box-shadow:none !important;
      }

      .leaderboardPage .rankRow.current .walletText,
      .leaderboardPage .rankRow.current .rankMetric b {
        color:#fff8e7 !important;
      }

      @media (max-width:420px) {
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue {
          width:60px !important;
          height:29px !important;
          font-size:.98rem !important;
        }
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::before,
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::after {
          width:18px !important;
          height:27px !important;
        }
      }

      @media (max-width:360px) {
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue {
          width:56px !important;
          height:27px !important;
          font-size:.94rem !important;
        }
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::before,
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::after {
          width:17px !important;
          height:25px !important;
        }
      }
    `}</style>
  );
}
