import { NextRequest, NextResponse } from 'next/server';
import { ThorClient } from '@vechain/sdk-network';

const NODE_URL = 'https://mainnet.vechain.org';
const VTHO_ADDRESS = '0x0000000000000000000000000000456e65726779';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const CASES: Record<string, { wallet: string; activationBlock: number }> = {
  '74FQ6CB': { wallet: '0x2d415cbf574177ccf0e8a178ef2c8df1dcdfa2cc', activationBlock: 25825343 },
  'F84ZL4N': { wallet: '0xd2fe919a38fb7ab6f2c2df0fec7723cb778b0989', activationBlock: 25831197 },
  'SQCX6F9': { wallet: '0x352ac255f820a9d5b952b52199f06f664b40ce15', activationBlock: 25832252 },
  'V34W9PM': { wallet: '0xbe38eb6be67e52c2743995a7bf59efd0e9265d5d', activationBlock: 25833219 },
  '8GANYW6': { wallet: '0x703210579b9f2fd2317415278af71f5fc59f6cc8', activationBlock: 25834196 },
  'WPGLEGJ': { wallet: '0x54f7d0b2f2cdc9be9d1be04c7101e984f2934c36', activationBlock: 25834269 },
  'BGGJDJS': { wallet: '0x37f983771b32d94e975e2568e5dca21d43d75a4d', activationBlock: 25834638 },
  '8DNK7KV': { wallet: '0x1bbd28f95af0df8edcf73431cab62af3b8807c39', activationBlock: 25840115 },
  '9L4TMG5': { wallet: '0x97e82cc272aaa9745b06525085f37b64e2382ff8', activationBlock: 25840751 },
  'SBWYUFQ': { wallet: '0x95af037750d985f094969d3cd741a0ff51082cba', activationBlock: 25842235 },
  '7ACQA43': { wallet: '0x79f1fa450b50a0e7ad5c7255ea8a59eb12e12c3e', activationBlock: 25842288 },
  '2YYCS2X': { wallet: '0x9fc31513746887e0d82f50aa41212913848feaa0', activationBlock: 25875077 },
  'JEZP37F': { wallet: '0x009c2dbbb4b823b0544c3580921b544baf77cb4d', activationBlock: 25878913 },
  '65242BC': { wallet: '0x259a1644d0c97a823ca1d6d811f6e6b522d92e82', activationBlock: 25880600 },
};

function normalizeAddress(value: unknown) {
  return typeof value === 'string' && ADDRESS_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
}

function addressTopic(address: string) {
  const normalized = address.toLowerCase().replace(/^0x/, '');
  return `0x${'0'.repeat(24)}${normalized}`;
}

function fromTopic(value: unknown) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) return null;
  return normalizeAddress(`0x${value.slice(-40)}`);
}

function metaOf(value: any) {
  return value && typeof value === 'object' && value.meta && typeof value.meta === 'object'
    ? value.meta
    : null;
}

function blockOf(value: any) {
  const raw = value?.blockNumber ?? value?.block_number ?? metaOf(value)?.blockNumber ?? metaOf(value)?.block_number;
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : null;
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function txOf(value: any) {
  return value?.txID ?? value?.txId ?? value?.transactionId ?? metaOf(value)?.txID ?? metaOf(value)?.txId ?? metaOf(value)?.transactionId ?? null;
}

function parseVet(value: any) {
  if (!value) return null;
  return {
    blockNumber: blockOf(value),
    sender: normalizeAddress(value.sender ?? value.from),
    recipient: normalizeAddress(value.recipient ?? value.to),
    txId: txOf(value),
    asset: 'VET',
  };
}

function parseVtho(value: any) {
  if (!value) return null;
  const topics = Array.isArray(value.topics)
    ? value.topics
    : Array.isArray(value?.meta?.topics)
      ? value.meta.topics
      : [];
  if (topics.length < 3 || String(topics[0]).toLowerCase() !== TRANSFER_TOPIC) return null;
  return {
    blockNumber: blockOf(value),
    sender: fromTopic(topics[1]),
    recipient: fromTopic(topics[2]),
    txId: txOf(value),
    asset: 'VTHO',
  };
}

async function firstInbound(wallet: string, toBlock: number) {
  const thor = ThorClient.at(NODE_URL);
  const walletTopic = addressTopic(wallet);
  const range = { unit: 'block' as const, from: 0, to: toBlock };
  const options = { offset: 0, limit: 1 };

  const [vetLogs, vthoLogs] = await Promise.all([
    thor.logs.filterTransferLogs({
      criteriaSet: [{ recipient: wallet }],
      range,
      options,
      order: 'asc',
    }),
    thor.logs.filterRawEventLogs({
      criteriaSet: [{
        address: VTHO_ADDRESS,
        topic0: TRANSFER_TOPIC,
        topic2: walletTopic,
      }],
      range,
      options,
      order: 'asc',
    }),
  ]);

  return {
    vet: parseVet(vetLogs[0]),
    vtho: parseVtho(vthoLogs[0]),
  };
}

export async function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get('code') ?? '').toUpperCase();
  const item = CASES[code];
  if (!item) {
    return NextResponse.json({ error: 'Unknown Round 116 invite code.' }, { status: 404 });
  }

  try {
    const direct = await firstInbound(item.wallet, item.activationBlock);
    return NextResponse.json({
      code,
      wallet: item.wallet,
      activationBlock: item.activationBlock,
      direct,
      mainnetOnly: true,
      readOnly: true,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Round 116 chain audit failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Chain audit failed',
    }, { status: 500 });
  }
}
