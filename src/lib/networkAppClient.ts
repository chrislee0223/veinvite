import { normalizeNetworkWallet as keyWallet } from '@/lib/networkCanvasGeometry';
import {
  parseNetworkWorkspaceStore,
  type NetworkWorkspaceStore,
} from '@/lib/networkWorkspace';

const WORKSPACE_PREFIX = 'veinvite-network-workspace-v1:';

export function workspaceStorageKey(wallet: string): string {
  return `${WORKSPACE_PREFIX}${keyWallet(wallet)}`;
}

export function readStoredWorkspace(wallet: string): NetworkWorkspaceStore {
  try {
    return parseNetworkWorkspaceStore(
      window.localStorage.getItem(workspaceStorageKey(wallet)),
    );
  } catch {
    return { version: 1, focus: {} };
  }
}

export function newGroupId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function goHomeWithoutReload() {
  const button = document.querySelector<HTMLButtonElement>(
    '[data-veinvite-tab="home"]',
  );

  if (button) {
    button.click();
    return;
  }

  window.location.assign('/');
}
