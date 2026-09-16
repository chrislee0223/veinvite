export function LeaderboardMovementColorPolish() {
  return (
    <style jsx global>{`
      /*
       * Rank movement keeps a consistent global meaning across locales:
       * upward movement is green, downward movement is red, and a new entry is
       * neutral white. The arrow/text labels remain the primary cue, so color
       * never becomes the only way to understand the state.
       */
      .leaderboardPage .rankMovement.up {
        color:#76d394 !important;
      }

      .leaderboardPage .rankMovement.down {
        color:#ff7b7b !important;
      }

      .leaderboardPage .rankMovement.new {
        color:#f0ede6 !important;
      }
    `}</style>
  );
}
