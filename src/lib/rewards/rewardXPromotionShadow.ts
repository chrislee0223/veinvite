import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

export type RewardXPromotionShadowSyncResult = {
  enabled: boolean;
  network: string;
  consideredCount: number;
  createdCount: number;
  reservationWei: string;
  baseWei: string;
  promotionWei: string;
  policyVersion: string;
  shadowStartedAt: string | null;
  liveStartedAt: string | null;
};

function nonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`X promotion shadow ${fieldName} is invalid.`);
  }
  return parsed;
}

function weiString(
  value: unknown,
  fieldName: string,
): string {
  const normalized = String(value ?? '');
  if (!/^\d+$/u.test(normalized)) {
    throw new Error(`X promotion shadow ${fieldName} is invalid.`);
  }
  return BigInt(normalized).toString();
}

export async function runRewardXPromotionShadowSync(
  limit = 50,
): Promise<RewardXPromotionShadowSyncResult> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 250) {
    throw new Error('X promotion shadow limit must be 1-250.');
  }

  const { network } = getVeBetterNetworkConfig();
  const { data, error } = await supabaseAdmin.rpc(
    'sync_reward_x_promotion_shadow_splits',
    {
      p_network: network,
      p_limit: limit,
    },
  );

  if (error) {
    throw new Error(
      `X promotion shadow sync failed: ${error.message}`,
    );
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('X promotion shadow sync returned malformed data.');
  }

  const row = data as Record<string, unknown>;
  const enabled = row.enabled === true;
  const resultNetwork = String(row.network ?? '').toLowerCase();
  const policyVersion = String(row.policyVersion ?? '').trim();

  if (resultNetwork !== network || !policyVersion) {
    throw new Error('X promotion shadow sync identity is invalid.');
  }

  return {
    enabled,
    network: resultNetwork,
    consideredCount: nonNegativeInteger(
      row.consideredCount,
      'considered count',
    ),
    createdCount: nonNegativeInteger(
      row.createdCount,
      'created count',
    ),
    reservationWei: weiString(
      row.reservationWei,
      'reservation amount',
    ),
    baseWei: weiString(
      row.baseWei,
      'base amount',
    ),
    promotionWei: weiString(
      row.promotionWei,
      'promotion amount',
    ),
    policyVersion,
    shadowStartedAt:
      typeof row.shadowStartedAt === 'string'
        ? row.shadowStartedAt
        : null,
    liveStartedAt:
      typeof row.liveStartedAt === 'string'
        ? row.liveStartedAt
        : null,
  };
}


export type RewardXPromotionShadowAuditResult = {
  ok: boolean;
  network: string;
  shadowEnabled: boolean;
  liveEnabled: boolean;
  policyVersion: string;
  shadowStartedAt: string | null;
  liveStartedAt: string | null;
  totalCount: number;
  shadowCount: number;
  liveCount: number;
  reservationWei: string;
  baseWei: string;
  promotionWei: string;
  violations: {
    conservation: number;
    calculation: number;
    queueBinding: number;
    sourceBinding: number;
    activationWindow: number;
    policyVersion: number;
    missingProjection: number;
  };
};

function booleanField(
  value: unknown,
  fieldName: string,
): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`X promotion shadow ${fieldName} is invalid.`);
  }
  return value;
}

export async function runRewardXPromotionShadowAudit():
Promise<RewardXPromotionShadowAuditResult> {
  const { network } = getVeBetterNetworkConfig();
  const { data, error } = await supabaseAdmin.rpc(
    'read_reward_x_promotion_shadow_audit',
    {
      p_network: network,
    },
  );

  if (error) {
    throw new Error(
      `X promotion shadow audit failed: ${error.message}`,
    );
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('X promotion shadow audit returned malformed data.');
  }

  const row = data as Record<string, unknown>;
  const resultNetwork = String(row.network ?? '').toLowerCase();
  const policyVersion = String(row.policyVersion ?? '').trim();
  const rawViolations = row.violations;

  if (
    resultNetwork !== network ||
    !policyVersion ||
    !rawViolations ||
    typeof rawViolations !== 'object' ||
    Array.isArray(rawViolations)
  ) {
    throw new Error('X promotion shadow audit identity is invalid.');
  }

  const violations =
    rawViolations as Record<string, unknown>;

  return {
    ok: booleanField(row.ok, 'audit status'),
    network: resultNetwork,
    shadowEnabled: booleanField(
      row.shadowEnabled,
      'shadow enabled state',
    ),
    liveEnabled: booleanField(
      row.liveEnabled,
      'live enabled state',
    ),
    policyVersion,
    shadowStartedAt:
      typeof row.shadowStartedAt === 'string'
        ? row.shadowStartedAt
        : null,
    liveStartedAt:
      typeof row.liveStartedAt === 'string'
        ? row.liveStartedAt
        : null,
    totalCount: nonNegativeInteger(
      row.totalCount,
      'total split count',
    ),
    shadowCount: nonNegativeInteger(
      row.shadowCount,
      'shadow split count',
    ),
    liveCount: nonNegativeInteger(
      row.liveCount,
      'live split count',
    ),
    reservationWei: weiString(
      row.reservationWei,
      'audit reservation amount',
    ),
    baseWei: weiString(
      row.baseWei,
      'audit base amount',
    ),
    promotionWei: weiString(
      row.promotionWei,
      'audit promotion amount',
    ),
    violations: {
      conservation: nonNegativeInteger(
        violations.conservation,
        'conservation violation count',
      ),
      calculation: nonNegativeInteger(
        violations.calculation,
        'calculation violation count',
      ),
      queueBinding: nonNegativeInteger(
        violations.queueBinding,
        'queue binding violation count',
      ),
      sourceBinding: nonNegativeInteger(
        violations.sourceBinding,
        'source binding violation count',
      ),
      activationWindow: nonNegativeInteger(
        violations.activationWindow,
        'activation window violation count',
      ),
      policyVersion: nonNegativeInteger(
        violations.policyVersion,
        'policy version violation count',
      ),
      missingProjection: nonNegativeInteger(
        violations.missingProjection,
        'missing projection violation count',
      ),
    },
  };
}
