import 'server-only';

import {supabaseAdmin} from '@/lib/supabaseServer';
import {
  buildMultilevelSettlementManifest,
} from '@/lib/rewards/multilevelSettlementManifest';
import type { MultilevelRoundInput } from '@/lib/rewards/multilevelRewardPolicy';

const PREVIEW='https://bpppslplhmppxzvdkwxs.supabase.co';

/**
 * Never referenced by any active production page, cron, claim, reward or API.
 * It only calls the STAGING-ONLY SQL rehearsal that has NO B3TR payout signer.
 */
function assertPrivatePreviewMode(network:string):void {
  if(process.env.VERCEL_ENV!=='preview' ||
    process.env.NEXT_PUBLIC_SUPABASE_URL!==PREVIEW ||
    process.env.VEINVITE_MULTILEVEL_PREVIEW_SETTLEMENT_REHEARSAL_ENABLED!=='true' ||
    !['testnet','testnet-staging'].includes(network) ||
    !['testnet','testnet-staging'].includes(process.env.VECHAIN_NETWORK??'')) {
    throw new Error('MULTILEVEL_ATOMIC_SETTLEMENT_PREVIEW_ONLY');
  }
}

export async function rehearseMultilevelSettlement(input:{
  network:'testnet'|'testnet-staging';
  round:MultilevelRoundInput;
}):Promise<{
  result:'REHEARSAL_SEALED_NO_PAYOUT'|'ALREADY_REHEARSED_NO_PAYOUT';
  entitlementCount:number;
  grossEntitlementsWei:string;
  generalReturnNextWei:string;
}> {
  assertPrivatePreviewMode(input.network);
  // Pure calculator rejects duplicate actors, invalid wallets/uplines and
  // unbalanced Wei BEFORE any network call is attempted.
  const manifest=buildMultilevelSettlementManifest(input.round);
  const {data,error}=await supabaseAdmin.rpc(
    'multilevel_preview_rehearse_settlement_v1',{
      p_network:input.network,
      p_round_id:input.round.roundId,
      p_manifest:manifest,
    },
  );
  if(error) {
    // Fails closed. No automatic retries, to avoid accidental conflict replay.
    throw new Error('MULTILEVEL_REHEARSAL_FAILED:'+error.code);
  }
  if(data!=='REHEARSAL_SEALED_NO_PAYOUT' &&
     data!=='ALREADY_REHEARSED_NO_PAYOUT') {
    throw new Error('MULTILEVEL_REHEARSAL_UNEXPECTED_RESPONSE');
  }
  return {
    result:data,
    entitlementCount:manifest.entitlements.length,
    grossEntitlementsWei:manifest.grossEntitlementsWei,
    generalReturnNextWei:manifest.generalReturnNextWei,
  };
}
