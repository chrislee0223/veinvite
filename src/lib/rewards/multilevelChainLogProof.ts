/**
 * Strict decoding of VeBetterDAO Thor event logs for multilevel-preview only.
 * The SCANNER (not this parser) must query the official pool / vote contract
 * addresses and filter by wallet. No user input or browser-reported evidence.
 */
import type { RewardedDappProof, VoteProof } from './multilevelEvidenceWindow';

export type MultilevelRawThorLog = {
  data?: string;
  topics?: string[];
  meta?: { blockNumber?: number; txID?: string; clauseIndex?: number };
};

export type MultilevelLogContext = {
  expectedTopic0: string;
  wallet: string;
  roundId: number;
  startBlock: number;
  endBlock: number;
  excludedAppId: string;
};

const WORD = /^[0-9a-f]{64}$/;
const DATA = /^0x(?:[0-9a-f]{64})*$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const TX = /^0x[0-9a-f]{64}$/;
const APP = /^0x[0-9a-f]{64}$/;
const HEX = /^0x[0-9a-f]+$/;
const safeBlock = (x: number): boolean => Number.isSafeInteger(x) && x >= 1;

const normalize = (s: string | undefined): string => typeof s === 'string' ? s.toLowerCase() : '';
const uint = (word: string): bigint | null => WORD.test(word) ? BigInt('0x'+word) : null;
const inBlock = (x: number, c: MultilevelLogContext) =>
  safeBlock(x) && x >= c.startBlock && x <= c.endBlock;
const walletTopic = (wallet: string): string =>
  '0x'+'0'.repeat(24)+wallet.slice(2).toLowerCase();

function validMeta(log: MultilevelRawThorLog,c:MultilevelLogContext): {txId:string;blockNumber:number}|null {
  const txId=normalize(log.meta?.txID), blockNumber=log.meta?.blockNumber;
  if (!TX.test(txId) || typeof blockNumber!=='number'||!inBlock(blockNumber,c)) return null;
  return {txId,blockNumber};
}

function validTopic0(log:MultilevelRawThorLog,c:MultilevelLogContext):boolean {
  return HEX.test(normalize(c.expectedTopic0)) &&
    normalize(log.topics?.[0])===normalize(c.expectedTopic0) &&
    ADDRESS.test(normalize(c.wallet)) &&
    Number.isSafeInteger(c.roundId) && c.roundId>=1;
}

export function parseMultilevelRewardLog(
  log: MultilevelRawThorLog,c:MultilevelLogContext,
): RewardedDappProof|null {
  if (!validTopic0(log,c) || normalize(log.topics?.[2])!==walletTopic(c.wallet)) return null;
  const meta=validMeta(log,c);
  const appId=normalize(log.topics?.[1]);
  const data=normalize(log.data);
  // First nonindexed ABI word is uint256 amount.
  if (!meta || !APP.test(appId) || appId===normalize(c.excludedAppId) ||
    !DATA.test(data) || data.length<66) return null;
  const amount=uint(data.slice(2,66));
  if (amount===null || amount<=0n) return null;
  return {appId,txId:meta.txId,blockNumber:meta.blockNumber,
    roundId:c.roundId,rewardWei:amount.toString()};
}

/**
 * AllocationVoteCast(address indexed voter,uint256 indexed roundId,
 *                    bytes32[] appsIds,uint256[] voteWeights)
 * ABI has two dynamic arrays; both must contain same number of elements
 * and at least one positive-weight, nonzero app. Otherwise NOT a vote.
 */
export function parseMultilevelVoteLog(
  log:MultilevelRawThorLog,c:MultilevelLogContext,
):VoteProof|null {
  if (!validTopic0(log,c) || normalize(log.topics?.[1])!==walletTopic(c.wallet)) return null;
  const meta=validMeta(log,c);
  const roundWord=normalize(log.topics?.[2]).slice(2);
  const round=uint(roundWord);
  const data=normalize(log.data);
  if(!meta || round===null || round!==BigInt(c.roundId) ||
     !DATA.test(data) || data.length<130) return null;
  const raw=data.slice(2);
  const appOffset=uint(raw.slice(0,64));
  const weightOffset=uint(raw.slice(64,128));
  if(appOffset===null || weightOffset===null ||
    appOffset%32n!==0n || weightOffset%32n!==0n ||
    appOffset<64n || weightOffset<64n || appOffset>BigInt(raw.length/2) ||
    weightOffset>BigInt(raw.length/2)) return null;
  const decodeArray=(offset:bigint):string[]|null=>{
    const base=Number(offset)*2;
    const length=uint(raw.slice(base,base+64));
    if(length===null || length===0n || length>128n) return null;
    const count=Number(length);
    if(base+64*(count+1)>raw.length)return null;
    const out:string[]=[];
    for(let i=0;i<count;i++){
      const w=raw.slice(base+64*(i+1),base+64*(i+2));
      if(!WORD.test(w))return null;
      out.push(w);
    }
    return out;
  };
  // A Solidity ABI tuple with two dynamic arrays has the first payload at
  // byte 64 and the second immediately after the first array. Reject
  // swapped/overlapping offsets rather than reinterpreting malformed bytes.
  if(appOffset!==64n) return null;
  const apps=decodeArray(appOffset);
  if(!apps || weightOffset!==64n+32n*(BigInt(apps.length)+1n))return null;
  const weights=decodeArray(weightOffset);
  if(!weights||apps.length!==weights.length)return null;
  for(let i=0;i<apps.length;i++){
    const weight=uint(weights[i]);
    if(weight!==null && weight>0n && apps[i]!=='0'.repeat(64)) {
      return {votedAppId:'0x'+apps[i],txId:meta.txId,
        blockNumber:meta.blockNumber,roundId:c.roundId};
    }
  }
  return null;
}
