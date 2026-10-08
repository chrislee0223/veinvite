import type { Metadata } from 'next';

import { PermanentReferralClient } from '@/components/PermanentReferralClient';
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
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  const pageUrl = buildProductionSharePageUrl('r', key);
  const imageUrl = INVITE_OG_IMAGE_URL;

  return {
    title: TITLE,
    description: DESCRIPTION,
    twitter: {
      card: 'summary_large_image',
      title: TITLE,
      description: DESCRIPTION,
      images: [imageUrl],
    },
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

export default async function PermanentReferralPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const [{ key }, bootstrap] = await Promise.all([
    params,
    readWalletSessionBootstrap(),
  ]);

  return (
    <ReferralWalletBootstrapBoundary
      initialSessionWallet={bootstrap.initialSessionWallet}
    >
      <WalletSessionGate
        initialSessionWallet={bootstrap.initialSessionWallet}
        initialRestrictionKind={bootstrap.initialRestrictionKind}
        initialLegalConsentStatus={bootstrap.initialLegalConsentStatus}
      >
        <PermanentReferralClient referralKey={key.trim()} />
      </WalletSessionGate>
    </ReferralWalletBootstrapBoundary>
  );
}
