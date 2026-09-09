import { pathToFileURL } from 'node:url';

export const PRODUCTION_PROJECT_ID = 'prj_oKzqLd8w8sRelUmH0Dkbu0GpFGEJ';
export const QA_PROJECT_ID = 'prj_Ovth8dV6JeI5Ta8tbnnuo7MheFkV';

export function shouldBuildVercelProject(projectId, branch) {
  if (projectId === PRODUCTION_PROJECT_ID) {
    return branch === 'main';
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
