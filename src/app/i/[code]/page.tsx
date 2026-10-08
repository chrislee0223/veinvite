import type { Metadata } from 'next';

import { InviteeClient } from '@/components/InviteeClient';
import { ReferralWalletBootstrapBoundary } from '@/components/ReferralWalletBootstrapBoundary';
import { WalletSessionGate } from '@/components/WalletSessionGate';
import {
  buildProductionSharePageUrl,
  INVITE_OG_IMAGE_URL,
} from '@/lib/socialShareCard';
import { readWalletSessionBootstrap } from '@/lib/walletSessionBootstrapServer';

const TITLE = 'Join VeInvite';
const DESCRIPTION =
  'Verify. Explore. Earn B3TR. Complete missions and start earning rewards.';
const CARD_ALT =
  'Join VeInvite — Verify. Explore. Earn B3TR.';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const pageUrl = buildProductionSharePageUrl('i', code);
  const imageUrl = INVITE_OG_IMAGE_URL;

  return {
    title: TITLE,
    description: DESCRIPTION,
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: pageUrl,
      siteName: 'VeInvite',
      type: 'website',
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 600,
          alt: CARD_ALT,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: TITLE,
      description: DESCRIPTION,
      images: [imageUrl],
    },
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    },
  };
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const [{ code }, bootstrap] = await Promise.all([
    params,
    readWalletSessionBootstrap(),
  ]);
  const normalizedCode = code.toUpperCase();

  return (
    <ReferralWalletBootstrapBoundary
      initialSessionWallet={bootstrap.initialSessionWallet}
    >
      <WalletSessionGate
        initialSessionWallet={bootstrap.initialSessionWallet}
        initialRestrictionKind={bootstrap.initialRestrictionKind}
        initialLegalConsentStatus={bootstrap.initialLegalConsentStatus}
      >
        <InviteeClient code={normalizedCode} />
      </WalletSessionGate>
    </ReferralWalletBootstrapBoundary>
  );
}
