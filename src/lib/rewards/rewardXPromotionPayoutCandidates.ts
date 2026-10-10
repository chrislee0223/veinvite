import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import type { VeBetterNetwork } from '@/lib/vebetter/network';

const PAGE_SIZE = 100;

function positiveId(value: unknown, name: string): string {
  const normalized = String(value ?? '');
  if (!/^\d+$/u.test(normalized) || BigInt(normalized) < 1n) {
    throw new Error(`X promotion ${name} is invalid.`);
  }
  return BigInt(normalized).toString();
}

async function settledIntentIds(intentIds: string[]) {
  if (intentIds.length === 0) return new Set<string>();

  const query = await supabaseAdmin
    .from('reward_x_promotion_payout_settlements')
    .select('intent_id')
    .in('intent_id', intentIds);

  if (query.error) {
    throw new Error(
      `X promotion settlement lookup failed: ${query.error.message}`,
    );
  }

  return new Set(
    (query.data ?? []).map((row) =>
      positiveId(row.intent_id, 'settled intent id'),
    ),
  );
}

async function securityClear(inviteCode: unknown, network: VeBetterNetwork) {
  const query = await supabaseAdmin.rpc(
    'reward_x_promotion_security_clear_v1',
    {
      p_invite_code: String(inviteCode ?? ''),
      p_network: network,
    },
  );
  if (query.error) {
    throw new Error(
      `X promotion security candidate check failed: ${query.error.message}`,
    );
  }
  return query.data === true;
}

export async function findCommittedPromotionIntentId(
  network: VeBetterNetwork,
): Promise<string | null> {
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = await supabaseAdmin
      .from('reward_x_promotion_payout_signed_transactions')
      .select('intent_id')
      .eq('network', network)
      .order('id', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (query.error) {
      throw new Error(
        `Committed X promotion payouts could not be loaded: ${query.error.message}`,
      );
    }

    const rows = query.data ?? [];
    const intentIds = rows.map((row) =>
      positiveId(row.intent_id, 'intent id'),
    );
    const settled = await settledIntentIds(intentIds);

    for (const intentId of intentIds) {
      if (!settled.has(intentId)) return intentId;
    }

    if (rows.length < PAGE_SIZE) return null;
  }
}

export async function findPayablePromotionIntentId(
  network: VeBetterNetwork,
): Promise<string | null> {
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = await supabaseAdmin
      .from('reward_x_promotion_payout_intents')
      .select('id,obligation_id,verification_id,invite_code')
      .eq('network', network)
      .order('id', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (query.error) {
      throw new Error(
        `X promotion payout intents could not be loaded: ${query.error.message}`,
      );
    }

    const rows = query.data ?? [];
    const intentIds = rows.map((row) =>
      positiveId(row.id, 'intent id'),
    );
    const settled = await settledIntentIds(intentIds);

    for (const row of rows) {
      const intentId = positiveId(row.id, 'intent id');
      if (settled.has(intentId)) continue;

      const [obligation, verification] = await Promise.all([
        supabaseAdmin
          .from('reward_x_promotion_obligations')
          .select('financial_state')
          .eq('id', row.obligation_id)
          .maybeSingle(),
        supabaseAdmin
          .from('reward_x_promotion_post_verifications')
          .select('verification_state,invalidated_at')
          .eq('id', row.verification_id)
          .maybeSingle(),
      ]);

      if (obligation.error) {
        throw new Error(
          `X promotion obligation candidate check failed: ${obligation.error.message}`,
        );
      }
      if (verification.error) {
        throw new Error(
          `X promotion verification candidate check failed: ${verification.error.message}`,
        );
      }

      if (
        obligation.data?.financial_state !== 'HELD' ||
        verification.data?.verification_state !== 'FINAL_VERIFIED' ||
        verification.data?.invalidated_at
      ) {
        continue;
      }

      if (await securityClear(row.invite_code, network)) return intentId;
    }

    if (rows.length < PAGE_SIZE) return null;
  }
}

export async function findEligibleFinalPromotionVerificationId(
  network: VeBetterNetwork,
): Promise<string | null> {
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = await supabaseAdmin
      .from('reward_x_promotion_post_verifications')
      .select('id,invite_code,obligation_id')
      .eq('network', network)
      .eq('verification_state', 'FINAL_VERIFIED')
      .is('invalidated_at', null)
      .order('final_verified_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (query.error) {
      throw new Error(
        `Final X promotion verifications could not be loaded: ${query.error.message}`,
      );
    }

    const rows = query.data ?? [];
    const verificationIds = rows.map((row) =>
      positiveId(row.id, 'verification id'),
    );
    const existing = verificationIds.length === 0
      ? { data: [], error: null }
      : await supabaseAdmin
          .from('reward_x_promotion_payout_intents')
          .select('verification_id')
          .in('verification_id', verificationIds);

    if (existing.error) {
      throw new Error(
        `X promotion intent candidate check failed: ${existing.error.message}`,
      );
    }

    const usedVerificationIds = new Set(
      (existing.data ?? []).map((row) =>
        positiveId(row.verification_id, 'used verification id'),
      ),
    );

    for (const row of rows) {
      const verificationId = positiveId(row.id, 'verification id');
      if (usedVerificationIds.has(verificationId)) continue;

      const obligation = await supabaseAdmin
        .from('reward_x_promotion_obligations')
        .select('financial_state')
        .eq('id', row.obligation_id)
        .maybeSingle();

      if (obligation.error) {
        throw new Error(
          `X promotion obligation candidate check failed: ${obligation.error.message}`,
        );
      }
      if (obligation.data?.financial_state !== 'HELD') continue;

      if (await securityClear(row.invite_code, network)) {
        return positiveId(row.id, 'verification id');
      }
    }

    if (rows.length < PAGE_SIZE) return null;
  }
}
