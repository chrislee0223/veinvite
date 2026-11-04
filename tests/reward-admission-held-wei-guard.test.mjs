import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const body = readFileSync(new URL('../src/lib/rewards/rewardReservation.ts',import.meta.url),'utf8');
const slash = String.fromCharCode(92);

test('HELD minimum accepts positive integer Wei and rejects double-escaped regex',()=>{
 const canonical = '/^[1-9]' + slash + 'd*$/';
 const broken = '/^[1-9]' + slash + slash + 'd*$/';
 assert.ok(body.includes(canonical), 'HELD exact-positive integer parser must be canonical');
 assert.ok(!body.includes(broken), 'a literal-backslash pattern would block every HELD guarantee');
 assert.match(body,/BigInt\(admission\.guaranteedWei!\) > BigInt\(quotedAmountWei\)/);
 assert.match(body,/commit_reward_admission_held_to_fixed_v1/);
});
