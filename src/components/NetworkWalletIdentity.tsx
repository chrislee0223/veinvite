'use client';

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  useGetAvatar,
  useVechainDomain,
} from '@vechain/vechain-kit';
import { getPicassoImage } from '@vechain/vechain-kit/utils';

import {
  formatCompactVechainDomain,
  readCachedLeaderboardDomain,
  rememberLeaderboardDomain,
} from '@/lib/leaderboardDomainCache';
import {
  clearCachedProfileAvatar,
  readCachedProfileAvatar,
  rememberProfileAvatar,
} from '@/lib/profileAvatarCache';

function shortWallet(wallet: string): string {
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4).toUpperCase()}`;
}

function nodeWallet(wallet: string): string {
  if (wallet.length < 10) return wallet;
  return `0x${wallet.slice(2, 5).toUpperCase()}…${wallet.slice(-3).toUpperCase()}`;
}

const NON_INTERACTIVE_IMAGE_STYLE = {
  pointerEvents: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
} as CSSProperties;

export const NetworkWalletIdentity = memo(function NetworkWalletIdentity({
  address,
  root = false,
  showLabel = true,
  size,
}: {
  address: string;
  root?: boolean;
  showLabel?: boolean;
  size?: number;
}) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const fallbackUrl = useMemo(() => getPicassoImage(address), [address]);
  const [shouldLoad, setShouldLoad] = useState(root);
  const [displayUrl, setDisplayUrl] = useState<string | null>(() =>
    readCachedProfileAvatar(address),
  );
  const [showFallback, setShowFallback] = useState(false);
  const [displayDomain, setDisplayDomain] = useState<string | null | undefined>(
    () => readCachedLeaderboardDomain(address),
  );
  const shouldResolveDomain =
    shouldLoad &&
    (
      root ||
      displayDomain === undefined ||
      (displayDomain === null && Boolean(displayUrl))
    );
  const {
    data: domainInfo,
    isLoading: domainLoading,
    isError: domainError,
    isSuccess: domainSuccess,
  } = useVechainDomain(
    shouldResolveDomain ? address : undefined,
  );
  const queriedDomain =
    typeof domainInfo?.domain === 'string' && domainInfo.domain.trim()
      ? domainInfo.domain.trim()
      : null;
  const resolvedDomain =
    displayDomain !== undefined
      ? displayDomain
      : shouldResolveDomain && domainSuccess
        ? queriedDomain
        : null;
  const domain = resolvedDomain ?? '';
  const {
    data: profileAvatarUrl,
    isLoading: avatarLoading,
    isError: avatarError,
    isSuccess: avatarSuccess,
  } = useGetAvatar(shouldLoad ? domain : '');
  const resolvedSize = size ?? (root ? 42 : 34);

  useEffect(() => {
    // Keep the last verified identity painted immediately. Prominent root
    // identities still revalidate their VeWorld domain in the background.
    setDisplayUrl(readCachedProfileAvatar(address));
    setShowFallback(false);
    setDisplayDomain(readCachedLeaderboardDomain(address));
    setShouldLoad(root);
  }, [address, root]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || shouldLoad) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: '120px' });
    observer.observe(host);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    if (!shouldResolveDomain || domainLoading || domainError || !domainSuccess) {
      return;
    }
    rememberLeaderboardDomain(address, queriedDomain);
    setDisplayDomain(queriedDomain);
  }, [
    address,
    domainError,
    domainLoading,
    domainSuccess,
    queriedDomain,
    shouldResolveDomain,
  ]);

  useEffect(() => {
    if (!shouldLoad) return;

    if (shouldResolveDomain) {
      if (domainLoading) return;
      if (domainError || !domainSuccess) {
        if (!displayUrl) setShowFallback(true);
        return;
      }
    }

    if (!domain) {
      // Only a successful no-domain resolution may invalidate a previously
      // verified profile avatar. Transient lookup failures preserve it.
      if (!shouldResolveDomain || domainSuccess) {
        clearCachedProfileAvatar(address);
        setDisplayUrl(null);
        setShowFallback(true);
      }
      return;
    }

    if (avatarLoading) return;
    if (avatarError || !avatarSuccess) {
      if (!displayUrl) setShowFallback(true);
      return;
    }

    if (!profileAvatarUrl) {
      clearCachedProfileAvatar(address);
      setDisplayUrl(null);
      setShowFallback(true);
      return;
    }

    if (profileAvatarUrl === displayUrl) {
      rememberProfileAvatar(address, profileAvatarUrl);
      setShowFallback(false);
      return;
    }

    let active = true;
    const requestAddress = address;
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      if (!active || requestAddress !== address) return;
      rememberProfileAvatar(requestAddress, profileAvatarUrl);
      setDisplayUrl(profileAvatarUrl);
      setShowFallback(false);
    };
    image.onerror = () => {
      if (!active || requestAddress !== address) return;
      // A failed CDN/image read must never replace a previously verified
      // profile image. With no verified image, fail open to Picasso.
      if (!displayUrl) setShowFallback(true);
    };
    image.src = profileAvatarUrl;

    return () => {
      active = false;
    };
  }, [
    address,
    avatarError,
    avatarLoading,
    avatarSuccess,
    displayUrl,
    domain,
    domainError,
    domainLoading,
    domainSuccess,
    profileAvatarUrl,
    shouldLoad,
    shouldResolveDomain,
  ]);

  const visibleUrl = displayUrl || (showFallback ? fallbackUrl : null);
  const imageClassName = displayUrl ? 'profileAvatar' : 'neutralAvatar';

  return (
    <span className="identity" ref={hostRef}>
      <span
        className="avatarSlot"
        style={{ width: resolvedSize, height: resolvedSize }}
      >
        {visibleUrl ? (
          <img
            className={imageClassName}
            src={visibleUrl}
            alt=""
            aria-hidden="true"
            loading={root ? 'eager' : 'lazy'}
            decoding="async"
            referrerPolicy="no-referrer"
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            onContextMenu={(event) => event.preventDefault()}
            onError={() => {
              if (!displayUrl) return;
              setDisplayUrl(null);
              setShowFallback(true);
            }}
            style={{
              ...NON_INTERACTIVE_IMAGE_STYLE,
              width: resolvedSize,
              height: resolvedSize,
              objectFit: 'contain',
            }}
          />
        ) : (
          <span
            className="neutralAvatar avatarPending"
            aria-hidden="true"
            style={{
              ...NON_INTERACTIVE_IMAGE_STYLE,
              width: resolvedSize,
              height: resolvedSize,
            }}
          />
        )}
      </span>
      {showLabel ? (
        <span
          className="identityLabel"
          dir={domain ? 'auto' : 'ltr'}
          title={domain || address}
        >
          {domain || shortWallet(address)}
        </span>
      ) : null}
    </span>
  );
});

export const NetworkWalletLabel = memo(function NetworkWalletLabel({
  address,
}: {
  address: string;
}) {
  const [domainState, setDomainState] = useState<{
    address: string;
    domain: string | null | undefined;
  }>(() => ({
    address,
    domain: readCachedLeaderboardDomain(address),
  }));
  const cachedDomain =
    domainState.address === address
      ? domainState.domain
      : readCachedLeaderboardDomain(address);
  const shouldResolveDomain = cachedDomain === undefined;
  const {
    data: domainInfo,
    isLoading: domainLoading,
    isError: domainError,
    isSuccess: domainSuccess,
  } = useVechainDomain(
    shouldResolveDomain ? address : undefined,
  );
  const queriedDomain =
    typeof domainInfo?.domain === 'string' && domainInfo.domain.trim()
      ? domainInfo.domain.trim()
      : null;
  const resolvedDomain =
    cachedDomain !== undefined
      ? cachedDomain
      : domainSuccess
        ? queriedDomain
        : null;

  useEffect(() => {
    setDomainState({
      address,
      domain: readCachedLeaderboardDomain(address),
    });
  }, [address]);

  useEffect(() => {
    if (
      !shouldResolveDomain ||
      domainLoading ||
      domainError ||
      !domainSuccess
    ) {
      return;
    }
    rememberLeaderboardDomain(address, queriedDomain);
    setDomainState((current) =>
      current.address === address
        ? { address, domain: queriedDomain }
        : current
    );
  }, [
    address,
    domainError,
    domainLoading,
    domainSuccess,
    queriedDomain,
    shouldResolveDomain,
  ]);

  return <>{formatCompactVechainDomain(resolvedDomain) || nodeWallet(address)}</>;
});
