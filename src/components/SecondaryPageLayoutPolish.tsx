export function SecondaryPageLayoutPolish() {
  return (
    <style jsx global>{`
      .guidePage,
      .leaderboardPage,
      .settingsPage {
        width:min(100%,520px) !important;
      }

      .guidePage > header,
      .leaderboardPage > header,
      .settingsPage > header {
        display:none !important;
      }

      .guidePage > .steps,
      .leaderboardPage > .impactCard,
      .settingsPage > .settingsCard:first-of-type {
        margin-top:0 !important;
      }

      .guidePage > .eligibilityCard,
      .leaderboardPage > .rankingCard,
      .settingsPage > .settingsCard:not(:first-of-type) {
        margin-top:18px !important;
      }

      .leaderboardPage .tableHeader,
      .leaderboardPage .rankRow {
        grid-template-columns:34px minmax(0,1fr) 76px 94px !important;
        gap:7px !important;
        align-items:center !important;
      }

      .leaderboardPage .tableHeader {
        display:grid !important;
        padding:0 12px 9px !important;
        color:#777269 !important;
        font-size:.58rem !important;
        font-weight:900 !important;
      }

      .leaderboardPage .tableHeader span:nth-child(3),
      .leaderboardPage .tableHeader span:nth-child(4) {
        text-align:right !important;
      }

      .leaderboardPage .rankRow {
        min-height:48px !important;
        padding:9px 12px !important;
      }

      .leaderboardPage .rankPrimary {
        display:contents !important;
      }

      .leaderboardPage .rankValue {
        min-width:0 !important;
      }

      .leaderboardPage .rankMetric {
        display:block !important;
        text-align:right !important;
      }

      .leaderboardPage .rankMetric small {
        display:none !important;
      }

      .leaderboardPage .rankMetric b {
        display:block !important;
        font-size:.7rem !important;
        white-space:nowrap !important;
      }

      @media (max-width:420px) {
        .leaderboardPage .tableHeader,
        .leaderboardPage .rankRow {
          grid-template-columns:30px minmax(0,1fr) 70px 88px !important;
          gap:6px !important;
        }

        .leaderboardPage .tableHeader {
          padding-left:10px !important;
          padding-right:10px !important;
          font-size:.55rem !important;
        }

        .leaderboardPage .rankRow {
          padding-left:10px !important;
          padding-right:10px !important;
        }

        .leaderboardPage .walletCell,
        .leaderboardPage .rankMetric b {
          font-size:.66rem !important;
        }
      }
    `}</style>
  );
}
