const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;

function normalize(value: string | null | undefined): string | null {
  const address = value?.trim().toLowerCase() ?? '';
  return ADDRESS_PATTERN.test(address) ? address : null;
}

/**
 * A verified server-session marker is necessary but never sufficient for
 * wallet ownership. Cold restoration only reinitializes SDK transport when
 * independently persisted provider identity matches the server wallet.
 * No session, signature, wallet authorization, or Home visibility is granted.
 */
export function resolveColdRestoreWallet({
  bootstrapWallet,
  veChainKitWallet,
  dappKitWallet,
  persistedDappKitWallet,
}: {
  bootstrapWallet: string | null | undefined;
  veChainKitWallet: string | null | undefined;
  dappKitWallet: string | null | undefined;
  persistedDappKitWallet: string | null | undefined;
}): string | null {
  const serverWallet = normalize(bootstrapWallet);
  if (!serverWallet || normalize(veChainKitWallet)) return null;

  return normalize(dappKitWallet) === serverWallet ||
    normalize(persistedDappKitWallet) === serverWallet
    ? serverWallet
    : null;
}
