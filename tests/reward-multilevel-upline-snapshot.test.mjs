import assert from 'node:assert/strict';
import test from 'node:test';
import {buildFiveLevelUplineSnapshot} from '../src/lib/rewards/multilevelUplineSnapshot.ts';

const wallet=n=>'0x'+n.toString(16).padStart(40,'0');
const edge=(id,child,sponsor,effectiveBlock)=>({
  edgeId:'edge-'+id,network:'mainnet',
  childWallet:wallet(child),sponsorWallet:wallet(sponsor),effectiveBlock,
});
const input=(change={})=>({
  wallet:wallet(1),network:'mainnet',eventBlock:250,
  roundActiveWallets:new Set([wallet(3),wallet(4),wallet(5)]),
  edges:[edge(1,1,2,100),edge(2,2,3,110),edge(3,3,4,120),
    edge(4,4,5,130),edge(5,5,6,140)],
  ...change,
});

test('exactly five referral ancestors, activity required only when observed',()=>{
  const s=buildFiveLevelUplineSnapshot(input());
  assert.deepEqual(s.ancestors.map(x=>x.wallet),[2,3,4,5,6].map(wallet));
  assert.deepEqual(s.ancestors.map(x=>x.active),[false,true,true,true,false]);
  assert.equal(s.disconnectedAtLevel,null);
  assert.deepEqual(s.edgeIds,['edge-1','edge-2','edge-3','edge-4','edge-5']);
});

test('future reparenting never changes an earlier-round reward chain',()=>{
  const base=input({edges:[...input().edges,edge(6,1,9,300)]});
  assert.equal(buildFiveLevelUplineSnapshot(base).ancestors[0].wallet,wallet(2));
  const later=buildFiveLevelUplineSnapshot({...base,eventBlock:350});
  assert.equal(later.ancestors[0].wallet,wallet(9));
  assert.equal(later.ancestors[1].wallet,null);
});

test('missing ancestors return empty chain levels; never move percentage up',()=>{
  const s=buildFiveLevelUplineSnapshot(input({
    edges:[edge(1,1,2,100),edge(2,2,3,110)],
  }));
  assert.deepEqual(s.ancestors.map(x=>x.wallet),
    [wallet(2),wallet(3),null,null,null]);
  assert.equal(s.disconnectedAtLevel,3);
});

test('same-block reparenting, graph loops and duplicate source ids fail closed',()=>{
  assert.throws(()=>buildFiveLevelUplineSnapshot(input({
    edges:[edge(1,1,2,100),edge(2,1,9,100)],
  })),/AMBIGUOUS_SAME_BLOCK_REFERRAL_PARENT/);
  assert.throws(()=>buildFiveLevelUplineSnapshot(input({
    edges:[edge(1,1,2,100),edge(2,2,3,110),edge(3,3,1,120)],
  })),/CYCLIC_REFERRAL_GRAPH/);
  assert.throws(()=>buildFiveLevelUplineSnapshot(input({
    edges:[edge(1,1,2,100),edge(1,2,3,101)],
  })),/DUPLICATED_REFERRAL_EDGE_ID/);
  assert.throws(()=>buildFiveLevelUplineSnapshot(input({
    edges:[edge(1,1,1,100)],
  })),/CYCLIC_REFERRAL_GRAPH/);
});

test('wallet casing normalized, cross-network or unknown activity rejected',()=>{
  const s=buildFiveLevelUplineSnapshot(input({wallet:wallet(1).toUpperCase().replace('0X','0x')}));
  assert.equal(s.wallet,wallet(1));
  assert.throws(()=>buildFiveLevelUplineSnapshot(input({
    edges:[{...edge(1,1,2,100),network:'testnet'}],
  })),/UNTRUSTED_REFERRAL_EDGE/);
  assert.throws(()=>buildFiveLevelUplineSnapshot(input({
    roundActiveWallets:new Set(['not-a-wallet']),
  })),/INVALID_REFERRAL_WALLET/);
});
