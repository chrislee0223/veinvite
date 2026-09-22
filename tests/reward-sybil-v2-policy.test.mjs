import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectHistoricalB3trConsolidation,
  detectHistoricalRewardCluster,
} from '../src/lib/sybil/v2/clusterMath.ts';
import {
  evaluateSybilV2Policy,
} from '../src/lib/sybil/v2/policy.ts';

test('single weak onboarding signal never HOLDs a referral', () => {
  const result = evaluateSybilV2Policy({
    requiredChecksComplete: true,
    signals: [
      {
        code: 'SHARED_PREACTIVATION_VTHO_FUNDER',
        family: 'FUNDING',
        strength: 'LOW',
        score: 14,
      },
    ],
  });

  assert.equal(result.state, 'CLEAR');
});

test('one same-client or one strong family becomes WATCH, not HOLD', () => {
  const result = evaluateSybilV2Policy({
    requiredChecksComplete: true,
    signals: [
      {
        code: 'SECURITY_CLIENT_INVITER_LINK',
        family: 'SECURITY_IDENTITY',
        strength: 'MEDIUM',
        score: 45,
      },
    ],
  });

  assert.equal(result.state, 'WATCH');
});

test('repeating many signals from one family cannot self-inflate into HOLD', () => {
  const result = evaluateSybilV2Policy({
    requiredChecksComplete: true,
    signals: [
      {
        code: 'HISTORICAL_REWARD_APP_CLUSTER',
        family: 'HISTORICAL_REWARD',
        strength: 'MEDIUM',
        score: 40,
      },
      {
        code: 'HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER',
        family: 'HISTORICAL_REWARD',
        strength: 'HIGH',
        score: 55,
      },
      {
        code: 'HISTORICAL_REWARD_EXTRA',
        family: 'HISTORICAL_REWARD',
        strength: 'HIGH',
        score: 80,
      },
    ],
  });

  assert.equal(result.state, 'WATCH');
  assert.equal(result.strongEvidenceFamilies.length, 1);
});

test('analysis failure never degrades into CLEAR', () => {
  const result = evaluateSybilV2Policy({
    requiredChecksComplete: false,
    analysisFailed: true,
    signals: [],
  });

  assert.equal(result.state, 'ANALYSIS_FAILED');
});

test('incomplete required checks remain pending', () => {
  const result = evaluateSybilV2Policy({
    requiredChecksComplete: false,
    signals: [],
  });

  assert.equal(result.state, 'ANALYSIS_PENDING');
});

test('active wallet restriction is authoritative for future participation', () => {
  const result = evaluateSybilV2Policy({
    requiredChecksComplete: true,
    activeRestriction: true,
    signals: [],
  });

  assert.equal(result.state, 'RESTRICTED');
  assert.equal(result.riskScore, 100);
});

test('Round 116 historical cluster fixture HOLDs all ten core wallets', () => {
  const appId =
    '0x9643ed1637948cc571b23f836ade2bdb104de88e627fa6e8e3ffef1ee5a1739a';
  const sink =
    '0x5ea9700efcfded17b7521186efc42e830501cb77';

  const wallets = {
    A: '0x2d415cbf574177ccf0e8a178ef2c8df1dcdfa2cc',
    B: '0xd2fe919a38fb7ab6f2c2df0fec7723cb778b0989',
    C: '0x352ac255f820a9d5b952b52199f06f664b40ce15',
    D: '0xbe38eb6be67e52c2743995a7bf59efd0e9265d5d',
    E: '0x703210579b9f2fd2317415278af71f5fc59f6cc8',
    F: '0x54f7d0b2f2cdc9be9d1be04c7101e984f2934c36',
    G: '0x37f983771b32d94e975e2568e5dca21d43d75a4d',
    H: '0x1bbd28f95af0df8edcf73431cab62af3b8807c39',
    I: '0x97e82cc272aaa9745b06525085f37b64e2382ff8',
    J: '0x95af037750d985f094969d3cd741a0ff51082cba',
  };

  const rewardBlocks = {
    A: [22507014,22507014,22554052,22554052,22605738,22605739],
    B: [22507580,22507580,22584045,22584045,22603477,22603478],
    C: [22507592,22507596,22584068,22584069,22603484,22603484],
    D: [22509817,22509817,22584072,22584072,22603494,22603494],
    E: [22534046,22534047,22584075,22584080,22603493,22603493,23757946],
    F: [22509842,22509842,22584079,22584079,22603493,22603493],
    G: [22515670,22515671,22586847,22586847,22603493,22603493],
    H: [22515705,22515705,22586868,22586868,22603500,22603500],
    I: [22515708,22515709,22586867,22586867,22603504,22603504],
    J: [22515714,22515715,22586873,22586874,22603503,22603503],
  };

  const sinkBlocks = {
    A: 22643849,
    B: 22643962,
    C: 22643989,
    D: 22643998,
    E: 22644014,
    F: 22644022,
    G: 22644030,
    H: 22644046,
    I: 22644056,
    J: 22644064,
  };

  const rewardRows = Object.entries(wallets).flatMap(([key, wallet]) =>
    rewardBlocks[key].map((blockNumber) => ({
      walletAddress: wallet,
      appId,
      blockNumber,
    })),
  );

  const outflows = Object.entries(wallets).map(([key, wallet]) => ({
    walletAddress: wallet,
    destinationWallet: sink,
    blockNumber: sinkBlocks[key],
  }));

  const inviterWallets = new Set([sink]);
  const protocolDestinations = new Set();

  for (const wallet of Object.values(wallets)) {
    const rewardFindings = detectHistoricalRewardCluster({
      walletAddress: wallet,
      rows: rewardRows,
      synchronizedBlockWindow: 30,
    });

    const firstRewardBlock = Math.min(
      ...rewardRows
        .filter((row) => row.walletAddress === wallet)
        .map((row) => row.blockNumber),
    );

    const consolidationFindings =
      detectHistoricalB3trConsolidation({
        walletAddress: wallet,
        rows: outflows,
        inviterWallets,
        knownProtocolDestinations: protocolDestinations,
        minimumBlock: firstRewardBlock,
      });

    assert.ok(
      rewardFindings.some(
        (finding) =>
          finding.signal.code === 'HISTORICAL_REWARD_APP_CLUSTER',
      ),
      `${wallet} should be linked by repeated historical app rewards`,
    );
    assert.ok(
      consolidationFindings.some(
        (finding) =>
          finding.signal.code === 'HISTORICAL_COMMON_B3TR_SINK',
      ),
      `${wallet} should be linked by the common historical B3TR sink`,
    );
    assert.ok(
      consolidationFindings.some(
        (finding) =>
          finding.signal.code === 'HISTORICAL_SINK_REAPPEARS_AS_INVITER',
      ),
      `${wallet} should link the historical sink back to a VeInvite inviter`,
    );

    const policy = evaluateSybilV2Policy({
      requiredChecksComplete: true,
      signals: [
        ...rewardFindings.map((finding) => finding.signal),
        ...consolidationFindings.map((finding) => finding.signal),
      ],
    });

    assert.equal(
      policy.state,
      'HOLD',
      `${wallet} must not pass Round 116-style evidence as CLEAR/WATCH`,
    );
  }
});

test('shared protocol destination is excluded from consolidation evidence', () => {
  const wallet = '0x1111111111111111111111111111111111111111';
  const protocol = '0x9999999999999999999999999999999999999999';

  const findings = detectHistoricalB3trConsolidation({
    walletAddress: wallet,
    rows: [
      { walletAddress: wallet, destinationWallet: protocol, blockNumber: 100 },
      {
        walletAddress: '0x2222222222222222222222222222222222222222',
        destinationWallet: protocol,
        blockNumber: 101,
      },
      {
        walletAddress: '0x3333333333333333333333333333333333333333',
        destinationWallet: protocol,
        blockNumber: 102,
      },
    ],
    inviterWallets: new Set(),
    knownProtocolDestinations: new Set([protocol]),
  });

  assert.deepEqual(findings, []);
});
