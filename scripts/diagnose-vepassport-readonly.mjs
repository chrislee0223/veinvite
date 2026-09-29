import { ThorClient } from '@vechain/sdk-network';

const NODE = 'https://mainnet.vechain.org';
const PASSPORT = '0x35a267671d8EDD607B2056A9a13E7ba7CF53c8b3';
const XALLOC = '0x89A00Bb0947a30FF95BEeF77a66AEdE3842Fe5B7';

const passportAbi = [
  {type:'function',name:'version',stateMutability:'pure',inputs:[],outputs:[{type:'string'}]},
  {type:'function',name:'thresholdPoPScore',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]},
  {type:'function',name:'roundsForCumulativeScore',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]},
  {type:'function',name:'signalingThreshold',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]},
  {type:'function',name:'maxEntitiesPerPassport',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]},
  {type:'function',name:'blacklistThreshold',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]},
  {type:'function',name:'whitelistThreshold',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]},
  {type:'function',name:'isCheckEnabled',stateMutability:'view',inputs:[{name:'check',type:'uint8'}],outputs:[{type:'bool'}]},
  {type:'function',name:'isPerson',stateMutability:'view',inputs:[{name:'user',type:'address'}],outputs:[{name:'person',type:'bool'},{name:'reason',type:'string'}]},
  {type:'function',name:'isEntity',stateMutability:'view',inputs:[{name:'user',type:'address'}],outputs:[{type:'bool'}]},
  {type:'function',name:'isPassport',stateMutability:'view',inputs:[{name:'user',type:'address'}],outputs:[{type:'bool'}]},
  {type:'function',name:'getPassportForEntity',stateMutability:'view',inputs:[{name:'entity',type:'address'}],outputs:[{type:'address'}]},
  {type:'function',name:'getEntitiesLinkedToPassport',stateMutability:'view',inputs:[{name:'passport',type:'address'}],outputs:[{type:'address[]'}]},
  {type:'function',name:'getDelegatee',stateMutability:'view',inputs:[{name:'delegator',type:'address'}],outputs:[{type:'address'}]},
  {type:'function',name:'getDelegator',stateMutability:'view',inputs:[{name:'delegatee',type:'address'}],outputs:[{type:'address'}]},
  {type:'function',name:'isWhitelisted',stateMutability:'view',inputs:[{name:'user',type:'address'}],outputs:[{type:'bool'}]},
  {type:'function',name:'isBlacklisted',stateMutability:'view',inputs:[{name:'user',type:'address'}],outputs:[{type:'bool'}]},
  {type:'function',name:'isPassportBlacklisted',stateMutability:'view',inputs:[{name:'passport',type:'address'}],outputs:[{type:'bool'}]},
  {type:'function',name:'signaledCounter',stateMutability:'view',inputs:[{name:'user',type:'address'}],outputs:[{type:'uint256'}]},
  {type:'function',name:'userTotalScore',stateMutability:'view',inputs:[{name:'user',type:'address'}],outputs:[{type:'uint256'}]},
  {type:'function',name:'getCumulativeScoreWithDecay',stateMutability:'view',inputs:[{name:'user',type:'address'},{name:'lastRound',type:'uint256'}],outputs:[{type:'uint256'}]},
  {type:'function',name:'userRoundActionCount',stateMutability:'view',inputs:[{name:'user',type:'address'},{name:'round',type:'uint256'}],outputs:[{type:'uint256'}]},
  {type:'function',name:'userRoundAppCount',stateMutability:'view',inputs:[{name:'user',type:'address'},{name:'round',type:'uint256'}],outputs:[{type:'uint256'}]},
  {type:'function',name:'userInteractedApps',stateMutability:'view',inputs:[{name:'user',type:'address'}],outputs:[{type:'bytes32[]'}]},
];

const xallocAbi = [
  {type:'function',name:'currentRoundId',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]},
];

const wallets = [
  ['QNU8TDF','0x0b542507c5373620d121d6161943a4d6d814d4e5'],
  ['EALXSC8','0x0459f87278f58a26beefe3a3928982d52ad12f35'],
  ['7ACQA43','0x79f1fa450b50a0e7ad5c7255ea8a59eb12e12c3e'],
  ['65242BC','0x259a1644d0c97a823ca1d6d811f6e6b522d92e82'],
  ['JEZP37F','0x009c2dbbb4b823b0544c3580921b544baf77cb4d'],
  ['M89HCCW','0xf6a8366f038e6a800fa1d61b8c9f0e9857549c31'],
  ['DDJLW93','0xc3817b6ffe9db5faa7c40172664057fd1b23002f'],
  ['VWDUC56','0xb09f72f192cbe89e70ebff04abf473f929c298a8'],
  ['JUXJTSP','0x91de8057855f553edc93499c36ccad00bc0feba5'],
];

function normalize(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, normalize(v)]));
  }
  return value;
}

const thor = ThorClient.at(NODE);
const passport = thor.contracts.load(PASSPORT, passportAbi);
const xalloc = thor.contracts.load(XALLOC, xallocAbi);

async function readOne(contract, fn, ...args) {
  try {
    const result = await contract.read[fn](...args);
    return {ok:true, value:normalize(result)};
  } catch (error) {
    return {ok:false, error:error instanceof Error ? error.message : String(error)};
  }
}

const currentRoundRead = await readOne(xalloc,'currentRoundId');
const currentRound = currentRoundRead.ok ? Number(currentRoundRead.value?.[0]) : null;

const settings = {};
for (const fn of ['version','thresholdPoPScore','roundsForCumulativeScore','signalingThreshold','maxEntitiesPerPassport','blacklistThreshold','whitelistThreshold']) {
  settings[fn] = await readOne(passport,fn);
}
settings.currentRoundId = currentRoundRead;
settings.enabledChecks = {};
for (const [name,id] of [['WHITELIST',1],['BLACKLIST',2],['SIGNALING',3],['PARTICIPATION',4],['GM_OWNERSHIP',5]]) {
  settings.enabledChecks[name] = await readOne(passport,'isCheckEnabled',id);
}

const results = [];
for (const [label,wallet] of wallets) {
  const base = {
    label,
    wallet,
    isPerson: await readOne(passport,'isPerson',wallet),
    isEntity: await readOne(passport,'isEntity',wallet),
    isPassport: await readOne(passport,'isPassport',wallet),
    resolvedPassport: await readOne(passport,'getPassportForEntity',wallet),
    delegatee: await readOne(passport,'getDelegatee',wallet),
    delegator: await readOne(passport,'getDelegator',wallet),
    isWhitelisted: await readOne(passport,'isWhitelisted',wallet),
    isBlacklisted: await readOne(passport,'isBlacklisted',wallet),
    isPassportBlacklisted: await readOne(passport,'isPassportBlacklisted',wallet),
    signals: await readOne(passport,'signaledCounter',wallet),
    userTotalScore: await readOne(passport,'userTotalScore',wallet),
    interactedApps: await readOne(passport,'userInteractedApps',wallet),
  };

  const resolved = base.resolvedPassport.ok ? String(base.resolvedPassport.value?.[0] ?? '').toLowerCase() : '';
  if (/^0x[0-9a-f]{40}$/.test(resolved)) {
    base.resolvedPassportState = {
      address: resolved,
      entities: await readOne(passport,'getEntitiesLinkedToPassport',resolved),
      signals: await readOne(passport,'signaledCounter',resolved),
      totalScore: await readOne(passport,'userTotalScore',resolved),
      isPassportBlacklisted: await readOne(passport,'isPassportBlacklisted',resolved),
      isPerson: await readOne(passport,'isPerson',resolved),
    };
  }

  if (currentRound !== null && Number.isSafeInteger(currentRound) && currentRound > 0) {
    base.currentCumulativeScore = await readOne(passport,'getCumulativeScoreWithDecay',wallet,currentRound);
    const rounds = [];
    for (let r=Math.max(1,currentRound-11); r<=currentRound; r++) {
      const [actions, apps] = await Promise.all([
        readOne(passport,'userRoundActionCount',wallet,r),
        readOne(passport,'userRoundAppCount',wallet,r),
      ]);
      rounds.push({round:r,actions,apps});
    }
    base.recentActorRounds = rounds;
    if (/^0x[0-9a-f]{40}$/.test(resolved) && resolved !== wallet.toLowerCase()) {
      base.resolvedPassportCumulativeScore = await readOne(passport,'getCumulativeScoreWithDecay',resolved,currentRound);
    }
  }

  results.push(base);
}

console.log('VEPASSPORT_RESULT=' + JSON.stringify({
  generatedAt:new Date().toISOString(),
  settings,
  results,
}));
