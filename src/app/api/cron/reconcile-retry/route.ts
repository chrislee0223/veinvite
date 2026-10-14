import { NextRequest } from 'next/server';

import { GET as runDailyReconciliation } from '../reconcile/route';

// A later Vercel trigger for the same authenticated, atomically claimed job.
// Never bypass original reward, evidence, or Sybil safety checks.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return runDailyReconciliation(request);
}
