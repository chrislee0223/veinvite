import assert from 'node:assert/strict';
import test from 'node:test';

import {
  materializeNetworkWorkspaceForPublish,
  networkWorkspaceIsEmpty,
  sanitizePublishedNetworkWorkspace,
  shouldAdoptPublishedNetworkWorkspace,
} from '../src/lib/networkPublishedLayout.ts';

const A='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C='0xcccccccccccccccccccccccccccccccccccccccc';

test('publish materialization stores a complete focus snapshot', () => {
  const materialized=materializeNetworkWorkspaceForPublish({
    workspace:{
      positions:{[A]:{x:10,y:20}},
      groups:[{
        id:'group-one',
        label:'Friends',
        members:[B],
        x:300,
        y:400,
        collapsed:false,
      }],
    },
    childPoints:[
      {key:A,x:100,y:120},
      {key:B,x:200,y:220},
    ],
    slotPoints:[
      {key:'slot:1',x:500,y:520},
      {key:'slot:2',x:600,y:620},
    ],
  });

  assert.deepEqual(materialized.positions,{
    [A]:{x:100,y:120},
    [B]:{x:200,y:220},
    'slot:1':{x:500,y:520},
    'slot:2':{x:600,y:620},
  });
  assert.equal(materialized.groups[0].label,'Friends');
});

test('server sanitization strips unknown wallets and unsafe group members', () => {
  const workspace=sanitizePublishedNetworkWorkspace({
    value:{
      positions:{
        [A]:{x:100,y:120},
        [C]:{x:200,y:220},
        'slot:1':{x:300,y:320},
      },
      groups:[{
        id:'group-one',
        label:'Friends\u0000',
        members:[A,C],
        x:400,
        y:420,
        collapsed:false,
        memberOffsets:{
          [A]:{x:5,y:6},
          [C]:{x:7,y:8},
        },
      }],
    },
    allowedWallets:[A,B],
    allowedSlotIds:[1],
  });

  assert.deepEqual(Object.keys(workspace.positions).sort(),[
    A,
    'slot:1',
  ]);
  assert.deepEqual(workspace.groups[0].members,[A]);
  assert.equal(workspace.groups[0].label,'Friends');
  assert.deepEqual(workspace.groups[0].memberOffsets,{
    [A]:{x:5,y:6},
  });
});

test('coordinates are clamped and malformed groups are discarded', () => {
  const workspace=sanitizePublishedNetworkWorkspace({
    value:{
      positions:{
        [A]:{x:-500,y:99999},
      },
      groups:[
        {
          id:'bad id with spaces',
          label:'Bad',
          members:[A],
          x:10,
          y:10,
        },
        {
          id:'valid-group',
          label:'Valid',
          members:[A],
          x:99999,
          y:-100,
        },
      ],
    },
    allowedWallets:[A],
    allowedSlotIds:[],
  });

  assert.deepEqual(workspace.positions[A],{
    x:0,
    y:1900,
  });
  assert.equal(workspace.groups.length,1);
  assert.equal(workspace.groups[0].id,'valid-group');
  assert.equal(workspace.groups[0].x,2600);
  assert.equal(workspace.groups[0].y,0);
});

test('empty workspace detection stays explicit', () => {
  assert.equal(
    networkWorkspaceIsEmpty({positions:{},groups:[]}),
    true,
  );
  assert.equal(
    networkWorkspaceIsEmpty({
      positions:{[A]:{x:1,y:2}},
      groups:[],
    }),
    false,
  );
});


test('published server layout wins on a newly synced device but preserves same-revision local edits', () => {
  const legacyLocal={
    positions:{[A]:{x:111,y:222}},
    groups:[],
  };
  const serverWorkspace={
    positions:{[A]:{x:333,y:444}},
    groups:[],
  };

  assert.equal(
    shouldAdoptPublishedNetworkWorkspace({
      localWorkspace:legacyLocal,
      localRevision:0,
      publishedRevision:1,
    }),
    true,
  );

  assert.equal(
    shouldAdoptPublishedNetworkWorkspace({
      localWorkspace:legacyLocal,
      localRevision:2,
      publishedRevision:2,
    }),
    false,
  );

  assert.equal(
    shouldAdoptPublishedNetworkWorkspace({
      localWorkspace:legacyLocal,
      localRevision:2,
      publishedRevision:3,
    }),
    true,
  );

  assert.equal(
    shouldAdoptPublishedNetworkWorkspace({
      localWorkspace:{positions:{},groups:[]},
      localRevision:2,
      publishedRevision:2,
    }),
    true,
  );

  assert.notDeepEqual(legacyLocal,serverWorkspace);
});
