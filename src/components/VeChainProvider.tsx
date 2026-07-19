


'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';

const VeChainKitProvider = dynamic(
  () => import('@vechain/vechain-kit').then((mod) => mod.VeChainKitProvider),
  { ssr: false },
);

export function VeChainProvider({ children }: { children: ReactNode }) {
  const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const privyClientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID;

  const appUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'https://veinvite.vercel.app';

  const allowedWallets = walletConnectProjectId
    ? ['veworld', 'wallet-connect']
    : ['veworld'];

  const dappKit: Record<string, unknown> = { allowedWallets };

  if (walletConnectProjectId) {
    dappKit.walletConnectOptions = {
      projectId: walletConnectProjectId,
      metadata: {
        name: 'VeInvite',
        description: 'Verified onboarding for the VeBetterDAO ecosystem.',
        url: appUrl,
        icons: [`${appUrl}/icon.svg`],
      },
    };
  }

  const privy =
    privyAppId && privyClientId
      ? {
          appId: privyAppId,
          clientId: privyClientId,
          loginMethods: ['google', 'email'],
          appearance: {
            loginMessage: 'VeInvite에 로그인하세요',
            logo: `${appUrl}/icon.svg`,
          },
          embeddedWallets: { createOnLogin: 'all-users' },
        }
      : undefined;

  return (
    <VeChainKitProvider
      privy={privy as never}
      dappKit={dappKit as never}
      loginMethods={[
        { method: 'veworld', gridColumn: 4 },
        ...(walletConnectProjectId
          ? [{ method: 'wallet-connect' as const, gridColumn: 4 }]
          : []),
        ...(privy
          ? [
              { method: 'google' as const, gridColumn: 4 },
              { method: 'email' as const, gridColumn: 4 },
            ]
          : []),
      ]}
      darkMode
      network={{ type: (process.env.NEXT_PUBLIC_NETWORK_TYPE || 'test') as never }}
      theme={{ accent: '#7448ff' }}
      legalDocuments={{
        termsAndConditions: [
          {
            url: `${appUrl}/terms`,
            version: 1,
            required: true,
            displayName: 'VeInvite Terms',
          },
        ],
        privacyPolicy: [
          {
            url: `${appUrl}/privacy`,
            version: 1,
            required: true,
            displayName: 'VeInvite Privacy',
          },
        ],
      }}
    >
      {children}
    </VeChainKitProvider>
  );
}
