import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const network = await readFile('src/components/AppNetwork.tsx', 'utf8');

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return source.slice(from, to);
}

test('plain-text VET domain prefixes do not waste wallet-search API quota', () => {
  assert.match(network, /const isWalletLikeSearch = normalizedSearchQuery\.startsWith\('0x'\)/);
  assert.match(
    network,
    /if \(!resolvedSearchAddress && !isWalletLikeSearch\) \{[\s\S]*setSearchResults\(\[\]\);[\s\S]*setPublicSearchWallet\(null\);[\s\S]*setSearching\(false\);[\s\S]*return;/,
  );
  assert.match(network, /readCachedLeaderboardDomainSuggestions\(normalizedSearchQuery\)/);
});

test('cached domain suggestion navigation is abortable and survives transient My Network errors', () => {
  assert.match(network, /const searchActionControllerRef = useRef<AbortController \| null>\(null\)/);
  assert.match(network, /onChange=\{\(event\) => updateSearchQuery\(event\.target\.value\)\}/);

  const action = sliceBetween(
    network,
    'const openCachedDomainSuggestion = useCallback',
    'const beginLayoutEdit = useCallback',
  );
  assert.match(action, /searchActionControllerRef\.current\?\.abort\(\)/);
  assert.match(action, /signal: controller\.signal/);
  assert.match(action, /if \(controller\.signal\.aborted\) return;/);

  const catchStart = action.indexOf('} catch {');
  const finallyStart = action.indexOf('} finally {', catchStart);
  assert.notEqual(catchStart, -1);
  assert.notEqual(finallyStart, -1);
  const catchBody = action.slice(catchStart, finallyStart);
  assert.match(catchBody, /setSearchResults\(\[\]\)/);
  assert.match(catchBody, /setPublicSearchWallet\(null\)/);
  assert.doesNotMatch(catchBody, /openPublicSearchResult/);
});

test('closing or changing search cancels a pending cached-domain action', () => {
  const close = sliceBetween(
    network,
    'const closeSearch = useCallback',
    'const updateSearchQuery = useCallback',
  );
  const update = sliceBetween(
    network,
    'const updateSearchQuery = useCallback',
    'useEffect(() => {',
  );
  assert.match(close, /searchActionControllerRef\.current\?\.abort\(\)/);
  assert.match(update, /searchActionControllerRef\.current\?\.abort\(\)/);
  assert.match(update, /setSearching\(false\)/);
});
