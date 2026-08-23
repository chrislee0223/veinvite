import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AppProviders } from '@/components/AppProviders';
import './globals.css';

const siteUrl = 'https://veinvite.vercel.app';
const title = 'VeInvite | Verified onboarding for VeBetterDAO';
const description =
  'VeInvite verifies referral onboarding using wallet entry history, qualifying VeBetter activity, and governance participation.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: 'VeInvite',
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
  },
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName: 'VeInvite',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppProviders>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
