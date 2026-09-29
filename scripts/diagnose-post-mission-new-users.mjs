const NODE = 'https://mainnet.vechain.org';
const B3TR = '0x5ef79995FE8a89e0812330E4378eB2660ceDe699'.toLowerCase();
const REWARDS_POOL = '0x6Bee7DDab6c99d5B2Af0554EaEA484CE18F52631'.toLowerCase();
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PAGE_SIZE = 1000;
const CHUNK = 50000;

const targets = [
  { code: 'QNU8TDF', wallet: '0x0b542507c5373620d121d6161943a4d6d814d4e5', voteBlock: 25827216 },
  { code: 'EALXSC8', wallet: '0x0459f87278f58a26beefe3a3928982d52ad12f35', voteBlock: 25827144 },
  { code: '7ACQA43', wallet: '0x79f1fa450b50a0e7ad5c7255ea8a59eb12e12c3e', voteBlock: 25886525 },
  { code: '65242BC', wallet: '0x259a1644d0c97a823ca1d6d811f6e6b522d92e82', voteBlock: 25895132 },
  { code: 'JEZP37F', wallet: '0x009c2dbbb4b823b0544c3580921b544baf77cb4d', voteBlock: 25940316 },
  { code: 'M89HCCW', wallet: '0xf6a8366f038e6a800fa1d61b8c9f0e9857549c31', voteBlock: 25944315 },
];

const m89PriorWallet = {
  wallet: '0xd3c3f4b0846c98e2fc86012592ceb830a204a26a',
  fromBlock: 25158031,
  toBlock: 25930475,
};

function topicForAddress(address) {
  return '0x' + '0'.repeat(24) + address.toLowerCase().replace(/^0x/, '');
}

function addressFromTopic(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) return null;
  return ('0x' + value.slice(-40)).toLowerCase();
}

function amountFromData(data) {
  const v = String(data || '').toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]+$/.test(v) || v.length < 64) return '0';
  return BigInt('0x' + v.slice(0,64)).toString();
}

function ts(value) {
  if (value == null) return null;
  const n = Number(value);
  if (Number.isFinite(n)) return new Date((n < 1e12 ? n * 1000 : n)).toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function jsonFetch(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}: ${(await res.text()).slice(0,500)}`);
  }
  return await res.json();
}

async function bestBlock() {
  return await jsonFetch(NODE + '/blocks/best');
}

async function eventLogs({from,to,criteria}) {
  const all = [];
  for (let chunkFrom = from; chunkFrom <= to; chunkFrom += CHUNK) {
    const chunkTo = Math.min(to, chunkFrom + CHUNK - 1);
    let offset = 0;
    while (true) {
      const body = {
        range: { unit: 'block', from: chunkFrom, to: chunkTo },
        options: { offset, limit: PAGE_SIZE },
        criteriaSet: [criteria],
        order: 'asc'
      };
      const rows = await jsonFetch(NODE + '/logs/event', {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify(body),
      });
      if (!Array.isArray(rows)) throw new Error('Unexpected event log response');
      all.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      if (offset > 10000) throw new Error('pagination cap exceeded');
    }
  }
  return all;
}

function summarizeTransfers(logs, wallet, direction) {
  const transfers = logs.map(log => {
    const from = addressFromTopic(log.topics?.[1]);
    const to = addressFromTopic(log.topics?.[2]);
    return {
      block: Number(log.meta?.blockNumber),
      time: ts(log.meta?.blockTimestamp),
      tx: String(log.meta?.txID || '').toLowerCase(),
      from,
      to,
      amountWei: amountFromData(log.data),
    };
  }).filter(x => x.block > 0);

  const rewardPool = transfers.filter(x => direction === 'in' && x.from === REWARDS_POOL);
  const counterparties = {};
  for (const x of transfers) {
    const cp = direction === 'in' ? x.from : x.to;
    if (!cp) continue;
    const prev = counterparties[cp] || {count:0, amountWei:'0'};
    prev.count += 1;
    prev.amountWei = (BigInt(prev.amountWei) + BigInt(x.amountWei)).toString();
    counterparties[cp] = prev;
  }
  const total = transfers.reduce((acc,x)=>acc+BigInt(x.amountWei),0n);
  const rewardTotal = rewardPool.reduce((acc,x)=>acc+BigInt(x.amountWei),0n);
  return {
    count: transfers.length,
    totalAmountWei: total.toString(),
    first: transfers[0] || null,
    last: transfers.at(-1) || null,
    counterparties,
    rewardPoolCount: rewardPool.length,
    rewardPoolAmountWei: rewardTotal.toString(),
    rewardPoolTransfers: rewardPool.slice(0,20),
    sample: transfers.slice(0,20),
  };
}

async function scanWallet(wallet, fromBlock, toBlock) {
  const topic = topicForAddress(wallet);
  const inbound = await eventLogs({
    from: fromBlock,
    to: toBlock,
    criteria: { address: B3TR, topic0: TRANSFER_TOPIC, topic2: topic }
  });
  const outbound = await eventLogs({
    from: fromBlock,
    to: toBlock,
    criteria: { address: B3TR, topic0: TRANSFER_TOPIC, topic1: topic }
  });
  return {
    inbound: summarizeTransfers(inbound, wallet, 'in'),
    outbound: summarizeTransfers(outbound, wallet, 'out'),
  };
}

const best = await bestBlock();
const bestNumber = Number(best.number);
if (!Number.isSafeInteger(bestNumber)) throw new Error('Invalid best block');

const results = [];
for (const target of targets) {
  const scan = await scanWallet(target.wallet, target.voteBlock + 1, bestNumber);
  results.push({...target, scanFromBlock: target.voteBlock + 1, scanToBlock: bestNumber, ...scan});
}

const prior = await scanWallet(m89PriorWallet.wallet, m89PriorWallet.fromBlock, Math.min(m89PriorWallet.toBlock,bestNumber));

const sharedOutbound = {};
for (const r of results) {
  for (const [dest, meta] of Object.entries(r.outbound.counterparties)) {
    if (!sharedOutbound[dest]) sharedOutbound[dest] = [];
    sharedOutbound[dest].push({code:r.code,count:meta.count,amountWei:meta.amountWei});
  }
}
for (const key of Object.keys(sharedOutbound)) {
  if (sharedOutbound[key].length < 2) delete sharedOutbound[key];
}

const output = {
  generatedAt: new Date().toISOString(),
  bestBlock: bestNumber,
  rewardsPool: REWARDS_POOL,
  results,
  sharedOutboundDestinations: sharedOutbound,
  m89PriorWallet: {...m89PriorWallet, scanToBlock: Math.min(m89PriorWallet.toBlock,bestNumber), ...prior},
};

console.log('FORENSIC_RESULT=' + JSON.stringify(output));
