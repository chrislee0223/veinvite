const BACKEND_ONLY_PREFIXES = Object.freeze([
  '.github/',
  'docs/',
  'scripts/',
  'src/app/api/',
  'src/lib/rewards/',
  'src/lib/sybil/',
  'supabase/',
]);

function isBackendOnlyPath(path) {
  if (BACKEND_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return true;
  }

  if (path.startsWith('tests/') && !path.startsWith('tests/playwright/')) {
    return true;
  }

  return false;
}

export function shouldRunBrowserQa({
  eventName,
  ref,
  changedPaths,
}) {
  if (eventName === 'push' && ref === 'refs/heads/main') {
    return true;
  }

  if (!Array.isArray(changedPaths) || changedPaths.length === 0) {
    return true;
  }

  return changedPaths.some((path) => !isBackendOnlyPath(path));
}

function readChangedPathsFromEnvironment() {
  const raw = process.env.CHANGED_PATHS ?? '';
  return raw
    .split('\n')
    .map((path) => path.trim())
    .filter(Boolean);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = shouldRunBrowserQa({
    eventName: process.env.GITHUB_EVENT_NAME ?? '',
    ref: process.env.GITHUB_REF ?? '',
    changedPaths: readChangedPathsFromEnvironment(),
  });

  process.stdout.write(result ? 'true' : 'false');
}
