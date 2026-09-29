import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

const NODE_URL = 'https://mainnet.vechain.org';
const REWARDS_POOL = '0x6Bee7DDab6c99d5B2Af0554EaEA484CE18F52631';
const PAGE_SIZE = 1000;

const rewardDistributedEvent = new ABIEvent(
  'event RewardDistributed(uint256 amount, bytes32 indexed appId, address indexed receiver, string proof, address indexed distributor)',
);

const targets = [
  ['EALXSC8','0x0459f87278f58a26beefe3a3928982d52ad12f35',25818965,'2026-09-08T03:50:40.000Z'],
  ['QNU8TDF','0x0b542507c5373620d121d6161943a4d6d814d4e5',25818695,'2026-09-08T03:50:40.000Z'],
  ['7ACQA43','0x79f1fa450b50a0e7ad5c7255ea8a59eb12e12c3e',25842288,'2026-09-15T01:22:00.000Z'],
  ['65242BC','0x259a1644d0c97a823ca1d6d811f6e6b522d92e82',25880600,'2026-09-15T17:23:40.000Z'],
  ['JEZP37F','0x009c2dbbb4b823b0544c3580921b544baf77cb4d',25878913,'2026-09-21T00:10:30.000Z'],
  ['M89HCCW','0xf6a8366f038e6a800fa1d61b8c9f0e9857549c31',25930475,'2026-09-21T11:10:00.000Z'],
].map(([inviteCode,wallet,activationBlock,rewardPaidAt]) => ({
  inviteCode,
  wallet,
  activationBlock: Number(activationBlock),
  rewardPaidAt,
}));

function getSingleTopic(topic) {
  return typeof topic === 'string' ? topic : undefined;
}

function parseAmountWei(log) {
  const normalized = log.data?.toLowerCase().replace(/^0x/, '') ?? '';
  if (normalized.length < 64 || !/^[0-9a-f]+$/.test(normalized)) return null;
  return BigInt(`0x${normalized.slice(0,64)}`).toString();
}

const thor = ThorClient.at(NODE_URL);
const bestBlock = await thor.blocks.getBestBlockCompressed();
if (!bestBlock) throw new Error('No best block');

const output = [];

for (const target of targets) {
  const topics = rewardDistributedEvent.encodeFilterTopics([null,target.wallet,null]);
  const cutoffSeconds = Math.floor(new Date(target.rewardPaidAt).getTime()/1000);
  const all = [];
  let offset = 0;

  while (true) {
    const logs = await thor.logs.filterRawEventLogs({
      range:{unit:'block',from:target.activationBlock,to:bestBlock.number},
      options:{offset,limit:PAGE_SIZE},
      criteriaSet:[{
        address:REWARDS_POOL,
        topic0:getSingleTopic(topics[0]),
        topic1:getSingleTopic(topics[1]),
        topic2:getSingleTopic(topics[2]),
        topic3:getSingleTopic(topics[3]),
      }],
      order:'asc',
    });

    const raw = logs;
    for (const log of raw) {
      const ts = log.meta?.blockTimestamp;
      const block = log.meta?.blockNumber;
      const appId = log.topics?.[1]?.toLowerCase();
      const amountWei = parseAmountWei(log);
      if (
        typeof ts !== 'number' ||
        typeof block !== 'number' ||
        !appId ||
        !amountWei ||
        BigInt(amountWei) <= 0n
      ) continue;

      all.push({
        afterVeInvitePayout: ts > cutoffSeconds,
        appId,
        amountWei,
        amountB3tr: Number(amountWei)/1e18,
        blockNumber:block,
        timestamp:new Date(ts*1000).toISOString(),
        txId:log.meta?.txID?.toLowerCase() ?? null,
      });
    }

    if (raw.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const after = all.filter(x=>x.afterVeInvitePayout);
  output.push({
    inviteCode:target.inviteCode,
    wallet:target.wallet,
    rewardPaidAt:target.rewardPaidAt,
    totalRewardEventsSinceActivation:all.length,
    distinctAppsSinceActivation:new Set(all.map(x=>x.appId)).size,
    postPayoutRewardEventCount:after.length,
    distinctPostPayoutApps:new Set(after.map(x=>x.appId)).size,
    postPayoutTotalB3tr:after.reduce((s,x)=>s+x.amountB3tr,0),
    lastPostPayoutRewardAt:after.at(-1)?.timestamp ?? null,
    events:after,
  });
}

console.log('RETENTION_SCAN_RESULT=' + JSON.stringify({
  latestBlock:bestBlock.number,
  checkedAt:new Date().toISOString(),
  results:output,
}));
