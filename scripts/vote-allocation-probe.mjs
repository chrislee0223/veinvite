import { ABIEvent, Hex } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

const NODE_URL = 'https://mainnet.vechain.org';
const X_ALLOCATION_VOTING = '0x89A00Bb0947a30FF95BEeF77a66AEdE3842Fe5B7';

const voteEvent = new ABIEvent(
  'event AllocationVoteCast(address indexed voter, uint256 indexed roundId, bytes32[] appsIds, uint256[] voteWeights)',
);

const votes = [
  ['4JDJXVC','0xd587142fc02bfc866ed85f8dbb696ddb91d70852',115,25824104,'0x14c3ed96f3fd09665baf28d598d8ad56d6b7475a93f51384c1ae9d12e0ec572b'],
  ['EALXSC8','0x0459f87278f58a26beefe3a3928982d52ad12f35',115,25827144,'0x2f8da61481e251fa90f76918c1978026b25fa18bc581cb96ba19560a248528ce'],
  ['QNU8TDF','0x0b542507c5373620d121d6161943a4d6d814d4e5',115,25827216,'0x012035959fb3520e160353760d1c51e136590583ac76016f6a20f4cb59441130'],
  ['74FQ6CB','0x2d415cbf574177ccf0e8a178ef2c8df1dcdfa2cc',116,25884177,'0xcf8e1d64da01e78602f1993bf6a086b30ee4335abbbbd1fef44e27656decbbbb'],
  ['F84ZL4N','0xd2fe919a38fb7ab6f2c2df0fec7723cb778b0989',116,25884202,'0xf0276929a48f555bf87123e0782d6f8c71a6a75a4b108f2c0f1318f0fa8eb0b7'],
  ['SQCX6F9','0x352ac255f820a9d5b952b52199f06f664b40ce15',116,25884464,'0xa1d6bc428dc8369e6e44a9dc5eee0695c1381c07b56534e5d046f918fc7ece33'],
  ['V34W9PM','0xbe38eb6be67e52c2743995a7bf59efd0e9265d5d',116,25884508,'0xffa5f4b2ca3246c377fd542b67ff19393cd49a1c9b3fa0c52892725eed6c1463'],
  ['8GANYW6','0x703210579b9f2fd2317415278af71f5fc59f6cc8',116,25884699,'0x8ec6407948f8b3dd66e7443ae2f31871e735259e4594a3f03e1387a5ecdcc098'],
  ['WPGLEGJ','0x54f7d0b2f2cdc9be9d1be04c7101e984f2934c36',116,25884780,'0x8f28ad80077c9a0b010936e856f081d262b443c11668a30e4d964db2bb136a8f'],
  ['BGGJDJS','0x37f983771b32d94e975e2568e5dca21d43d75a4d',116,25884850,'0xe4b9e173f396f7a24989ee5b37b2acebcfc19db9490cd56b80ade03ba1f43fea'],
  ['8DNK7KV','0x1bbd28f95af0df8edcf73431cab62af3b8807c39',116,25884896,'0xc4cb475c20a7f8a9ae97d9f37f21283b5c2957e4125f140bc6b1d3b178dc8a95'],
  ['9L4TMG5','0x97e82cc272aaa9745b06525085f37b64e2382ff8',116,25884932,'0x51c557414eaf23bd138c488b509b936c9baf3b9e46c9fd16f2aad8c508f9ef4b'],
  ['SBWYUFQ','0x95af037750d985f094969d3cd741a0ff51082cba',116,25884977,'0xff85391a563ab5759d291f076242c9cc80158ad724f191495af96a00b3787b36'],
  ['2YYCS2X','0x9fc31513746887e0d82f50aa41212913848feaa0',116,25885026,'0x171f564d18322f4d4853bfcddb850c584c6608e5638348256a8edadcede192a3'],
  ['7ACQA43','0x79f1fa450b50a0e7ad5c7255ea8a59eb12e12c3e',116,25886525,'0x201292fde08d464eac316cde4cad55b04882150211ad408d3535b54ff375a73c'],
];

const thor = ThorClient.at(NODE_URL);

function singleTopic(topic) {
  return typeof topic === 'string' ? topic : undefined;
}

for (const [inviteCode, walletAddress, roundId, blockNumber, txId] of votes) {
  try {
    const topics = voteEvent.encodeFilterTopics([walletAddress, BigInt(roundId)]);
    const logs = await thor.logs.filterRawEventLogs({
      range: { unit: 'block', from: blockNumber, to: blockNumber },
      options: { offset: 0, limit: 100 },
      criteriaSet: [{
        address: X_ALLOCATION_VOTING,
        topic0: singleTopic(topics[0]),
        topic1: singleTopic(topics[1]),
        topic2: singleTopic(topics[2]),
      }],
      order: 'asc',
    });

    const matched = logs.find((log) => log.meta?.txID?.toLowerCase() === txId.toLowerCase());
    if (!matched?.data || !matched?.topics) {
      console.log(JSON.stringify({ inviteCode, walletAddress, roundId, blockNumber, txId, error: 'matching log not found' }));
      continue;
    }

    const decoded = voteEvent.decodeEventLogAsArray({
      data: Hex.of(matched.data),
      topics: matched.topics.map((topic) => Hex.of(topic)),
    });
    const appIds = decoded[2];
    const weights = decoded[3];
    const allocations = Array.isArray(appIds) && Array.isArray(weights)
      ? appIds.map((appId, index) => ({
          appId: String(appId).toLowerCase(),
          voteWeight: typeof weights[index] === 'bigint' ? weights[index].toString() : String(weights[index]),
        }))
      : [];

    console.log(JSON.stringify({
      inviteCode,
      walletAddress: walletAddress.toLowerCase(),
      roundId,
      blockNumber,
      txId: txId.toLowerCase(),
      clauseIndex: matched.meta?.clauseIndex ?? null,
      allocations,
    }));
  } catch (error) {
    console.log(JSON.stringify({
      inviteCode,
      walletAddress,
      roundId,
      blockNumber,
      txId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}
