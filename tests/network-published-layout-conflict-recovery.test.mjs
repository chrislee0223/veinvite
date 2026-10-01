import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  readPublishedConflictMap,
  writePublishedConflictMap,
} from '../src/lib/networkPublishedLayoutClient.ts';

const ROOT='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const FOCUS='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function withLocalStorage(run) {
  const values=new Map();
  const previousWindow=globalThis.window;
  globalThis.window={
    localStorage:{
      getItem(key){ return values.has(key) ? values.get(key) : null; },
      setItem(key,value){ values.set(key,String(value)); },
    },
  };
  try {
    run(values);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window=previousWindow;
    }
  }
}

test('layout conflict revision survives reload metadata storage', () => {
  withLocalStorage(() => {
    writePublishedConflictMap(ROOT,{
      [FOCUS]:7,
      invalid:9,
    });

    assert.deepEqual(
      readPublishedConflictMap(ROOT),
      {[FOCUS]:7},
    );
  });
});

test('sync hook blocks automatic publish after revision conflict until explicit edit completion', async () => {
  const hook=await readFile(
    'src/hooks/useNetworkPublishedLayoutSync.ts',
    'utf8',
  );

  assert.match(
    hook,
    /error\.code ===[\s\S]*'LAYOUT_REVISION_CONFLICT'/u,
  );
  assert.match(
    hook,
    /conflictRevisionsRef\.current\[[\s\S]*focusKey[\s\S]*\][\s\S]*error\.currentRevision/u,
  );
  assert.match(
    hook,
    /publishableFocusRef\.current\.delete\([\s\S]*focusKey/u,
  );
  assert.match(
    hook,
    /conflictRevisionsRef\.current\[[\s\S]*currentFocusKey[\s\S]*\] !== undefined[\s\S]*!publishableFocusRef\.current\.has/u,
  );
  assert.match(
    hook,
    /markCurrentFocusPublishable[\s\S]*publishableFocusRef\.current\.add[\s\S]*delete conflicts\[currentFocusKey\]/u,
  );
});

test('hydration preserves a conflicted local draft while advancing its server base revision', async () => {
  const hook=await readFile(
    'src/hooks/useNetworkPublishedLayoutSync.ts',
    'utf8',
  );

  assert.match(
    hook,
    /const conflictRevision =[\s\S]*conflictRevisionsRef/u,
  );
  assert.match(
    hook,
    /if \(conflictRevision !== null\)[\s\S]*Math\.max\([\s\S]*conflictRevision,[\s\S]*snapshot\.revision/u,
  );
  assert.match(
    hook,
    /writePublishedRevisionMap\([\s\S]*wallet,[\s\S]*revisions/u,
  );
  assert.match(
    hook,
    /writePublishedConflictMap\([\s\S]*wallet,[\s\S]*conflicts/u,
  );
});
