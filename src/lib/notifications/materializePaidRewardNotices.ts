import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';

const VALID_ROUND_ID = /^[1-9][0-9]*$/;
const VALID_WALLET = /^0x[0-9a-f]{40}$/;
const PAGE_SIZE = 250;
const MAX_ROWS = 10_000;

/**
 * Best-effort materialization of the already-existing REWARD_PAID notification
 * after an atomic, finalized payout. The canonical DB RPC verifies an exact
 * paid receipt and uses an immutable dedupe key. No new notification kind,
 * cron, transfer, or accounting write is introduced.
 *
 * Never let a notification issue roll back or misreport an already-finalized
 * financial payout. The existing wallet-authenticated history GET remains
 * an independent idempotent recovery path after an interrupted function.
 */
export async function safelyMaterializePaidRewardNoticesForRound(
  roundId: string,
): Promise<void> {
  try {
    if (!VALID_ROUND_ID.test(roundId)) {
      throw new Error('Invalid finalized reward round identifier');
    }
    const wallets = new Set<string>();
    let offset = 0;
    while (offset < MAX_ROWS) {
      const { data, error } = await supabaseAdmin
        .from('reward_payouts')
        .select('recipient_wallet')
        .eq('round_id', roundId)
        .eq('status', 'PAID')
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error('Paid notification wallet lookup failed: ' + error.message);
      const rows = data ?? [];
      for (const row of rows) {
        const wallet = String(row.recipient_wallet ?? '').trim().toLowerCase();
        if (!VALID_WALLET.test(wallet)) {
          throw new Error('Finalized payout recipient wallet is invalid');
        }
        wallets.add(wallet);
      }
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    if (offset >= MAX_ROWS) {
      throw new Error('Paid notification materialization exceeded bounded batch');
    }

    for (const wallet of wallets) {
      const { error } = await supabaseAdmin.rpc(
        'reconcile_verified_paid_reward_history',
        { p_inviter_wallet: wallet },
      );
      if (error) {
        throw new Error('Receipt-backed paid notification materialization failed: ' + error.message);
      }
    }
  } catch (error) {
    // A notification is never a reason to repeat a successful on-chain send.
    console.error('Post-finality paid notification reconciliation deferred:', error);
  }
}
