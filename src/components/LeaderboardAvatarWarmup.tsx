'use client';

import { useEffect, useMemo } from 'react';
import {
  useGetAvatar,
  useVechainDomain,
} from '@vechain/vechain-kit';
import { getPicassoImage } from '@vechain/vechain-kit/utils';

const AVATAR_PROFILE_CACHE_TTL_MS = 15 * 60_000;
const AVATAR_PROFILE_CACHE_KEY = 'veinvite_leaderboard_profile_avatar_v1';

type StoredProfileAvatar = {
  url: string;
  savedAt: number;
};

type StoredProfileAvatarMap = Record<string, StoredProfileAvatar>;

function avatarKey(address: string): string {
  return address.trim().toLowerCase();
}

function hasUsableCachedAvatar(address: string): boolean {
  if (typeof window === 'undefined') return false;
  const key = avatarKey(address);
  try {
    const raw = window.sessionStorage.getItem(AVATAR_PROFILE_CACHE_KEY);
    if (!raw) return false;
    const stored = JSON.parse(raw) as StoredProfileAvatarMap;
    const entry = stored[key];
    return Boolean(
      entry &&
      typeof entry.url === 'string' &&
      entry.url &&
      typeof entry.savedAt === 'number' &&
      Date.now() - entry.savedAt <= AVATAR_PROFILE_CACHE_TTL_MS,
    );
  } catch {
    return false;
  }
}

function rememberAvatar(address: string, url: string): void {
  if (typeof window === 'undefined') return;
  const key = avatarKey(address);
  try {
    const raw = window.sessionStorage.getItem(AVATAR_PROFILE_CACHE_KEY);
    const stored = raw
      ? (JSON.parse(raw) as StoredProfileAvatarMap)
      : {};
    stored[key] = { url, savedAt: Date.now() };
    window.sessionStorage.setItem(
      AVATAR_PROFILE_CACHE_KEY,
      JSON.stringify(stored),
    );
  } catch {
    // Avatar warmup is optional and never blocks leaderboard rendering.
  }
}

function AvatarWarmProbe({ address }: { address: string }) {
  const alreadyCached = useMemo(
    () => hasUsableCachedAvatar(address),
    [address],
  );
  const fallbackUrl = useMemo(() => getPicassoImage(address), [address]);
  const { data: domainInfo, isLoading: domainLoading } = useVechainDomain(
    alreadyCached ? undefined : address,
  );
  const domain = domainInfo?.domain ?? '';
  const { data: profileAvatarUrl, isLoading: avatarLoading } = useGetAvatar(domain);

  useEffect(() => {
    if (alreadyCached || domainLoading) return;
    if (domain && avatarLoading) return;

    const resolvedUrl = profileAvatarUrl || fallbackUrl;
    if (!resolvedUrl) return;

    let active = true;
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      if (!active) return;
      rememberAvatar(address, resolvedUrl);
    };
    image.onerror = () => {
      if (!active || resolvedUrl === fallbackUrl) return;
      const fallbackImage = new Image();
      fallbackImage.referrerPolicy = 'no-referrer';
      fallbackImage.onload = () => {
        if (active) rememberAvatar(address, fallbackUrl);
      };
      fallbackImage.src = fallbackUrl;
    };
    image.src = resolvedUrl;

    return () => {
      active = false;
    };
  }, [
    address,
    alreadyCached,
    avatarLoading,
    domain,
    domainLoading,
    fallbackUrl,
    profileAvatarUrl,
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
