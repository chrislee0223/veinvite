import { supabaseAdmin } from '@/lib/supabaseServer';

export type OperatorFastStatusReconciliation = {
  matches: boolean;
  usageDate: string;
  logId: number | null;
};

export async function reconcileOperatorFastStatus(): Promise<OperatorFastStatusReconciliation> {
  const { data, error } = await supabaseAdmin.rpc(
    'reconcile_operator_fast_status',
    { p_record: true },
  );

  if (error) {
    throw new Error(
      `Fast operator status reconciliation failed: ${error.message}`,
    );
  }

  const result = data as
    | OperatorFastStatusReconciliation
    | null;

  if (!result || typeof result.matches !== 'boolean') {
    throw new Error(
      'Fast operator status reconciliation returned an invalid result.',
    );
  }

  if (!result.matches) {
    throw new Error(
      `Fast operator status differs from source-of-truth data for ${result.usageDate}.`,
    );
  }

  return result;
}
