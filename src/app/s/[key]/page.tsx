import type { Metadata } from 'next';

import { PermanentReferralClient } from '@/components/PermanentReferralClient';
import { WalletSessionGate } from '@/components/WalletSessionGate';

const SITE_URL = 'https://veinvite.vercel.app';
const CARD_ALT = 'VeInvite — Invite friends and earn B3TR';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  const encodedKey = encodeURIComponent(key.trim());
  const pageUrl = `${SITE_URL}/s/${encodedKey}`;
  const imageUrl = `${pageUrl}/opengraph-image`;

  return {
    title: 'VeInvite',
    description:
      'Invite your friends through VeInvite and help them get started with VeBetterDAO.',
    openGraph: {
      title: 'VeInvite',
      description:
        'Invite your friends through VeInvite and help them get started with VeBetterDAO.',
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
      title: 'VeInvite',
      description:
        'Invite your friends through VeInvite and help them get started with VeBetterDAO.',
      images: [imageUrl],
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
