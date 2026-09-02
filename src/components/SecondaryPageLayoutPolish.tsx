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

      .leaderboardPage .rankingTopline {
        display:none !important;
      }

      /*
       * Leaderboard geometry is proportional to the card width, not to any
       * screenshot or device width. Header and every data row use this exact
       * same 12 / 40 / 20 / 28 split, so each value remains centered directly
       * below its label at every responsive size.
       */
      .leaderboardPage .tableHeader,
      .leaderboardPage .rankRow {
        width:100% !important;
        min-width:0 !important;
        display:grid !important;
        grid-template-columns:12% 40% 20% 28% !important;
        column-gap:0 !important;
        align-items:center !important;
        box-sizing:border-box !important;
        padding-left:12px !important;
        padding-right:12px !important;
      }

      .leaderboardPage .tableHeader > span,
      .leaderboardPage .rankValue,
      .leaderboardPage .walletCell,
      .leaderboardPage .completedMetric,
      .leaderboardPage .rewardMetric {
        min-width:0 !important;
        justify-self:stretch !important;
        text-align:center !important;
      }

      .leaderboardPage .rankValue {
        grid-column:1 !important;
      }

      .leaderboardPage .walletCell {
        grid-column:2 !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        overflow:hidden !important;
      }

      .leaderboardPage .completedMetric {
        grid-column:3 !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
      }

      .leaderboardPage .rewardMetric {
        grid-column:4 !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
      }

      .leaderboardPage .walletText,
      .leaderboardPage .rankMetric b {
        min-width:0 !important;
      }

      .leaderboardPage .walletText {
        overflow:hidden !important;
        text-overflow:ellipsis !important;
        white-space:nowrap !important;
      }

      .leaderboardPage .rankMetric b {
        white-space:nowrap !important;
      }

      @media (max-width:420px) {
        .leaderboardPage .tableHeader,
        .leaderboardPage .rankRow {
          padding-left:8px !important;
          padding-right:8px !important;
        }
      }

      @media (max-width:360px) {
        .leaderboardPage .tableHeader,
        .leaderboardPage .rankRow {
          padding-left:6px !important;
          padding-right:6px !important;
        }
      }
    `}</style>
  );
}