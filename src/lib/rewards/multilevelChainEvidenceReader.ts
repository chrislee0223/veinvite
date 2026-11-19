/**
 * Server-side, strictly read-only VeChain event scanner for multilevel preview.
 * This is NOT a payout oracle: independent wallet ownership, first-onboarding
 * provenance, security review, canonical chain finality and funding are still
 * necessary before granting a live entitlement.
 *
 * One closed round, one wallet, at most 2 bounded indexed scans.
 * No cron, no user-facing API, no writes and no production integration.
 */
import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import { VEINVITE_APP_ID } from '@/lib/rewards/onchainPool';
import {
  checkMissionEvidence,
  type MissionEvidenceInput,
  type MissionEvidenceVerdict,
  type RewardedDappProof,
  type VoteProof,
} from '@/lib/rewards/multilevelEvidenceWindow';
import {
  parseMultilevelRewardLog,
  parseMultilevelVoteLog,
  type MultilevelRawThorLog,
  type MultilevelLogContext,
} from '@/lib/rewards/multilevelChainLogProof';
import { readVeBetterRoundWindow } from '@/lib/vebetter/entryEligibility';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

const rewardEvent = new ABIEvent(
  'event RewardDistributed(uint256 amount, bytes32 indexed appId, address indexed receiver, string proof, address indexed distributor)',
);
const voteEvent = new ABIEvent(
  'event AllocationVoteCast(address indexed voter, uint256 indexed roundId, bytes32[] appsIds, uint256[] voteWeights)',
);
const PAGE_SIZE = 250;
const MAX_PAGES_PER_EVENT_TYPE = 16;
const MATURITY_DEPTH_BLOCKS = 24; // Depth only; not proof of canonical finality.
const WALLET = /^0x[0-9a-f]{40}$/;

type ChainLogReader = ReturnType<typeof ThorClient.at>;

export type MultilevelChainScan = {
  network: 'mainnet' | 'testnet' | 'testnet-staging';
  wallet: string;
  kind: 'ONBOARDING' | 'ACTIVE';
  earningRoundId: number;
  dappRoundId: number;
  verifiedThroughBlock: number;
  maturityDepthBlocks: number;
  rewardedDapps: RewardedDappProof[];
  votes: VoteProof[];
  verdict: MissionEvidenceVerdict;
  /**
   * A positive result confirms the logged structure on the selected Thor
   * provider. It does NOT assert Sybil clearance or finality.
   */
  authority: 'READ_ONLY_CHAIN_OBSERVATION';
};

const singleTopic = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

function requireSignatureTopics(
  encoded: ReturnType<ABIEvent['encodeFilterTopics']>,
): string {
  const signature = singleTopic(encoded[0]);
  if(!signature || !/^0x[0-9a-f]{64}$/i.test(signature)) {
    throw new Error('MULTILEVEL_INVALID_EVENT_SIGNATURE');
  }
  return signature;
}

async function fetchBounded(
  thor: ChainLogReader, input: {
    address: string;
    topics: ReturnType<ABIEvent['encodeFilterTopics']>;
    from: number;
    to: number;
  },
):Promise<MultilevelRawThorLog[]> {
  const result:MultilevelRawThorLog[]=[];
  for(let page=0;page<MAX_PAGES_PER_EVENT_TYPE;page++){
    const data=await thor.logs.filterRawEventLogs({
      range:{unit:'block',from:input.from,to:input.to},
      options:{offset:page*PAGE_SIZE,limit:PAGE_SIZE},
      criteriaSet:[{
        address:input.address,
        topic0:singleTopic(input.topics[0]),
        topic1:singleTopic(input.topics[1]),
        topic2:singleTopic(input.topics[2]),
        topic3:singleTopic(input.topics[3]),
      }],
      order:'asc',
    });
    if(!Array.isArray(data))throw new Error('MULTILEVEL_CHAIN_LOG_FORMAT');
    const logs=data as MultilevelRawThorLog[];
    if(logs.length>PAGE_SIZE)throw new Error('MULTILEVEL_CHAIN_LOG_OVERSIZED');
    result.push(...logs);
    if(logs.length<PAGE_SIZE)return result;
  }
  // Never silently truncate a wallet's transaction history.
  throw new Error('MULTILEVEL_CHAIN_LOG_PAGE_LIMIT');
}

export async function readMultilevelChainEvidence(input:{
  wallet:string;
  kind:'ONBOARDING'|'ACTIVE';
  earningRoundId:number;
  /** Must come from trusted, independently checked historical DB facts. */
  firstOnboardedRoundId:number;
}):Promise<MultilevelChainScan> {
  const wallet = typeof input.wallet==='string' ? input.wallet.toLowerCase() : '';
  if(!WALLET.test(wallet) ||
    (input.kind!=='ONBOARDING' && input.kind!=='ACTIVE') ||
    !Number.isSafeInteger(input.earningRoundId) || input.earningRoundId<2 ||
    !Number.isSafeInteger(input.firstOnboardedRoundId) ||
    input.firstOnboardedRoundId<1){
    throw new Error('MULTILEVEL_INVALID_CHAIN_SCAN_INPUT');
  }
  const dappRoundId=input.kind==='ONBOARDING'
    ? input.earningRoundId-1 : input.earningRoundId;
  const [dappRound,voteRound]=await Promise.all([
    readVeBetterRoundWindow({roundId:dappRoundId}),
    readVeBetterRoundWindow({roundId:input.earningRoundId}),
  ]);
  const {network,nodeUrl,x2EarnRewardsPoolAddress,xAllocationVotingAddress}
    =getVeBetterNetworkConfig();
  if(dappRound.network!==network || voteRound.network!==network ||
    dappRound.status!=='COMPLETED' || voteRound.status!=='COMPLETED' ||
    dappRound.bestBlock-voteRound.voteEndBlock<MATURITY_DEPTH_BLOCKS ||
    voteRound.bestBlock-voteRound.voteEndBlock<MATURITY_DEPTH_BLOCKS) {
    throw new Error('MULTILEVEL_ROUND_NOT_MATURE_OR_NETWORK_MISMATCH');
  }
  if(input.kind==='ONBOARDING' &&
    dappRound.voteEndBlock>=voteRound.voteStartBlock){
    throw new Error('MULTILEVEL_NONCONSECUTIVE_ROUND_BOUNDARIES');
  }
  const thor=ThorClient.at(nodeUrl);
  const rewardTopics=rewardEvent.encodeFilterTopics([null,wallet,null]);
  const voteTopics=voteEvent.encodeFilterTopics([wallet,null]);
  const rewardContext:MultilevelLogContext={
    expectedTopic0:requireSignatureTopics(rewardTopics),
    wallet,roundId:dappRoundId,
    startBlock:dappRound.voteStartBlock,endBlock:dappRound.voteEndBlock,
    excludedAppId:VEINVITE_APP_ID,
  };
  const voteContext:MultilevelLogContext={
    expectedTopic0:requireSignatureTopics(voteTopics),
    wallet,roundId:input.earningRoundId,
    startBlock:voteRound.voteStartBlock,endBlock:voteRound.voteEndBlock,
    excludedAppId:VEINVITE_APP_ID,
  };
  const [rewardLogs,voteLogs]=await Promise.all([
    fetchBounded(thor,{
      address:x2EarnRewardsPoolAddress,topics:rewardTopics,
      from:dappRound.voteStartBlock,to:dappRound.voteEndBlock,
    }),
    fetchBounded(thor,{
      address:xAllocationVotingAddress,topics:voteTopics,
      from:voteRound.voteStartBlock,to:voteRound.voteEndBlock,
    }),
  ]);
  const rewardedDapps:RewardedDappProof[]=[];
  const appIds=new Set<string>();
  for(const log of rewardLogs) {
    const proof=parseMultilevelRewardLog(log,rewardContext);
    if(!proof || appIds.has(proof.appId))continue;
    appIds.add(proof.appId);
    rewardedDapps.push(proof);
  }
  const votes:VoteProof[]=[];
  const txIds=new Set<string>();
  for(const log of voteLogs) {
    const proof=parseMultilevelVoteLog(log,voteContext);
    if(!proof || txIds.has(proof.txId))continue;
    txIds.add(proof.txId);
    votes.push(proof);
  }
  const evidence:MissionEvidenceInput={
    kind:input.kind,earningRoundId:input.earningRoundId,
    dappWindow:{
      roundId:dappRoundId,startBlock:dappRound.voteStartBlock,
      endBlock:dappRound.voteEndBlock,
    },
    voteWindow:{
      roundId:input.earningRoundId,startBlock:voteRound.voteStartBlock,
      endBlock:voteRound.voteEndBlock,
    },
    member:{
      wallet,firstOnboardedRoundId:input.firstOnboardedRoundId,
      rewardedDapps,votes,
    },
  };
  return {
    network,wallet,kind:input.kind,earningRoundId:input.earningRoundId,
    dappRoundId,verifiedThroughBlock:Math.min(dappRound.bestBlock,voteRound.bestBlock),
    maturityDepthBlocks:MATURITY_DEPTH_BLOCKS,rewardedDapps,votes,
    verdict:checkMissionEvidence(evidence),authority:'READ_ONLY_CHAIN_OBSERVATION',
  };
}
