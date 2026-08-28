# Known Limitations — 2026-08-28

- The Vercel Preview environment is still wired to the Production Supabase URL. A fail-closed runtime guard prevents Preview from reading Production, but the Preview environment variables must be corrected before Preview application testing is usable.
- A full live-wallet staging journey with one wallet receiving qualifying rewards from three distinct dApps has not been completed because suitable staging activity was unavailable. The production rules are not weakened to simulate success.
- Foreground invite pages reconcile on-chain progress while they are open. The independent fallback cron currently runs daily, while the data-quality stale threshold is one hour; abandoned or closed-page missions can therefore appear stale between cron runs. Higher-frequency independent reconciliation still requires a suitable scheduler/hosting plan.
- General B3TR wallet-to-wallet transfers are not indexed. Detecting many invitee wallets later consolidating funds into an inviter wallet needs a separate transfer indexer and review report.
- Mainnet funded referral rewards are intentionally disabled until policy, funding, operator preflight, and payout-manifest gates pass.
- Privacy and Terms are published product documents, but final jurisdiction-specific legal review remains an external launch item.
- Device fingerprinting is not implemented. Any future use should be optional, privacy-minimizing, and only one signal among several.
