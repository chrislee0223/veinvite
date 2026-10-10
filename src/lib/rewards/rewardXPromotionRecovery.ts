import {
  supabaseAdmin,
} from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

type RecoveryBatchResult = {
  network: VeBetterNetwork;
  checked: number;
  reconciled: number;
  failed: number;
};

function nonNegativeInteger(
  value: unknown,
  field: string,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    throw new Error(
      `X promotion recovery ${field} is invalid.`,
    );
  }

  return parsed;
}

export async function reconcileRewardXPromotionRecoveryBestEffort(
  inviteCode: string,
): Promise<void> {
  try {
    const { error } =
      await supabaseAdmin.rpc(
        'reconcile_reward_recovery_after_x_promotion_v1',
        {
          p_invite_code:
            inviteCode.trim().toUpperCase(),
        },
      );

    if (error) {
      console.error(
        'Paid X promotion recovery reconciliation failed after settlement:',
        error,
      );
    }
  } catch (error) {
    // The on-chain payout and finalized receipt are already authoritative.
    // Recovery accounting is retried separately by maintenance and must never
    // make a successful payout look unpaid or roll back settlement truth.
    console.error(
      'Paid X promotion recovery reconciliation threw after settlement:',
      error,
    );
  }
}

export async function runRewardXPromotionRecoveryMaintenance():
Promise<RecoveryBatchResult> {
  const { network } =
    getVeBetterNetworkConfig();

  const { data, error } =
    await supabaseAdmin.rpc(
      'reconcile_reward_x_promotion_recovery_batch_v1',
      {
        p_network: network,
        p_limit: 50,
      },
    );

  if (error) {
    throw new Error(
      `X promotion recovery maintenance failed: ${error.message}`,
    );
  }

  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    throw new Error(
      'X promotion recovery maintenance returned malformed data.',
    );
  }

  const payload =
    data as Record<string, unknown>;

  if (
    String(payload.network ?? '') !==
    network
  ) {
    throw new Error(
      'X promotion recovery maintenance returned the wrong network.',
    );
  }

  const result: RecoveryBatchResult = {
    network,
    checked:
      nonNegativeInteger(
        payload.checked,
        'checked count',
      ),
    reconciled:
      nonNegativeInteger(
        payload.reconciled,
        'reconciled count',
      ),
    failed:
      nonNegativeInteger(
        payload.failed,
        'failed count',
      ),
  };

  if (
    result.reconciled >
      result.checked ||
    result.failed >
      result.checked
  ) {
    throw new Error(
      'X promotion recovery maintenance returned inconsistent counts.',
    );
  }

  if (result.failed > 0) {
    throw new Error(
      `X promotion recovery maintenance left ${result.failed} reconciliation(s) unresolved.`,
    );
  }

  return result;
}
