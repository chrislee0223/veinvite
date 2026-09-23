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
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const [displayDomain, setDisplayDomain] = useState<string | null | undefined>(
    () => readCachedLeaderboardDomain(address),
  );
  const shouldResolveDomain = shouldLoad && displayDomain === undefined;
  const { data: domainInfo, isLoading: domainLoading } = useVechainDomain(
    shouldResolveDomain ? address : undefined,
  );
  const queriedDomain =
    typeof domainInfo?.domain === 'string' && domainInfo.domain.trim()
      ? domainInfo.domain.trim()
      : null;
  const resolvedDomain =
    displayDomain !== undefined
      ? displayDomain
      : shouldResolveDomain && !domainLoading
        ? queriedDomain
        : null;
  const domain = resolvedDomain ?? '';
  const { data: avatarUrl } = useGetAvatar(domain);
  const resolvedSize = size ?? (root ? 42 : 34);

  useEffect(() => {
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
    if (!shouldResolveDomain || domainLoading) return;
    rememberLeaderboardDomain(address, queriedDomain);
    setDisplayDomain(queriedDomain);
  }, [
    address,
    domainLoading,
    queriedDomain,
    shouldResolveDomain,
  ]);

  useEffect(() => {
    setLoaded(false);
    setBroken(false);
  }, [avatarUrl]);

  return (
    <span className="identity" ref={hostRef}>
      <span
        className="avatarSlot"
        style={{ width: resolvedSize, height: resolvedSize }}
      >
        <img
          className="neutralAvatar"
          src={fallbackUrl}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onContextMenu={(event) => event.preventDefault()}
          style={{
            ...NON_INTERACTIVE_IMAGE_STYLE,
            width: resolvedSize,
            height: resolvedSize,
          }}
        />
        {avatarUrl && !broken ? (
          <img
            className="profileAvatar"
            src={avatarUrl}
            alt=""
            loading={root ? 'eager' : 'lazy'}
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            onError={() => setBroken(true)}
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            onContextMenu={(event) => event.preventDefault()}
            style={{
              ...NON_INTERACTIVE_IMAGE_STYLE,
              width: resolvedSize,
              height: resolvedSize,
              opacity: loaded ? 1 : 0,
            }}
          />
        ) : null}
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
  const { data: domainInfo, isLoading: domainLoading } = useVechainDomain(
    shouldResolveDomain ? address : undefined,
  );
  const queriedDomain =
    typeof domainInfo?.domain === 'string' && domainInfo.domain.trim()
      ? domainInfo.domain.trim()
      : null;
  const resolvedDomain =
    cachedDomain !== undefined
      ? cachedDomain
      : !domainLoading
        ? queriedDomain
        : null;

  useEffect(() => {
    setDomainState({
      address,
      domain: readCachedLeaderboardDomain(address),
    });
  }, [address]);

  useEffect(() => {
    if (!shouldResolveDomain || domainLoading) return;
    rememberLeaderboardDomain(address, queriedDomain);
    setDomainState((current) =>
      current.address === address
        ? { address, domain: queriedDomain }
        : current
    );
  }, [
    address,
    domainLoading,
    queriedDomain,
    shouldResolveDomain,
  ]);

  return <>{formatCompactVechainDomain(resolvedDomain) || nodeWallet(address)}</>;
});
