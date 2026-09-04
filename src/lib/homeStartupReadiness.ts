export const HOME_STARTUP_STATE_EVENT =
  'veinvite-home-startup-state';
export const APP_STARTUP_ERROR_EVENT =
  'veinvite-app-startup-error';

export type HomeStartupStatus =
  | 'loading'
  | 'ready'
  | 'error';

export type HomeStartupState = {
  status: HomeStartupStatus;
  walletAddress: string | null;
  invitesReady: boolean;
  referralLinkReady: boolean;
  errorMessage?: string;
};

export type StartupReadinessInput = {
  walletAddress: string | null;
  homeState: HomeStartupState | null;
  hasBootstrappedSession: boolean;
  hasPersistedWallet: boolean;
  interactiveGateVisible: boolean;
};

export type WalletBootstrapReadinessInput = {
  walletAddress: string | null;
  walletBootstrapSettled: boolean;
  interactiveGateVisible: boolean;
};

export type StartupReadinessDecision =
  | 'hold'
  | 'release'
  | 'error';

function normalizeWallet(
  walletAddress: string | null | undefined,
): string | null {
  return walletAddress?.trim().toLowerCase() || null;
}

function homeStateMatchesWallet(
  state: HomeStartupState | null,
  walletAddress: string | null,
): boolean {
  if (!state) {
    return false;
  }

  return (
    normalizeWallet(state.walletAddress) ===
    normalizeWallet(walletAddress)
  );
}

export function shouldHoldForWalletBootstrap({
  walletAddress,
  walletBootstrapSettled,
  interactiveGateVisible,
}: WalletBootstrapReadinessInput): boolean {
  return (
    !interactiveGateVisible &&
    !normalizeWallet(walletAddress) &&
    !walletBootstrapSettled
  );
}

export function resolveStartupReadiness({
  walletAddress,
  homeState,
  hasBootstrappedSession,
  hasPersistedWallet,
  interactiveGateVisible,
}: StartupReadinessInput): StartupReadinessDecision {
  // A real wallet-verification or legal/session recovery screen is actionable
  // and should replace the branded startup surface immediately.
  if (interactiveGateVisible) {
    return 'release';
  }

  const normalizedWallet = normalizeWallet(walletAddress);

  if (normalizedWallet) {
    if (!homeStateMatchesWallet(homeState, normalizedWallet)) {
      return 'hold';
    }

    if (homeState?.status === 'error') {
      return 'error';
    }

    return homeState?.status === 'ready'
      ? 'release'
      : 'hold';
  }

  // A returning browser can temporarily have wallet=null while VeWorld restores
  // its transport. Either persisted provider evidence or a server-validated
  // VeInvite session means the disconnected Home must stay hidden.
  if (hasPersistedWallet || hasBootstrappedSession) {
    return 'hold';
  }

  if (!homeStateMatchesWallet(homeState, null)) {
    return 'hold';
  }

  if (homeState?.status === 'error') {
    return 'error';
  }

  return homeState?.status === 'ready'
    ? 'release'
    : 'hold';
}

export function publishHomeStartupState(
  state: HomeStartupState,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  document.documentElement.dataset.veinviteHomeStartupStatus =
    state.status;
  document.documentElement.dataset.veinviteHomeStartupWallet =
    normalizeWallet(state.walletAddress) ?? '';
  document.documentElement.dataset.veinviteHomeInvitesReady =
    state.invitesReady ? 'true' : 'false';
  document.documentElement.dataset.veinviteHomeReferralReady =
    state.referralLinkReady ? 'true' : 'false';
  document.documentElement.dataset.veinviteHomeStartupError =
    state.errorMessage ?? '';

  window.dispatchEvent(
    new CustomEvent<HomeStartupState>(
      HOME_STARTUP_STATE_EVENT,
      { detail: state },
    ),
  );
}

export function readPublishedHomeStartupState(): HomeStartupState | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const status =
    document.documentElement.dataset
      .veinviteHomeStartupStatus;

  if (
    status !== 'loading' &&
    status !== 'ready' &&
    status !== 'error'
  ) {
    return null;
  }

  const wallet =
    document.documentElement.dataset
      .veinviteHomeStartupWallet;

  return {
    status,
    walletAddress: wallet || null,
    invitesReady:
      document.documentElement.dataset
        .veinviteHomeInvitesReady === 'true',
    referralLinkReady:
      document.documentElement.dataset
        .veinviteHomeReferralReady === 'true',
    errorMessage:
      document.documentElement.dataset
        .veinviteHomeStartupError || undefined,
  };
}
