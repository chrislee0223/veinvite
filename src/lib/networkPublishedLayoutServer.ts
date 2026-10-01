import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  sanitizePublishedNetworkWorkspace,
  type PublishedNetworkLayoutSnapshot,
} from '@/lib/networkPublishedLayout';
import type { NetworkFocusWorkspace } from '@/lib/networkWorkspace';

type LayoutRow = {
  root_wallet: string;
  focus_wallet: string;
  revision: number | string;
  schema_version: number;
  workspace: unknown;
  updated_at: string;
};

export class NetworkLayoutRevisionConflictError extends Error {
  readonly currentRevision: number;

  constructor(currentRevision: number) {
    super('Published Network layout changed on another session.');
    this.name = 'NetworkLayoutRevisionConflictError';
    this.currentRevision = currentRevision;
  }
}

function toSnapshot({
  row,
  allowedWallets,
  allowedSlotIds,
}: {
  row: LayoutRow;
  allowedWallets: Iterable<string>;
  allowedSlotIds: Iterable<1 | 2>;
}): PublishedNetworkLayoutSnapshot | null {
  const revision = Number(row.revision);
  if (
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    row.schema_version !== 1 ||
    Number.isNaN(Date.parse(row.updated_at))
  ) {
    return null;
  }

  return {
    revision,
    schemaVersion: 1,
    updatedAt: row.updated_at,
    workspace: sanitizePublishedNetworkWorkspace({
      value: row.workspace,
      allowedWallets,
      allowedSlotIds,
    }),
  };
}

export async function readPublishedNetworkLayout({
  rootWallet,
  focusWallet,
  allowedWallets,
  allowedSlotIds,
}: {
  rootWallet: string;
  focusWallet: string;
  allowedWallets: Iterable<string>;
  allowedSlotIds: Iterable<1 | 2>;
}): Promise<PublishedNetworkLayoutSnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from('network_public_layouts')
    .select(
      'root_wallet,focus_wallet,revision,schema_version,workspace,updated_at',
    )
    .eq('root_wallet', rootWallet)
    .eq('focus_wallet', focusWallet)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to read published Network layout: ${error.message}`,
    );
  }
  if (!data) return null;

  return toSnapshot({
    row: data as LayoutRow,
    allowedWallets,
    allowedSlotIds,
  });
}

export async function savePublishedNetworkLayout({
  rootWallet,
  focusWallet,
  expectedRevision,
  workspace,
  allowedWallets,
  allowedSlotIds,
}: {
  rootWallet: string;
  focusWallet: string;
  expectedRevision: number;
  workspace: NetworkFocusWorkspace;
  allowedWallets: Iterable<string>;
  allowedSlotIds: Iterable<1 | 2>;
}): Promise<PublishedNetworkLayoutSnapshot> {
  const sanitized = sanitizePublishedNetworkWorkspace({
    value: workspace,
    allowedWallets,
    allowedSlotIds,
  });

  const { data: existing, error: existingError } =
    await supabaseAdmin
      .from('network_public_layouts')
      .select('revision')
      .eq('root_wallet', rootWallet)
      .eq('focus_wallet', focusWallet)
      .maybeSingle();

  if (existingError) {
    throw new Error(
      `Failed to read current Network layout revision: ${existingError.message}`,
    );
  }

  const currentRevision = existing
    ? Number(existing.revision)
    : 0;

  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    currentRevision !== expectedRevision
  ) {
    throw new NetworkLayoutRevisionConflictError(
      Number.isSafeInteger(currentRevision)
        ? currentRevision
        : 0,
    );
  }

  const now = new Date().toISOString();

  if (!existing) {
    const { data, error } = await supabaseAdmin
      .from('network_public_layouts')
      .insert({
        root_wallet: rootWallet,
        focus_wallet: focusWallet,
        revision: 1,
        schema_version: 1,
        workspace: sanitized,
        published_at: now,
        updated_at: now,
      })
      .select(
        'root_wallet,focus_wallet,revision,schema_version,workspace,updated_at',
      )
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        throw new NetworkLayoutRevisionConflictError(1);
      }
      throw new Error(
        `Failed to publish Network layout: ${error.message}`,
      );
    }
    if (!data) {
      throw new Error(
        'Published Network layout insert returned no row.',
      );
    }

    const snapshot = toSnapshot({
      row: data as LayoutRow,
      allowedWallets,
      allowedSlotIds,
    });
    if (!snapshot) {
      throw new Error(
        'Published Network layout insert returned malformed data.',
      );
    }
    return snapshot;
  }

  const nextRevision = currentRevision + 1;
  const { data, error } = await supabaseAdmin
    .from('network_public_layouts')
    .update({
      revision: nextRevision,
      schema_version: 1,
      workspace: sanitized,
      updated_at: now,
    })
    .eq('root_wallet', rootWallet)
    .eq('focus_wallet', focusWallet)
    .eq('revision', currentRevision)
    .select(
      'root_wallet,focus_wallet,revision,schema_version,workspace,updated_at',
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to update published Network layout: ${error.message}`,
    );
  }
  if (!data) {
    const { data: latest } = await supabaseAdmin
      .from('network_public_layouts')
      .select('revision')
      .eq('root_wallet', rootWallet)
      .eq('focus_wallet', focusWallet)
      .maybeSingle();

    throw new NetworkLayoutRevisionConflictError(
      latest ? Number(latest.revision) : currentRevision,
    );
  }

  const snapshot = toSnapshot({
    row: data as LayoutRow,
    allowedWallets,
    allowedSlotIds,
  });
  if (!snapshot) {
    throw new Error(
      'Published Network layout update returned malformed data.',
    );
  }
  return snapshot;
}
