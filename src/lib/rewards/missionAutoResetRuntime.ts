/**
 * Production schema readiness is bound to the already reviewed production
 * project, never a Preview or arbitrary database. Deploy this release only
 * AFTER the disabled SQL migration is verified. The DB enabled flag is the
 * sole live write switch; read projections stay available after pausing.
 * Explicit true permits an isolated test deployment with its own schema.
 */
export function missionAutoResetSchemaReady(
  env: Partial<Pick<NodeJS.ProcessEnv,'VERCEL_ENV'|'NEXT_PUBLIC_SUPABASE_URL'|'VEINVITE_MISSION_AUTO_RESET_READY'>> = process.env,
): boolean {
  if (env.VEINVITE_MISSION_AUTO_RESET_READY === 'true') return true;
  if (env.VERCEL_ENV !== 'production') return false;
  try {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    return url.protocol === 'https:' && url.hostname === 'upfjvkidaqtnbmmnhupz.supabase.co';
  } catch {
    return false;
  }
}
