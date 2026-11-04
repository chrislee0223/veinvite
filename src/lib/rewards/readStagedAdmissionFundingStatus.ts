import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  validateStagedAdmissionBridge,
  type AdmissionBridgeScope,
} from '@/lib/rewards/rewardAdmissionBridgeContract';

/**
 * Service-only, READ-ONLY integration with actual mainnet funding RPC.
 * Imported only by the explicit Preview-only reservation parity probe.
 * No Claim path or payout signer uses it to authorize financial actions.
 * A bridge response can never authorize any reservation or payout.
 */
export async function readStagedAdmissionFundingStatus(scope: AdmissionBridgeScope) {
  if (!/^(mainnet|testnet|testnet-staging)$/.test(scope.network)) {
    throw new Error('Invalid reward admission bridge network');
  }
  if (!/^0x[0-9a-f]{64}$/i.test(scope.appId)
      || !/^[1-9]\d*$/.test(scope.cohortRoundId)
      || !/^[1-9]\d*$/.test(scope.receiptId)) {
    throw new Error('Invalid reward admission funding scope');
  }
  const { data, error } = await supabaseAdmin.rpc(
    'read_reward_admission_bridge_status_v1',
    {
      p_network: scope.network,
      p_app_id: scope.appId,
      p_reward_cohort_round_id: scope.cohortRoundId,
      p_allocation_receipt_id: scope.receiptId,
    },
  );
  if (error) {
    throw new Error('Staged reward bridge read failed: '+error.message);
  }
  return validateStagedAdmissionBridge(data,scope);
}
