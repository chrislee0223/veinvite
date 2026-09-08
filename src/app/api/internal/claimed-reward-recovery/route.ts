import { createHash, timingSafeEqual } from 'node:crypto';

import { Hex, Transaction } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';
import { NextRequest, NextResponse } from 'next/server';

import { runAutomaticRewardPayout } from '@/lib/rewards/automaticRewardPayoutWithMnemonic';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

export const dynamic = 'force-dynamic';

const TOKEN_HASH = '4074a12102d8164cf7a199fb0e207c485f5edcba2d433995ba6be87007cbfe73';
const TARGET_INVITE_CODES = ['EALXSC8', 'QNU8TDF'] as const;

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function secureEquals(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const hash = createHash('sha256').update(token).digest('hex');
  return secureEquals(hash, TOKEN_HASH);
}

function blockRefNumber(blockRef: string) {
  if (!/^0x[0-9a-f]{16}$/i.test(blockRef)) return null;
  return Number.parseInt(blockRef.slice(2, 10), 16);
}

async function inspectActiveSubmittedTransaction() {
  const submissionResult = await supabaseAdmin
    .from('reward_payout_transaction_submissions')
    .select('manifest_id, round_id, tx_id, registered_at')
    .eq('round_id', 13)
    .maybeSingle();

  if (submissionResult.error || !submissionResult.data) {
    throw new Error(
      `Recovery submission could not be loaded: ${submissionResult.error?.message ?? 'missing submission'}`,
    );
  }

  const signedResult = await supabaseAdmin
    .from('reward_payout_signed_transactions')
    .select('manifest_id, round_id, tx_id, raw_tx_hex, created_at')
    .eq('manifest_id', submissionResult.data.manifest_id)
    .maybeSingle();

  if (signedResult.error || !signedResult.data) {
    throw new Error(
      `Recovery signed transaction could not be loaded: ${signedResult.error?.message ?? 'missing signed transaction'}`,
    );
  }

  const txId = String(submissionResult.data.tx_id).toLowerCase();
  const rawTxHex = String(signedResult.data.raw_tx_hex).toLowerCase();
  const decoded = Transaction.decode(Hex.of(rawTxHex).bytes, true);
  const blockRef = String(decoded.body.blockRef).toLowerCase();
  const expiration = Number(decoded.body.expiration);
  const refNumber = blockRefNumber(blockRef);
  const expiryBlock =
    refNumber !== null && Number.isSafeInteger(expiration)
      ? refNumber + expiration
      : null;

  const { nodeUrl } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);

  const [confirmed, pending, receipt, best, finalized] = await Promise.all([
    thor.transactions.getTransaction(txId).catch(() => null),
    thor.transactions.getTransaction(txId, { pending: true }).catch(() => null),
    thor.transactions.getTransactionReceipt(txId).catch(() => null),
    thor.blocks.getBestBlockCompressed().catch(() => null),
    thor.blocks.getBlockCompressed('finalized').catch(() => null),
  ]);

  const bestNumber = best ? Number(best.number) : null;
  const finalizedNumber = finalized ? Number(finalized.number) : null;
  const receiptMeta = receipt?.meta;
  const receiptBlockNumber = receiptMeta ? Number(receiptMeta.blockNumber) : null;

  return {
    txId,
    registeredAt: submissionResult.data.registered_at,
    signedAt: signedResult.data.created_at,
    blockRef,
    blockRefNumber: refNumber,
    expiration,
    expiryBlock,
    bestBlockNumber: bestNumber,
    finalizedBlockNumber: finalizedNumber,
    confirmedFound: Boolean(confirmed),
    pendingFound: Boolean(pending),
    receiptFound: Boolean(receipt),
    receiptReverted: receipt ? receipt.reverted : null,
    receiptBlockNumber,
    receiptBlockId: receiptMeta ? String(receiptMeta.blockID).toLowerCase() : null,
    expiredByBest:
      expiryBlock !== null &&
      bestNumber !== null &&
      bestNumber > expiryBlock,
    safeToReplaceAsExpired:
      !confirmed &&
      !pending &&
      !receipt &&
      expiryBlock !== null &&
      bestNumber !== null &&
      bestNumber > expiryBlock,
  };
}

/**
 * Temporary, token-protected recovery entrypoint for two rewards whose explicit
 * Claim was durably recorded before the Claim-immediate-retry fix reached
 * Production. Exact wallet, amount, claim, eligibility and queue checks are
 * performed inside Postgres so 21-digit wei values never cross a JavaScript
 * Number boundary before validation. This route never creates a custom transfer;
 * it only re-enters the normal automatic payout worker after exact DB preflight.
 * Remove this route and its verifier immediately after both rewards finalize.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return noStoreJson({ error: 'Unauthorized.' }, 401);
  }

  const preflight = await supabaseAdmin.rpc(
    'verify_two_claimed_reward_recovery_exactly',
  );

  if (preflight.error || preflight.data !== true) {
    console.error(
      'Exact claimed reward recovery preflight failed:',
      preflight.error,
    );
    return noStoreJson(
      { error: 'Claimed reward recovery safety preflight failed.' },
      409,
    );
  }

  const payoutResult = await supabaseAdmin
    .from('reward_payouts')
    .select('id, round_id, invite_code, recipient_wallet, amount_wei, status, tx_id, paid_at')
    .in('invite_code', TARGET_INVITE_CODES);

  if (payoutResult.error) {
    return noStoreJson({ error: 'Target payout state could not be verified.' }, 500);
  }

  const payouts = payoutResult.data ?? [];
  if (
    payouts.length === TARGET_INVITE_CODES.length &&
    payouts.every((row) => row.status === 'PAID' && row.tx_id && row.paid_at)
  ) {
    return noStoreJson({
      status: 'ALREADY_PAID',
      payouts,
      transfersPerformed: false,
    });
  }

  if (request.nextUrl.searchParams.get('inspect') === '1') {
    try {
      return noStoreJson({
        status: 'CHAIN_INSPECTION',
        inspection: await inspectActiveSubmittedTransaction(),
      });
    } catch (error) {
      console.error('Claimed reward chain inspection failed:', error);
      return noStoreJson({ error: 'Claimed reward chain inspection failed.' }, 500);
    }
  }

  try {
    const payout = await runAutomaticRewardPayout();
    return noStoreJson({ status: 'RECOVERY_ITERATION_COMPLETE', payout });
  } catch (error) {
    console.error('Claimed reward recovery failed:', error);
    return noStoreJson({ error: 'Claimed reward recovery iteration failed.' }, 500);
  }
}