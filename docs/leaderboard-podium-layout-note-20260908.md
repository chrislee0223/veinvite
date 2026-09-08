# Inviter leaderboard podium layout authority — 2026-09-08

The production inviter leaderboard has one explicit podium/rank geometry authority: `src/app/leaderboard-podium-unified.css`.

Rules:
- Rank positions are driven by `data-rank`, never DOM order or `nth-child`.
- Rank 1 owns the crown and gold laurel; rank 2 owns a silver laurel; rank 3 owns a bronze laurel.
- Empty rank 2/3 placeholders keep the same podium decoration as populated rows.
- Rank numerals use one fixed axis for every supported locale and screen width.
- NEW/up/down movement copy occupies a separate full-width rank slot and cannot move the numeral or podium.
- RTL locales translate copy direction only; rank, wallet, completion and reward geometry remain physically stable.
- Legacy podium stylesheets (`podium-laurel-option-c.css`, `podium-laurel-size-tuning.css`, `leaderboard-rank-axis-hardening.css`) must not be re-imported.
- Stored leaderboard/reward data is unaffected; this is presentation-only.
