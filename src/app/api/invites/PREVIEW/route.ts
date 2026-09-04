import { NextResponse } from 'next/server';

const PREVIEW_WALLET = '0x0000000000000000000000000000000000000abc';

const payload = {
  invite: {
    code: 'PREVIEW',
    inviteeAddress: PREVIEW_WALLET,
    status: 'ACTIVATING',
    rewardEligibility: 'PENDING',
  },
  progress: {
    appsCompleted: 0,
    appsRequired: 3,
    rewardsReceived: 0,
    vot3Converted: false,
    vot3MinimumAmountWei: '1000000000000000000',
    vot3ConversionAmountWei: null,
    voteCompleted: false,
    uniqueAppIds: [],
    activationBlock: 1,
    latestBlock: 1,
  },
};

export async function GET() {
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST() {
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
