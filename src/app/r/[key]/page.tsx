import type { Metadata } from 'next';

import { PermanentReferralClient } from '@/components/PermanentReferralClient';
import { WalletSessionGate } from '@/components/WalletSessionGate';

const SITE_URL = 'https://veinvite.vercel.app';
const TITLE = "You've been invited to VeInvite";
const DESCRIPTION =
  'Join VeInvite, complete missions, and start earning B3TR on VeBetterDAO.';
const CARD_ALT =
  "You've been invited to VeInvite — Join. Verify. Earn B3TR.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  const encodedKey = encodeURIComponent(key.trim());
  const pageUrl = `${SITE_URL}/r/${encodedKey}`;
  const imageUrl = `${pageUrl}/opengraph-image`;

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
  const { key } = await params;

  return (
    <WalletSessionGate>
      <PermanentReferralClient referralKey={key.trim()} />
    </WalletSessionGate>
  );
}
