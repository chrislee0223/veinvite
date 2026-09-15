import { existsSync } from 'node:fs';

const retiredProductionRoutes = [
  'src/app/api/internal/first-reward-recovery/route.ts',
  'src/app/api/internal/claimed-reward-recovery/route.ts',
  'src/app/api/internal/recover-round16-finality/route.ts',
  'src/app/api/internal/round13-chain-status/route.ts',
];

const restoredRoutes = retiredProductionRoutes.filter((path) =>
  existsSync(path),
);

if (restoredRoutes.length > 0) {
  console.error(
    'Retired one-time Production routes must not be restored:',
  );
  for (const path of restoredRoutes) {
    console.error(`- ${path}`);
  }
  process.exit(1);
}

console.log('Retired Production route guard passed.');
