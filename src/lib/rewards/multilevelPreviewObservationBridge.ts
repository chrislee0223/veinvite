import 'server-only';

import { createHash } from 'node:crypto';
import { readMultilevelChainEvidence } from '@/lib/rewards/multilevelChainEvidenceReader';
import { supabaseAdmin } from '@/lib/supabaseServer';

const PREVIEW_SUPABASE_URL = 'https://bpppslplhmppxzvdkwxs.supabase.co';

/**
 * Preview-only manual bridge. No route/cron imports or production integrations.
 * Cannot authorize rewards: rows live in PRIVATE candidate_chain_observations,
 * not verified_events or entitlements, and carry no claim/payout rights.
 *
 * Only invoke from a trusted operator-controlled preview job after obtaining
 * firstOnboardedRoundId from independently verified onboard history. Nothing
 * in this module verifies that history or Sybil clearance by itself.
 */
function requirePreviewObservationEnvironment():void {
  if(process.env.VERCEL_ENV!=='preview' ||
    process.env.NEXT_PUBLIC_SUPABASE_URL!==PREVIEW_SUPABASE_URL ||
    process.env.VEINVITE_MULTILEVEL_PREVIEW_OBSERVATION_ENABLED!=='true' ||
    !['testnet','testnet-staging'].includes(process.env.VECHAIN_NETWORK??'')) {
    throw new Error('MULTILEVEL_PREVIEW_ONLY_CHAIN_BRIDGE_DISABLED');
  }
}

export type MultilevelPreviewObservationResponse = {
  status:'OBSERVED_ONLY'|'ALREADY_RECORDED';
  eligible:boolean;
  wallet:string;
  roundId:number;
  network:'testnet'|'testnet-staging';
  source:'THOR_READONLY_OBSERVATION_V1';
};

export async function recordMultilevelPreviewObservation(input:{
  wallet:string;
  kind:'ONBOARDING'|'ACTIVE';
  earningRoundId:number;
  /**
   * The caller must source this from authoritative historical verification.
   * The snapshot is never a payout entitlement even if this input is wrong.
   */
  firstOnboardedRoundId:number;
}):Promise<MultilevelPreviewObservationResponse> {
  requirePreviewObservationEnvironment();
  const chain=await readMultilevelChainEvidence(input);
  if(chain.network==='mainnet') {
    throw new Error('MULTILEVEL_MAINNET_CANNOT_WRITE_PREVIEW_OBSERVATIONS');
  }
  // Exclude bestBlock/scan date so rechecking the same immutable historical
  // evidence produces the SAME fingerprint. Any actual proof difference
  // must be reviewed rather than silently rewriting existing snapshots.
  const observation={
    authority:chain.authority,
    network:chain.network,
    wallet:chain.wallet,
    kind:chain.kind,
    earningRoundId:chain.earningRoundId,
    dappRoundId:chain.dappRoundId,
    maturityDepthBlocks:chain.maturityDepthBlocks,
    verdict:chain.verdict,
    rewardedDapps:chain.rewardedDapps,
    votes:chain.votes,
  };
  const fingerprint=createHash('sha256')
    .update(JSON.stringify(observation)).digest('hex');
  const {data,error}=await supabaseAdmin.rpc(
    'multilevel_preview_record_chain_observation_v1', {
      p_network:chain.network,
      p_round_id:chain.earningRoundId,
      p_wallet:chain.wallet,
      p_kind:chain.kind,
      p_first_onboarded_round_id:input.firstOnboardedRoundId,
      p_dapp_round_id:chain.dappRoundId,
      p_scan_fingerprint:fingerprint,
      p_observed_eligible:chain.verdict.eligible,
      p_observation:observation,
    },
  );
  if(error) {
    throw new Error('MULTILEVEL_PREVIEW_OBSERVATION_WRITE_REJECTED: '+error.code);
  }
  if(data!=='OBSERVED_ONLY' && data!=='ALREADY_RECORDED') {
    throw new Error('MULTILEVEL_PREVIEW_OBSERVATION_UNEXPECTED_ACK');
  }
  return {
    status:data,eligible:chain.verdict.eligible,wallet:chain.wallet,
    roundId:chain.earningRoundId,network:chain.network,
    source:'THOR_READONLY_OBSERVATION_V1',
  };
}
