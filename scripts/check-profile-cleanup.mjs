import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const failures = [];
const srcRoot = join(root, 'src');

const retiredPaths = [
  'src/app/api/profile/route.ts',
  'src/components/PublicProfileSettings.tsx',
  'src/lib/publicProfile.ts',
  'src/lib/publicProfileServer.ts',
  'src/lib/i18n/profilePrivacyCopy.ts',
];

const retiredRuntimeTokens = [
  'public_wallet_profiles',
  'profile-avatars',
  'PublicProfileSettings',
  'PUBLIC_PROFILE_BUCKET',
  'publicProfileServer',
  "'/api/profile'",
  '"/api/profile"',
  'profilePrivacyCopy',
];

function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

for (const path of retiredPaths) {
  if (existsSync(join(root, path))) {
    failures.push(`Retired VeInvite-local profile file returned: ${path}`);
  }
}

for (const file of walkFiles(srcRoot)) {
  if (!/\.(?:ts|tsx|js|jsx|mjs|css)$/.test(file)) continue;
  const source = readFileSync(file, 'utf8');
  for (const token of retiredRuntimeTokens) {
    if (source.includes(token)) {
      failures.push(
        `Retired profile runtime token ${JSON.stringify(token)} returned in ${relative(root, file)}.`,
      );
    }
  }
}

const settings = readFileSync(
  join(root, 'src/components/AppSettings.tsx'),
  'utf8',
);
if (
  /profile|avatar|displayName|nickname/i.test(settings)
) {
  failures.push(
    'Settings must stay limited to wallet, language, and legal controls; the retired app-local profile UI returned.',
  );
}

const removalMigration = readFileSync(
  join(
    root,
    'supabase/migrations/20260901130000_remove_public_wallet_profiles.sql',
  ),
  'utf8',
);
if (
  !/drop table if exists public\.public_wallet_profiles/i.test(removalMigration) ||
  !/where id = 'profile-avatars'/.test(removalMigration) ||
  !/set public = false/.test(removalMigration)
) {
  failures.push(
    'Profile retirement migration must keep the old table removed and any historical avatar bucket private.',
  );
}

const addMigrationPath = join(
  root,
  'supabase/migrations/20260901104000_add_public_wallet_profiles.sql',
);
if (!existsSync(addMigrationPath)) {
  failures.push(
    'Do not delete the historical profile-add migration; applied migration history must remain reproducible.',
  );
}

if (failures.length > 0) {
  console.error('Profile cleanup regression gate failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Profile cleanup regression gate passed.');
