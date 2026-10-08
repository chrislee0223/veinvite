import type { Metadata } from 'next';

import { InviteeClient } from '@/components/InviteeClient';
import { ReferralWalletBootstrapBoundary } from '@/components/ReferralWalletBootstrapBoundary';
import { WalletSessionGate } from '@/components/WalletSessionGate';
import { readWalletSessionBootstrap } from '@/lib/walletSessionBootstrapServer';

const SITE_URL = 'https://veinvite.vercel.app';
const TITLE = "You've been invited to VeInvite";
const DESCRIPTION =
  'Join VeInvite, complete missions, and start earning B3TR on VeBetterDAO.';
const CARD_ALT =
  "You've been invited to VeInvite — Join. Verify. Earn B3TR.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const encodedCode = encodeURIComponent(code.trim());
  const pageUrl = `${SITE_URL}/i/${encodedCode}`;
  const imageUrl = `${SITE_URL}/veinvite-og-invite-final.png`;

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
      >
        <InviteeClient code={normalizedCode} />
      </WalletSessionGate>
    </ReferralWalletBootstrapBoundary>
  );
}
