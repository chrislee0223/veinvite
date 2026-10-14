import { NextRequest } from 'next/server';

import { GET as runAnalyticsMaintenance } from '../analytics-maintenance/route';

// Backup entrypoint shares the primary handler and its database claim gate.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return runAnalyticsMaintenance(request);
}
