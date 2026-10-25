import { pathToFileURL } from 'node:url';

export const PRODUCTION_PROJECT_ID = 'prj_oKzqLd8w8sRelUmH0Dkbu0GpFGEJ';
export const QA_PROJECT_ID = 'prj_Ovth8dV6JeI5Ta8tbnnuo7MheFkV';

// Isolated release-candidate authentication smoke only. This allowance is
// scoped to a throwaway QA branch and MUST NOT be merged into main.
const AUTH_SMOKE_BRANCH = 'qa-auth-integration-testnet-20261025';
function canBuildIsolatedAuthSmoke() {
  return process.env.VERCEL_ENV === 'preview' &&
    process.env.VECHAIN_NETWORK === 'testnet' &&
    process.env.NEXT_PUBLIC_NETWORK_TYPE === 'test' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL ===
      'https://bpppslplhmppxzvdkwxs.supabase.co' &&
    process.env.VEINVITE_AUTOMATIC_REWARDS_ENABLED === 'false' &&
    process.env.VEINVITE_X_PROMOTION_PAYOUT_WORKER_ENABLED === 'false' &&
    !process.env.VEINVITE_REWARD_DISTRIBUTOR_PRIVATE_KEY;
}

export function shouldBuildVercelProject(projectId, branch) {
  if (projectId === PRODUCTION_PROJECT_ID) {
    return branch === 'main' ||
      (branch === AUTH_SMOKE_BRANCH && canBuildIsolatedAuthSmoke());
  }

  if (projectId === QA_PROJECT_ID) {
    return typeof branch === 'string' && branch.startsWith('qa-');
  }

  // Unknown or newly-linked projects fail closed so they cannot silently
  // consume build quota or receive Production traffic.
  return false;
}

const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  const shouldBuild = shouldBuildVercelProject(
    process.env.VERCEL_PROJECT_ID ?? '',
    process.env.VERCEL_GIT_COMMIT_REF ?? '',
  );

  // Vercel Ignored Build Step semantics: exit 0 = ignore, exit 1 = build.
  process.exit(shouldBuild ? 1 : 0);
}
