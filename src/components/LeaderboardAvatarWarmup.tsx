'use client';

import { useEffect, useMemo } from 'react';
import {
  useGetAvatar,
  useVechainDomain,
} from '@vechain/vechain-kit';

import {
  readCachedLeaderboardDomain,
  rememberLeaderboardDomain,
} from '@/lib/leaderboardDomainCache';
import {
  readCachedProfileAvatar,
  rememberProfileAvatar,
} from '@/lib/profileAvatarCache';

function AvatarWarmProbe({ address }: { address: string }) {
  const alreadyCached = useMemo(
    () => Boolean(readCachedProfileAvatar(address)),
    [address],
  );
  const cachedDomain = useMemo(
    () => readCachedLeaderboardDomain(address),
    [address],
  );
  const shouldResolveDomain =
    !alreadyCached && cachedDomain === undefined;
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
  const domain =
    cachedDomain !== undefined
      ? cachedDomain ?? ''
      : shouldResolveDomain && domainSuccess
        ? queriedDomain ?? ''
        : '';
  const {
    data: profileAvatarUrl,
    isLoading: avatarLoading,
    isError: avatarError,
    isSuccess: avatarSuccess,
  } = useGetAvatar(
    !alreadyCached ? domain : '',
  );

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
  }, [
    address,
    domainError,
    domainLoading,
    domainSuccess,
    queriedDomain,
    shouldResolveDomain,
  ]);

  useEffect(() => {
    if (alreadyCached) return;
    if (shouldResolveDomain) {
      if (domainLoading || domainError || !domainSuccess) return;
    }
    if (!domain || avatarLoading || avatarError || !avatarSuccess) return;
    if (!profileAvatarUrl) return;

    let active = true;
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      if (!active) return;
      rememberProfileAvatar(address, profileAvatarUrl);
    };
    image.src = profileAvatarUrl;

    return () => {
      active = false;
    };
  }, [
    address,
    alreadyCached,
    avatarError,
    avatarLoading,
    avatarSuccess,
    domain,
    domainError,
    domainLoading,
    domainSuccess,
    profileAvatarUrl,
    shouldResolveDomain,
  ]);

  return null;
}

export function LeaderboardAvatarWarmup({
  addresses,
}: {
  addresses: string[];
}) {
  const uniqueAddresses = useMemo(
    () => Array.from(new Set(
      addresses
        .map((address) => address.trim().toLowerCase())
        .filter((address) => /^0x[0-9a-f]{40}$/.test(address)),
    )).slice(0, 6),
    [addresses],
  );

  return (
    <>
      {uniqueAddresses.map((address) => (
        <AvatarWarmProbe key={address} address={address} />
      ))}
    </>
  );
}
