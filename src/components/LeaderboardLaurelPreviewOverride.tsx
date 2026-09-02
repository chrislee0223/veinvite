export function LeaderboardLaurelPreviewOverride() {
  return (
    <style jsx global>{`
      /* Preview-only: remove all laurel decoration from ranks 1-3. */
      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::before,
      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::after {
        content:none !important;
        display:none !important;
        -webkit-mask:none !important;
        mask:none !important;
        background:none !important;
      }

      /* Keep the connected wallet easy to find using fill only. */
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
        outline:0 !important;
        box-shadow:none !important;
      }

      .leaderboardPage .rankRow.current .walletText,
      .leaderboardPage .rankRow.current .rankMetric b {
        color:#fff8e7 !important;
      }
    `}</style>
  );
}
