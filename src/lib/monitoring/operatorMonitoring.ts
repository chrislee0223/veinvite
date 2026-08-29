import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetwork,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

export type OperatorMonitoringSeverity =
  | 'NORMAL'
  | 'WARNING'
  | 'CRITICAL';

export type OperatorMonitoringTrigger =
  | 'VERCEL_CRON'
  | 'MANUAL_OPERATOR'
  | 'SYSTEM_TEST';

export type OperatorMonitoringAlert = {
  code: string;
  severity: 'WARNING' | 'CRITICAL';
  message: string;
  [key: string]: unknown;
};

export type OperatorMonitoringSnapshot = {
  snapshotId: number;
  network: VeBetterNetwork;
  triggerSource: OperatorMonitoringTrigger;
  severity: OperatorMonitoringSeverity;
  alertCount: number;
  metrics: Record<string, unknown>;
  alerts: OperatorMonitoringAlert[];
  capturedAt: string;
};

type RpcSnapshotRow = {
  snapshot_id?: unknown;
  severity?: unknown;
  alert_count?: unknown;
  metrics?: unknown;
  alerts?: unknown;
  captured_at?: unknown;
};

type StoredSnapshotRow = {
  id?: unknown;
  network?: unknown;
  trigger_source?: unknown;
  severity?: unknown;
  alert_count?: unknown;
  metrics?: unknown;
  alerts?: unknown;
  captured_at?: unknown;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readPositiveInteger(
  value: unknown,
  field: string,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    throw new Error(
      `Operator monitoring returned an invalid ${field}.`,
    );
  }

  return parsed;
}

function readNonNegativeInteger(
  value: unknown,
  field: string,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    throw new Error(
      `Operator monitoring returned an invalid ${field}.`,
    );
  }

  return parsed;
}

function readSeverity(
  value: unknown,
): OperatorMonitoringSeverity {
  if (
    value === 'NORMAL' ||
    value === 'WARNING' ||
    value === 'CRITICAL'
  ) {
    return value;
  }

  throw new Error(
    'Operator monitoring returned an invalid severity.',
  );
}

function readTrigger(
  value: unknown,
): OperatorMonitoringTrigger {
  if (
    value === 'VERCEL_CRON' ||
    value === 'MANUAL_OPERATOR' ||
    value === 'SYSTEM_TEST'
  ) {
    return value;
  }

  throw new Error(
    'Operator monitoring returned an invalid trigger source.',
  );
}

function readNetwork(
  value: unknown,
): VeBetterNetwork {
  if (
    value === 'mainnet' ||
    value === 'testnet' ||
    value === 'testnet-staging'
  ) {
    return value;
  }

  throw new Error(
    'Operator monitoring returned an invalid network.',
  );
}

function readTimestamp(
  value: unknown,
): string {
  if (
    typeof value !== 'string' ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Error(
      'Operator monitoring returned an invalid timestamp.',
    );
  }

  return value;
}

function readAlerts(
  value: unknown,
): OperatorMonitoringAlert[] {
  if (!Array.isArray(value)) {
    throw new Error(
      'Operator monitoring returned invalid alerts.',
    );
  }

  return value.map((alert) => {
    if (
      !isRecord(alert) ||
      typeof alert.code !== 'string' ||
      typeof alert.message !== 'string' ||
      (alert.severity !== 'WARNING' &&
        alert.severity !== 'CRITICAL')
    ) {
      throw new Error(
        'Operator monitoring returned an invalid alert record.',
      );
    }

    return alert as OperatorMonitoringAlert;
  });
}

function normalizeRpcSnapshot(
  row: RpcSnapshotRow,
  network: VeBetterNetwork,
  trigger: OperatorMonitoringTrigger,
): OperatorMonitoringSnapshot {
  if (!isRecord(row.metrics)) {
    throw new Error(
      'Operator monitoring returned invalid metrics.',
    );
  }

  const alerts = readAlerts(row.alerts);
  const alertCount = readNonNegativeInteger(
    row.alert_count,
    'alert count',
  );

  if (alerts.length !== alertCount) {
    throw new Error(
      'Operator monitoring alert count does not match its alert records.',
    );
  }

  return {
    snapshotId: readPositiveInteger(
      row.snapshot_id,
      'snapshot id',
    ),
    network,
    triggerSource: trigger,
    severity: readSeverity(row.severity),
    alertCount,
    metrics: row.metrics,
    alerts,
    capturedAt: readTimestamp(row.captured_at),
  };
}

function normalizeStoredSnapshot(
  row: StoredSnapshotRow,
): OperatorMonitoringSnapshot {
  if (!isRecord(row.metrics)) {
    throw new Error(
      'Stored operator monitoring metrics are invalid.',
    );
  }

  const alerts = readAlerts(row.alerts);
  const alertCount = readNonNegativeInteger(
    row.alert_count,
    'stored alert count',
  );

  if (alerts.length !== alertCount) {
    throw new Error(
      'Stored operator monitoring alert count is inconsistent.',
    );
  }

  return {
    snapshotId: readPositiveInteger(
      row.id,
      'stored snapshot id',
    ),
    network: readNetwork(row.network),
    triggerSource: readTrigger(
      row.trigger_source,
    ),
    severity: readSeverity(row.severity),
    alertCount,
    metrics: row.metrics,
    alerts,
    capturedAt: readTimestamp(row.captured_at),
  };
}

export async function runOperatorMonitoringAudit(
  trigger: OperatorMonitoringTrigger =
    'VERCEL_CRON',
): Promise<OperatorMonitoringSnapshot> {
  const network = getVeBetterNetwork();
  const { data, error } = await supabaseAdmin.rpc(
    'record_operator_anomaly_snapshot',
    {
      p_network: network,
      p_trigger_source: trigger,
    },
  );

  if (error) {
    throw new Error(
      `Operator monitoring audit failed: ${error.message}`,
    );
  }

  const row = Array.isArray(data)
    ? (data[0] as RpcSnapshotRow | undefined)
    : (data as RpcSnapshotRow | null);

  if (!row) {
    throw new Error(
      'Operator monitoring audit returned no snapshot.',
    );
  }

  return normalizeRpcSnapshot(
    row,
    network,
    trigger,
  );
}

export async function readOperatorMonitoringSnapshots(
  limit = 20,
): Promise<OperatorMonitoringSnapshot[]> {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50
  ) {
    throw new Error(
      'Monitoring history limit must be an integer from 1 to 50.',
    );
  }

  const network = getVeBetterNetwork();
  const { data, error } = await supabaseAdmin
    .from('operator_monitor_snapshots')
    .select(
      'id, network, trigger_source, severity, alert_count, metrics, alerts, captured_at',
    )
    .eq('network', network)
    .order('captured_at', {
      ascending: false,
    })
    .limit(limit);

  if (error) {
    throw new Error(
      `Operator monitoring history could not be loaded: ${error.message}`,
    );
  }

  return ((data ?? []) as StoredSnapshotRow[]).map(
    normalizeStoredSnapshot,
  );
}
