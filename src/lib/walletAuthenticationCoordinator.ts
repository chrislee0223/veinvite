export const WALLET_AUTH_ACTIVITY_EVENT =
  'veinvite-wallet-auth-activity';

type ActiveWalletAuthentication = {
  walletAddress: string;
  promise: Promise<void>;
  cancel: () => void;
  generation: number;
};

let authenticationGeneration = 0;
let activeAuthentication: ActiveWalletAuthentication | null = null;
let activeWalletProviderReconciliation: Promise<unknown> | null = null;
type PendingVeWorldHandoff = {
  walletAddress: string;
  readyAt: number;
};

let pendingVeWorldHandoff: PendingVeWorldHandoff | null = null;

function emitActivityChange() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(WALLET_AUTH_ACTIVITY_EVENT, {
      detail: {
        walletAddress:
          activeAuthentication?.walletAddress ?? null,
        isAuthenticating: activeAuthentication !== null,
        generation: authenticationGeneration,
      },
    }),
  );
}

export function getActiveWalletAuthentication():
ActiveWalletAuthentication | null {
  return activeAuthentication;
}

export function isWalletAuthenticationInProgress(): boolean {
  return activeAuthentication !== null;
}

export function createWalletAuthenticationGeneration(): number {
  authenticationGeneration += 1;
  return authenticationGeneration;
}

export function isWalletAuthenticationGenerationCurrent(
  generation: number,
): boolean {
  return generation === authenticationGeneration;
}

export function setActiveWalletAuthentication(
  authentication: ActiveWalletAuthentication,
): void {
  activeAuthentication = authentication;
  emitActivityChange();
}

export function clearActiveWalletAuthentication(
  promise: Promise<void>,
): void {
  if (activeAuthentication?.promise !== promise) {
    return;
  }

  activeAuthentication = null;
  emitActivityChange();
}

export function cancelActiveWalletAuthentication():
ActiveWalletAuthentication | null {
  authenticationGeneration += 1;

  const current = activeAuthentication;

  // Keep the cancelled authentication registered until its wallet-owned
  // signing promise actually settles. AbortController can stop VeInvite fetch
  // work, but it cannot reliably dismiss a VeWorld requestCertificate prompt.
  // Retaining the slot prevents a rapid A -> B -> C switch from opening a new
  // prompt while the previous wallet UI is still alive.
  current?.cancel();
  emitActivityChange();

  return current;
}

export async function waitForWalletProviderReconciliation(): Promise<void> {
  const current = activeWalletProviderReconciliation;

  if (!current) {
    return;
  }

  try {
    await current;
  } catch {
    // The owner of the provider reconciliation reports its own failure.
    // Authentication only needs the wallet transport to stop mutating before
    // it opens a VeWorld signing prompt.
  }
}

export async function runWalletProviderReconciliation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  while (activeWalletProviderReconciliation) {
    try {
      await activeWalletProviderReconciliation;
    } catch {
      // A failed reconciliation still releases the transport lock.
    }
  }

  const run = operation();
  activeWalletProviderReconciliation = run;

  try {
    return await run;
  } finally {
    if (activeWalletProviderReconciliation === run) {
      activeWalletProviderReconciliation = null;
    }
  }
}


export function markPendingVeWorldWalletHandoff(
  walletAddress: string,
  readyAt: number,
): void {
  pendingVeWorldHandoff = {
    walletAddress,
    readyAt,
  };
}

export function getPendingVeWorldWalletHandoff():
PendingVeWorldHandoff | null {
  return pendingVeWorldHandoff;
}

export function isPendingVeWorldWalletHandoff(
  walletAddress: string,
): boolean {
  return pendingVeWorldHandoff?.walletAddress === walletAddress;
}

export function getPendingVeWorldWalletHandoffDelay(
  walletAddress: string,
): number {
  if (
    pendingVeWorldHandoff?.walletAddress !== walletAddress
  ) {
    return 0;
  }

  return Math.max(
    0,
    pendingVeWorldHandoff.readyAt - Date.now(),
  );
}

export function clearPendingVeWorldWalletHandoff(
  walletAddress?: string,
): void {
  if (
    walletAddress &&
    pendingVeWorldHandoff?.walletAddress !== walletAddress
  ) {
    return;
  }
  pendingVeWorldHandoff = null;
}
