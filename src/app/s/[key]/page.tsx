import type { Metadata } from 'next';

import { PermanentReferralClient } from '@/components/PermanentReferralClient';
import { WalletSessionGate } from '@/components/WalletSessionGate';

const SITE_URL = 'https://veinvite.vercel.app';
const TITLE = 'A friend earned B3TR with VeInvite';
const DESCRIPTION =
  'See how referrals turn into rewards. Join VeInvite on VeBetterDAO.';
const CARD_ALT =
  'A friend earned B3TR with VeInvite — Join. Verify. Invite. Earn.';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  const encodedKey = encodeURIComponent(key.trim());
  const pageUrl = `${SITE_URL}/s/${encodedKey}`;
  const imageUrl = `${SITE_URL}/veinvite-og-reward-final.png`;

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
