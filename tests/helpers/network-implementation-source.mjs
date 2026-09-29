import { readFile } from 'node:fs/promises';

export const NETWORK_IMPLEMENTATION_PATHS = Object.freeze([
  'src/components/AppNetwork.tsx',
  'src/lib/networkAppClient.ts',
  'src/lib/networkAppViewHelpers.ts',
  'src/lib/networkDataClient.ts',
]);

export async function readNetworkImplementationBundle() {
  const sources = await Promise.all(
    NETWORK_IMPLEMENTATION_PATHS.map((path) => readFile(path, 'utf8')),
  );

  return sources
    .map((source, index) => `/* ${NETWORK_IMPLEMENTATION_PATHS[index]} */\n${source}`)
    .join('\n\n');
}
