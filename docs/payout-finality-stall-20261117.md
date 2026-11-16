## Root cause confirmed with read-only VeChain Mainnet node
- Signed and broadcast TXs for invite codes ACXKGKC and R4LKDJM were canonical and non-reverted, and each emitted exactly 2,461.269237422699498006 B3TR ERC-20 Transfer to the verified inviter 0x959bc7f14356551b969afa93db1778b7e2eb8024.
- At 2026-11-16T18:54Z, VeChain head 26432254, finalized head 26431740 (85-minute / 514-block finality lag). TX blocks 26431795 and 26431798 are canonical but not full-finalized. Do **not** re-broadcast, manually mark PAID, change finality verifier, or manipulate reservation.
- Current DB already has canonical broadcast_confirmed_at set for rounds 44 and 45. Their payout rows correctly stay PENDING until actual finality.
## Changes
- Admin history displays *온체인 송금 확인 · 최종 확정 대기* and links verified immutable TX ID when the canonical-confirmed broadcast marker is present, even before PAID settlement. Adds separate transmitted-vs-financial-pending counters.
- User-facing Claim widget uses existing transferConfirmed translations (all locales) rather than the generic final-check label.
- No payout/financial mutation, RPC weakenings, extra notifications, scheduled jobs, or Supabase migration.
## Safety
- Only display a transfer as on-chain confirmed if the **trusted server-only DB broadcast confirmation marker** and immutable registered submission TX ID are both available.
- A merely signed/submitted TX without canonical proof remains PENDING/processing.
- PAID, receipts and accounting continue to require full VeChain finality; the existing minute-by-minute recovery cron remains unchanged.
