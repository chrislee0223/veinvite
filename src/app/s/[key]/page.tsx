import type { Metadata } from 'next';

import { PermanentReferralClient } from '@/components/PermanentReferralClient';
import { WalletSessionGate } from '@/components/WalletSessionGate';
import {
  buildProductionSharePageUrl,
  REWARD_OG_IMAGE_URL,
} from '@/lib/socialShareCard';

const TITLE = 'Earn B3TR with VeInvite';
const DESCRIPTION =
  'Invite. Verify. Earn. Turn genuine referrals into B3TR rewards.';
const CARD_ALT =
  'Earn B3TR with VeInvite — Invite. Verify. Earn.';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  const pageUrl = buildProductionSharePageUrl('s', key);
  const imageUrl = REWARD_OG_IMAGE_URL;

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

export default async function SocialReferralPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  return (
    <WalletSessionGate>
      <PermanentReferralClient referralKey={key.trim()} />
    </WalletSessionGate>
  );
}
